// Cloudflare Worker for humphreysbus.app.
//
// Responsibilities:
//   1. Serve the static PWA (assets binding, wired in wrangler.jsonc).
//   2. Proxy Mapbox Directions API for runtime geolocation walk legs
//      (Roadmap Phase 3). The Mapbox token stays server-side; the client
//      never sees it.
//   3. Proxy Mapbox Geocoding v6 for free-text origin search (Roadmap
//      Phase 5 step 2 — "type any place on post" origin picker).
//
// GET /api/walk?flat=<>&flon=<>&tlat=<>&tlon=<>&lang=<en|ko>
//   → 200 { seconds, meters, steps, source: "mapbox" }
//     - steps: [{ instruction, distance, duration }] — Mapbox pedestrian
//       maneuvers in the requested language (en default). Empty array if
//       Mapbox returned no legs (defensive; not observed in practice).
//   → 502 on Mapbox failure (client falls back to haversine)
//   → 400 on malformed input
//
// GET /api/search?q=<>&lang=<en|ko>
//   → 200 { results: [{ id, name, full, lat, lon }], source: "mapbox-geocoding-v6" }
//   → 502 on Mapbox failure  → 400 on malformed / off-post-bbox input
//
// Edge cache: keyed on the request URL (walk already coord-rounded by the
// client to a ~30 m grid; search cached verbatim). 30-day TTL for walk
// (sidewalks don't move); 1-day TTL for search (business names change).
// A coord/hash refresh upstream rotates the client's cache-key prefix
// and self-invalidates.

const MAPBOX_DIRECTIONS = "https://api.mapbox.com/directions/v5/mapbox/walking";
const MAPBOX_GEOCODE = "https://api.mapbox.com/search/geocode/v6/forward";
const EDGE_TTL_S = 60 * 60 * 24 * 30; // 30 days (walk)
const SEARCH_EDGE_TTL_S = 60 * 60 * 24; // 1 day (search)

// Camp Humphreys bbox: shared by /api/walk on-post gate and /api/search
// result-clamp. Derived from stop_coords.json extents + small pad for GPS
// jitter at the gates. Off-post pairs/queries never round-trip Mapbox.
const HUMPHREYS_BBOX = { minLat: 36.945, maxLat: 36.980, minLon: 126.985, maxLon: 127.045 };
const HUMPHREYS_BBOX_STR = `${HUMPHREYS_BBOX.minLon},${HUMPHREYS_BBOX.minLat},${HUMPHREYS_BBOX.maxLon},${HUMPHREYS_BBOX.maxLat}`;
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": `public, max-age=${EDGE_TTL_S}, s-maxage=${EDGE_TTL_S}`,
      ...CORS_HEADERS,
      ...extraHeaders,
    },
  });
}

function badRequest(msg) {
  return new Response(JSON.stringify({ error: msg }), {
    status: 400,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

function parseCoord(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function inHumphreysBbox(lat, lon) {
  return lat >= HUMPHREYS_BBOX.minLat && lat <= HUMPHREYS_BBOX.maxLat
    && lon >= HUMPHREYS_BBOX.minLon && lon <= HUMPHREYS_BBOX.maxLon;
}

const SUPPORTED_LANGS = new Set(["en", "ko"]);

// On-post OSM road names are bilingual (`11th Street/11번가`). Mapbox's
// turn-by-turn engine substitutes that verbatim into instructions in both
// locales, so the ko output ends up with English road names embedded and
// vice versa. Strip the non-matching half based on the requested lang; only
// rewrite when the two sides are actually cross-script (one Latin, one
// Hangul) so mixed slashes like "Family Mini Mall / Gas Station" pass
// through untouched.
const HANGUL_RE = /[가-힣]/;
const LATIN_RE = /[A-Za-z]/;
function stripBilingualPairs(text, lang) {
  return text.replace(/([^/]+)\/([^/]+)/g, (m, a, b) => {
    const aT = a.trim(), bT = b.trim();
    if (!aT || !bT) return m;
    const aKo = HANGUL_RE.test(aT), bKo = HANGUL_RE.test(bT);
    const aEn = LATIN_RE.test(aT), bEn = LATIN_RE.test(bT);
    const bilingual = (aKo && !aEn && bEn && !bKo) || (aEn && !aKo && bKo && !bEn);
    if (!bilingual) return m;
    // Keep the side matching the requested locale; preserve any leading /
    // trailing whitespace from the original capture so surrounding text
    // spacing (e.g. "on Foo/한.") isn't lost.
    const chosen = lang === "ko" ? (aKo ? aT : bT) : (aEn ? aT : bT);
    const leadingSpace = a.match(/^\s*/)[0];
    const trailingSpace = b.match(/\s*$/)[0];
    return `${leadingSpace}${chosen}${trailingSpace}`;
  });
}

// Streets/road names Mapbox uses for on-post named ways. Anything else in
// the `name` field is treated as an unnamed footpath and does not count as a
// "road change" for the purpose of summarizing steps.
function isGenericWay(name) {
  if (!name || typeof name !== "string") return true;
  const n = name.toLowerCase().trim();
  if (!n) return true;
  return n === "walkway" || n === "the walkway" || n === "footway" || n === "path" || n === "sidewalk";
}

// A meaningful maneuver from the walker's point of view: the maneuver type
// that always deserves a mention regardless of road context.
function isKeyManeuver(type, modifier) {
  if (type === "depart" || type === "arrive") return true;
  if (type === "roundabout" || type === "exit roundabout" || type === "fork") return true;
  if (typeof modifier === "string" && (modifier.includes("sharp") || modifier === "uturn")) return true;
  return false;
}

// Turn Mapbox's fine-grained step list into a short, walker-usable summary:
// only the maneuvers that change *something*  — the road you're on, a big
// bend, or the start/end of the walk. Skipped steps' distance + duration
// roll into the previous kept step so the on-screen numbers still reflect
// how far you walk before the next real turn.
function summarizeSteps(rawSteps) {
  if (!rawSteps.length) return [];
  const kept = [];
  let lastRoad = null;
  for (let i = 0; i < rawSteps.length; i++) {
    const step = rawSteps[i];
    const maneuver = step.maneuver || {};
    const instruction = maneuver.instruction;
    if (!instruction) continue;
    const type = maneuver.type;
    const modifier = maneuver.modifier;
    const road = isGenericWay(step.name) ? null : step.name.trim();
    const roadChange = road && road !== lastRoad;
    const isLast = i === rawSteps.length - 1;
    const keep = isLast || isKeyManeuver(type, modifier) || roadChange;
    const chunk = {
      instruction,
      distance: Math.round(step.distance ?? 0),
      duration: Math.round(step.duration ?? 0),
    };
    if (keep) {
      kept.push(chunk);
      if (road) lastRoad = road;
    } else if (kept.length > 0) {
      // Roll this minor step into the previous kept survivor so the walk
      // distance shown accounts for the whole segment between real turns.
      const prev = kept[kept.length - 1];
      prev.distance += chunk.distance;
      prev.duration += chunk.duration;
    } else {
      // No kept survivor yet — force-keep this step as the anchor rather
      // than lose distance from the start of the walk.
      kept.push(chunk);
      if (road) lastRoad = road;
    }
  }
  return kept;
}

function extractSteps(route, lang) {
  const raw = [];
  for (const leg of route.legs || []) {
    for (const step of leg.steps || []) {
      if (!step?.maneuver?.instruction) continue;
      raw.push(step);
    }
  }
  const kept = summarizeSteps(raw);
  return kept.map(s => ({ ...s, instruction: stripBilingualPairs(s.instruction, lang) }));
}

async function fetchMapboxWalk(fLat, fLon, tLat, tLon, token, publicOrigin, lang) {
  const langParam = SUPPORTED_LANGS.has(lang) ? lang : "en";
  const url = `${MAPBOX_DIRECTIONS}/${fLon},${fLat};${tLon},${tLat}`
    + `?geometries=geojson&overview=false&steps=true&language=${langParam}&access_token=${token}`;
  // Mapbox URL-restriction on public tokens matches the Referer header.
  const headers = publicOrigin ? { Referer: `${publicOrigin}/` } : {};
  const r = await fetch(url, { headers, cf: { cacheTtl: EDGE_TTL_S, cacheEverything: true } });
  if (!r.ok) throw new Error(`mapbox ${r.status}`);
  const body = await r.json();
  const route = body.routes?.[0];
  if (!route) throw new Error("no route");
  return {
    seconds: Math.round(route.duration),
    meters: Math.round(route.distance),
    steps: extractSteps(route, langParam),
  };
}

async function handleWalk(request, env, ctx) {
  const url = new URL(request.url);
  const fLat = parseCoord(url.searchParams.get("flat"));
  const fLon = parseCoord(url.searchParams.get("flon"));
  const tLat = parseCoord(url.searchParams.get("tlat"));
  const tLon = parseCoord(url.searchParams.get("tlon"));
  const lang = url.searchParams.get("lang") || "en";
  if (fLat == null || fLon == null || tLat == null || tLon == null) {
    return badRequest("flat, flon, tlat, tlon required");
  }
  // On-post-only directions is a product rule, not just a quota guard —
  // off-post pairs get a 400 so the client falls back to the haversine
  // mock rather than leaking a Korean-street turn-by-turn.
  if (!inHumphreysBbox(fLat, fLon) || !inHumphreysBbox(tLat, tLon)) {
    return badRequest("coords outside on-post area");
  }
  if (!env.MAPBOX_TOKEN) return json({ error: "server misconfigured" }, 500);

  // Edge-cache probe. The URL is already the cache key (coord-rounded on the
  // client), so a repeat cell hits cache without a Mapbox call.
  const cache = caches.default;
  const cacheKey = new Request(url.toString(), { method: "GET" });
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  try {
    const { seconds, meters, steps } = await fetchMapboxWalk(
      fLat, fLon, tLat, tLon, env.MAPBOX_TOKEN, env.PUBLIC_ORIGIN, lang,
    );
    const res = json({ seconds, meters, steps, source: "mapbox" });
    ctx.waitUntil(cache.put(cacheKey, res.clone()));
    return res;
  } catch (e) {
    // Log the real error server-side for `wrangler tail` diagnosis.
    // Client response stays canned so no stack trace leaks (CodeQL b95a6c5).
    console.error("mapbox walk failed:", e?.message || e);
    return json({ error: "upstream routing failed" }, 502);
  }
}

async function handleSearch(request, env, ctx) {
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") || "").trim();
  const lang = url.searchParams.get("lang") || "en";
  // 2-char minimum matches the client-side gate; keeps single-letter typos
  // out of Mapbox's quota. 100-char cap guards against pathological inputs
  // (Mapbox itself rejects longer, but we fail earlier without a round trip).
  if (q.length < 2) return badRequest("q must be at least 2 chars");
  if (q.length > 100) return badRequest("q too long");
  const langParam = SUPPORTED_LANGS.has(lang) ? lang : "en";
  if (!env.MAPBOX_TOKEN) return json({ error: "server misconfigured" }, 500);

  const cache = caches.default;
  const cacheKey = new Request(url.toString(), { method: "GET" });
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  // bbox hard-clamp keeps results on-post. Same rectangle handleWalk uses
  // as its coord gate — a hit here is a coord that also passes /api/walk.
  const mapboxUrl = `${MAPBOX_GEOCODE}`
    + `?q=${encodeURIComponent(q)}`
    + `&bbox=${HUMPHREYS_BBOX_STR}`
    + `&language=${langParam}`
    + `&limit=5`
    + `&access_token=${env.MAPBOX_TOKEN}`;
  const headers = env.PUBLIC_ORIGIN ? { Referer: `${env.PUBLIC_ORIGIN}/` } : {};
  try {
    const r = await fetch(mapboxUrl, {
      headers,
      cf: { cacheTtl: SEARCH_EDGE_TTL_S, cacheEverything: true },
    });
    if (!r.ok) throw new Error(`mapbox ${r.status}`);
    const body = await r.json();
    // Compact + defensive: drop features without a name or coords rather
    // than passing partial rows to the UI. Second bbox check catches the
    // rare case where Mapbox returns a proximity match slightly outside
    // the requested bbox (documented soft-clamp behavior).
    const results = (body.features || [])
      .map(f => {
        const p = f.properties || {};
        const coords = f.geometry?.coordinates;
        return {
          id: f.id || p.mapbox_id || "",
          name: p.name || p.name_preferred || "",
          full: p.full_address || p.place_formatted || "",
          lat: Array.isArray(coords) ? coords[1] : null,
          lon: Array.isArray(coords) ? coords[0] : null,
        };
      })
      .filter(row => row.name && row.lat != null && row.lon != null
        && inHumphreysBbox(row.lat, row.lon));

    const res = json(
      { results, source: "mapbox-geocoding-v6" },
      200,
      { "Cache-Control": `public, max-age=${SEARCH_EDGE_TTL_S}, s-maxage=${SEARCH_EDGE_TTL_S}` },
    );
    ctx.waitUntil(cache.put(cacheKey, res.clone()));
    return res;
  } catch (e) {
    // Log real error server-side for `wrangler tail`; client sees a canned
    // message (same posture as handleWalk — no stack leak).
    console.error("mapbox search failed:", e?.message || e);
    return json({ error: "upstream search failed" }, 502);
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    if (url.pathname === "/api/walk") {
      if (request.method !== "GET") return new Response("method not allowed", { status: 405 });
      return handleWalk(request, env, ctx);
    }
    if (url.pathname === "/api/search") {
      if (request.method !== "GET") return new Response("method not allowed", { status: 405 });
      return handleSearch(request, env, ctx);
    }
    // Non-API request: hand off to the static-assets binding (see wrangler.jsonc).
    return env.ASSETS.fetch(request);
  },
};

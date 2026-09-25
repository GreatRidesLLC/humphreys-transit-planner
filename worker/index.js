// Cloudflare Worker for humphreysbus.app.
//
// Two responsibilities:
//   1. Serve the static PWA (assets binding, wired in wrangler.jsonc).
//   2. Proxy Mapbox Directions API for runtime geolocation walk legs
//      (Roadmap Phase 3). The Mapbox token stays server-side; the client
//      never sees it.
//
// GET /api/walk?flat=<>&flon=<>&tlat=<>&tlon=<>&lang=<en|ko>
//   → 200 { seconds, meters, steps, source: "mapbox" }
//     - steps: [{ instruction, distance, duration }] — Mapbox pedestrian
//       maneuvers in the requested language (en default). Empty array if
//       Mapbox returned no legs (defensive; not observed in practice).
//   → 502 on Mapbox failure (client falls back to haversine)
//   → 400 on malformed input
//
// Edge cache: keyed on the request URL (already coord-rounded by the client
// to a ~30 m grid). 30-day TTL — sidewalks don't move; a coord refresh
// upstream rotates the client's cache-key prefix and self-invalidates.

const MAPBOX_DIRECTIONS = "https://api.mapbox.com/directions/v5/mapbox/walking";
const EDGE_TTL_S = 60 * 60 * 24 * 30; // 30 days
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

const SUPPORTED_LANGS = new Set(["en", "ko"]);

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

function extractSteps(route) {
  const raw = [];
  for (const leg of route.legs || []) {
    for (const step of leg.steps || []) {
      if (!step?.maneuver?.instruction) continue;
      raw.push(step);
    }
  }
  return summarizeSteps(raw);
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
    steps: extractSteps(route),
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
  // Camp Humphreys bbox (derived from stop_coords.json + small pad for GPS
  // jitter at gates). On-post-only directions is a product rule, not just a
  // quota guard — off-post pairs get a 400 so the client falls back to the
  // haversine mock rather than leaking a Korean-street turn-by-turn.
  const inBox = (lat, lon) => lat >= 36.945 && lat <= 36.980 && lon >= 126.985 && lon <= 127.045;
  if (!inBox(fLat, fLon) || !inBox(tLat, tLon)) {
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
    // Non-API request: hand off to the static-assets binding (see wrangler.jsonc).
    return env.ASSETS.fetch(request);
  },
};

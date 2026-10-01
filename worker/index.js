// Cloudflare Worker for humphreysbus.app.
//
// Responsibilities:
//   1. Serve the static PWA (assets binding, wired in wrangler.jsonc).
//   2. Proxy Mapbox Directions API for runtime geolocation walk legs
//      (Roadmap Phase 3). The Mapbox token stays server-side; the client
//      never sees it.
//   3. Proxy Mapbox Search Box forward search for free-text origin search
//      (Roadmap Phase 5 step 2 — "type any place on post" origin picker).
//      Search Box, not Geocoding v6: v6 indexes addresses and streets only,
//      so on-post POIs (Commissary, Starbucks, the hospital) never matched.
//
// GET /api/walk?flat=<>&flon=<>&tlat=<>&tlon=<>&lang=<en|ko>
//   → 200 { seconds, meters, steps, via, alternatives, source: "mapbox" }
//     - via: the named road the route spends the most distance on
//     - alternatives: [{ seconds, meters, steps, via }], other Mapbox routes
//       (same request) whose main road differs from the primary's
//     - steps: [{ instruction, distance, duration }] — Mapbox pedestrian
//       maneuvers in the requested language (en default). Empty array if
//       Mapbox returned no legs (defensive; not observed in practice).
//   → 502 on Mapbox failure (client falls back to haversine)
//   → 400 on malformed input
//
// GET /api/search?q=<>&lang=<en|ko>
//   → 200 { results: [{ id, name, full, lat, lon }], source: "mapbox-searchbox-v1" }
//   → 502 on Mapbox failure  → 400 on malformed / off-post-bbox input
//
// POST /api/e   { e, lang, p1?, p2?, p3? }  → 204
//   Anonymous usage event (Workers Analytics Engine, dataset htp_events).
//   No cookies, no IPs, no user IDs. See recordEvent for the layout.
//
// Edge cache: keyed on the request URL (walk already coord-rounded by the
// client to a ~30 m grid; search cached verbatim). 30-day TTL for walk
// (sidewalks don't move); 1-day TTL for search (business names change).
// A coord/hash refresh upstream rotates the client's cache-key prefix
// and self-invalidates.

import { extractSteps, mainRoad } from "./steps.js";

const MAPBOX_DIRECTIONS = "https://api.mapbox.com/directions/v5/mapbox/walking";
const MAPBOX_SEARCH = "https://api.mapbox.com/search/searchbox/v1/forward";
const EDGE_TTL_S = 60 * 60 * 24 * 30; // 30 days (walk)
const SEARCH_EDGE_TTL_S = 60 * 60 * 24; // 1 day (search)

// Camp Humphreys bbox: shared by /api/walk on-post gate and /api/search
// result-clamp. Derived from stop_coords.json extents + small pad for GPS
// jitter at the gates. Off-post pairs/queries never round-trip Mapbox.
const HUMPHREYS_BBOX = { minLat: 36.945, maxLat: 36.980, minLon: 126.985, maxLon: 127.045 };
const HUMPHREYS_BBOX_STR = `${HUMPHREYS_BBOX.minLon},${HUMPHREYS_BBOX.minLat},${HUMPHREYS_BBOX.maxLon},${HUMPHREYS_BBOX.maxLat}`;
// Search Box biases toward the caller's IP when proximity is omitted. The
// caller is a Cloudflare edge node, often outside Korea, and that bias drops
// real on-post hits (the hospital vanished), so pin it to the bbox centre.
const HUMPHREYS_CENTER_STR = `${(HUMPHREYS_BBOX.minLon + HUMPHREYS_BBOX.maxLon) / 2},${(HUMPHREYS_BBOX.minLat + HUMPHREYS_BBOX.maxLat) / 2}`;

// Cost guards. Every Mapbox call is billed, so the Worker bounds what a
// cache-busting client can make it spend:
//   - Walk endpoints are snapped server-side to the same ~30 m grid the
//     client uses (walk-runtime.js roundCell), so jittered coords collapse
//     onto one cache entry instead of minting a fresh billed pair each time.
//   - Pairs further apart than MAX_WALK_M are refused. The client only asks
//     for stops within a 10-min walk, a 15-min walk-only trip, or an OSM
//     building's nearest stop (capped at 2 km), so nothing legit is longer.
//   - API_LIMITER (wrangler.jsonc) caps upstream Mapbox calls per client IP.
//     It is only consulted on an edge-cache miss: cached answers cost nothing
//     and are never throttled. A 429 is handled like any failure by the
//     client (haversine walk, local-only search).
const LAT_CELL = 0.00027;
const LON_CELL = 0.00034;
const MAX_WALK_M = 2500;

function snap(v, cell) {
  return Number((Math.round(v / cell) * cell).toFixed(6));
}

function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// true when this client may make another billed upstream call. Fails open
// if the binding is missing (local dev without it) or the limiter errors:
// the limiter is a guard, never a reason to break the app.
async function underUpstreamLimit(request, env) {
  if (!env.API_LIMITER) return true;
  const ip = request.headers.get("cf-connecting-ip") || "unknown";
  try {
    const { success } = await env.API_LIMITER.limit({ key: ip });
    return success;
  } catch {
    return true;
  }
}

function tooMany() {
  return new Response(JSON.stringify({ error: "rate limited" }), {
    status: 429,
    headers: { "Content-Type": "application/json", "Retry-After": "60", ...CORS_HEADERS },
  });
}

// ─── Usage analytics (Workers Analytics Engine) ──────────────────────────────
// One data point per event, dataset htp_events (binding EVENTS):
//   index1  event name
//   blob1   event   blob2 audience   blob3 lang   blob4 country
//   blob5   p1      blob6 p2         blob7 p3
//   double1 1 (count; query with sum(_sample_interval))
// audience: "dev" (the developer's devices, marked once via a private link),
// "preview" (any *.workers.dev host), else "user". Country comes from
// Cloudflare (a Korea visit is the best available stand-in for on-post).
// Mapbox upstream calls are logged here too (event "mapbox", p1 = walk |
// search, p2 = hit | billed | limited | error) so billed usage can be read
// without Mapbox's statistics API.
const EVENT_NAMES = new Set([
  "open", "tab", "plan", "place_pick", "side_pick", "route_pick", "feedback", "sorry",
]);
const PROP_MAX = 64;

function audienceOf(request) {
  const host = new URL(request.url).hostname;
  if (host.endsWith(".workers.dev") || host === "localhost" || host === "127.0.0.1") return "preview";
  return request.headers.get("x-htp-aud") === "dev" ? "dev" : "user";
}

function clip(v) {
  return typeof v === "string" ? v.slice(0, PROP_MAX) : "";
}

function recordEvent(env, request, event, { lang = "", p1 = "", p2 = "", p3 = "" } = {}) {
  if (!env.EVENTS) return;
  try {
    env.EVENTS.writeDataPoint({
      indexes: [event],
      blobs: [event, audienceOf(request), clip(lang), request.cf?.country || "", clip(p1), clip(p2), clip(p3)],
      doubles: [1],
    });
  } catch (e) {
    console.error("analytics write failed:", e?.message || e);
  }
}

async function handleEvent(request, env) {
  let body;
  try {
    const text = await request.text();
    if (text.length > 1024) return new Response(null, { status: 413 });
    body = JSON.parse(text);
  } catch {
    return badRequest("invalid json");
  }
  if (!body || !EVENT_NAMES.has(body.e)) return badRequest("unknown event");
  recordEvent(env, request, body.e, { lang: body.lang, p1: body.p1, p2: body.p2, p3: body.p3 });
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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


async function fetchMapboxWalk(fLat, fLon, tLat, tLon, token, publicOrigin, lang) {
  const langParam = SUPPORTED_LANGS.has(lang) ? lang : "en";
  const url = `${MAPBOX_DIRECTIONS}/${fLon},${fLat};${tLon},${tLat}`
    // alternatives=true: up to 2 extra routes in the same (single-billed)
    // request, offered as choices in the directions.
    + `?geometries=geojson&overview=false&steps=true&alternatives=true&language=${langParam}&access_token=${token}`;
  // Mapbox URL-restriction on public tokens matches the Referer header.
  const headers = publicOrigin ? { Referer: `${publicOrigin}/` } : {};
  const r = await fetch(url, { headers, cf: { cacheTtl: EDGE_TTL_S, cacheEverything: true } });
  if (!r.ok) throw new Error(`mapbox ${r.status}`);
  const body = await r.json();
  const [route, ...others] = body.routes || [];
  if (!route) throw new Error("no route");
  const shape = rt => ({
    seconds: Math.round(rt.duration),
    meters: Math.round(rt.distance),
    steps: extractSteps(rt, langParam),
    via: mainRoad(rt, langParam),
  });
  const primary = shape(route);
  // Drop alternatives that name the same main street as the primary: they
  // read as duplicates to a rider choosing by street name.
  const alternatives = others.map(shape).filter(a => a.via && a.via !== primary.via);
  return { ...primary, alternatives };
}


async function handleWalk(request, env, ctx) {
  const url = new URL(request.url);
  const rawFLat = parseCoord(url.searchParams.get("flat"));
  const rawFLon = parseCoord(url.searchParams.get("flon"));
  const rawTLat = parseCoord(url.searchParams.get("tlat"));
  const rawTLon = parseCoord(url.searchParams.get("tlon"));
  const lang = url.searchParams.get("lang") || "en";
  if (rawFLat == null || rawFLon == null || rawTLat == null || rawTLon == null) {
    return badRequest("flat, flon, tlat, tlon required");
  }
  const fLat = snap(rawFLat, LAT_CELL), fLon = snap(rawFLon, LON_CELL);
  const tLat = snap(rawTLat, LAT_CELL), tLon = snap(rawTLon, LON_CELL);
  // On-post-only directions is a product rule, not just a quota guard —
  // off-post pairs get a 400 so the client falls back to the haversine
  // mock rather than leaking a Korean-street turn-by-turn.
  if (!inHumphreysBbox(fLat, fLon) || !inHumphreysBbox(tLat, tLon)) {
    return badRequest("coords outside on-post area");
  }
  if (haversineMeters(fLat, fLon, tLat, tLon) > MAX_WALK_M) {
    return badRequest("walk too long");
  }
  if (!env.MAPBOX_TOKEN) return json({ error: "server misconfigured" }, 500);

  // Edge-cache probe, keyed on the snapped coords (plus lang and the
  // client's v= schema tag) so any request inside the same cells shares one
  // entry. Other query params are dropped from the key on purpose.
  const cache = caches.default;
  const keyUrl = new URL(url.origin + url.pathname);
  keyUrl.searchParams.set("flat", fLat);
  keyUrl.searchParams.set("flon", fLon);
  keyUrl.searchParams.set("tlat", tLat);
  keyUrl.searchParams.set("tlon", tLon);
  keyUrl.searchParams.set("lang", SUPPORTED_LANGS.has(lang) ? lang : "en");
  keyUrl.searchParams.set("v", url.searchParams.get("v") || "");
  const cacheKey = new Request(keyUrl.toString(), { method: "GET" });
  const cached = await cache.match(cacheKey);
  if (cached) { recordEvent(env, request, "mapbox", { lang, p1: "walk", p2: "hit" }); return cached; }
  if (!(await underUpstreamLimit(request, env))) {
    recordEvent(env, request, "mapbox", { lang, p1: "walk", p2: "limited" });
    return tooMany();
  }
  recordEvent(env, request, "mapbox", { lang, p1: "walk", p2: "billed" });

  try {
    const walk = await fetchMapboxWalk(
      fLat, fLon, tLat, tLon, env.MAPBOX_TOKEN, env.PUBLIC_ORIGIN, lang,
    );
    const res = json({ ...walk, source: "mapbox" });
    ctx.waitUntil(cache.put(cacheKey, res.clone()));
    return res;
  } catch (e) {
    // Log the real error server-side for `wrangler tail` diagnosis.
    // Client response stays canned so no stack trace leaks (CodeQL b95a6c5).
    console.error("mapbox walk failed:", e?.message || e);
    recordEvent(env, request, "mapbox", { lang, p1: "walk", p2: "error" });
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

  // Provider tag in the cache key: the Geocoding v6 build cached empty POI
  // results for a day, so a URL-only key would keep serving them.
  const cache = caches.default;
  const keyUrl = new URL(url);
  keyUrl.searchParams.set("_src", "searchbox-v1-prox");
  const cacheKey = new Request(keyUrl.toString(), { method: "GET" });
  const cached = await cache.match(cacheKey);
  if (cached) { recordEvent(env, request, "mapbox", { lang, p1: "search", p2: "hit" }); return cached; }
  if (!(await underUpstreamLimit(request, env))) {
    recordEvent(env, request, "mapbox", { lang, p1: "search", p2: "limited" });
    return tooMany();
  }
  recordEvent(env, request, "mapbox", { lang, p1: "search", p2: "billed" });

  // bbox hard-clamp keeps results on-post. Same rectangle handleWalk uses
  // as its coord gate — a hit here is a coord that also passes /api/walk.
  const mapboxUrl = `${MAPBOX_SEARCH}`
    + `?q=${encodeURIComponent(q)}`
    + `&bbox=${HUMPHREYS_BBOX_STR}`
    + `&proximity=${HUMPHREYS_CENTER_STR}`
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
      { results, source: "mapbox-searchbox-v1" },
      200,
      { "Cache-Control": `public, max-age=${SEARCH_EDGE_TTL_S}, s-maxage=${SEARCH_EDGE_TTL_S}` },
    );
    ctx.waitUntil(cache.put(cacheKey, res.clone()));
    return res;
  } catch (e) {
    // Log real error server-side for `wrangler tail`; client sees a canned
    // message (same posture as handleWalk — no stack leak).
    console.error("mapbox search failed:", e?.message || e);
    recordEvent(env, request, "mapbox", { lang, p1: "search", p2: "error" });
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
    if (url.pathname === "/api/e") {
      if (request.method !== "POST") return new Response("method not allowed", { status: 405 });
      return handleEvent(request, env);
    }
    if (url.pathname === "/api/search") {
      if (request.method !== "GET") return new Response("method not allowed", { status: 405 });
      return handleSearch(request, env, ctx);
    }
    // Non-API request: hand off to the static-assets binding (see wrangler.jsonc).
    return env.ASSETS.fetch(request);
  },
};

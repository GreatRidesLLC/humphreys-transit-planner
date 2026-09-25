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

function extractSteps(route) {
  const out = [];
  for (const leg of route.legs || []) {
    for (const step of leg.steps || []) {
      const instruction = step.maneuver?.instruction;
      if (!instruction) continue;
      out.push({
        instruction,
        distance: Math.round(step.distance ?? 0),
        duration: Math.round(step.duration ?? 0),
      });
    }
  }
  return out;
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

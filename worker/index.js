// Cloudflare Worker for humphreysbus.app.
//
// Two responsibilities:
//   1. Serve the static PWA (assets binding, wired in wrangler.jsonc).
//   2. Proxy Mapbox Directions API for runtime geolocation walk legs
//      (Roadmap Phase 3). The Mapbox token stays server-side; the client
//      never sees it.
//
// GET /api/walk?flat=<>&flon=<>&tlat=<>&tlon=<>
//   → 200 { seconds, meters, source: "mapbox" }
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

async function fetchMapboxWalk(fLat, fLon, tLat, tLon, token, publicOrigin) {
  const url = `${MAPBOX_DIRECTIONS}/${fLon},${fLat};${tLon},${tLat}`
    + `?geometries=geojson&overview=false&steps=false&access_token=${token}`;
  // Mapbox URL-restriction on public tokens matches the Referer header.
  const headers = publicOrigin ? { Referer: `${publicOrigin}/` } : {};
  const r = await fetch(url, { headers, cf: { cacheTtl: EDGE_TTL_S, cacheEverything: true } });
  if (!r.ok) throw new Error(`mapbox ${r.status}`);
  const body = await r.json();
  const route = body.routes?.[0];
  if (!route) throw new Error("no route");
  return { seconds: Math.round(route.duration), meters: Math.round(route.distance) };
}

async function handleWalk(request, env, ctx) {
  const url = new URL(request.url);
  const fLat = parseCoord(url.searchParams.get("flat"));
  const fLon = parseCoord(url.searchParams.get("flon"));
  const tLat = parseCoord(url.searchParams.get("tlat"));
  const tLon = parseCoord(url.searchParams.get("tlon"));
  if (fLat == null || fLon == null || tLat == null || tLon == null) {
    return badRequest("flat, flon, tlat, tlon required");
  }
  // Camp Humphreys is ~36.96N, 127.03E. Reject wildly out-of-region requests
  // so a misused endpoint doesn't burn Mapbox quota.
  if (Math.abs(fLat - 37) > 1 || Math.abs(tLat - 37) > 1
      || Math.abs(fLon - 127) > 1 || Math.abs(tLon - 127) > 1) {
    return badRequest("coords outside supported region");
  }
  if (!env.MAPBOX_TOKEN) return json({ error: "server misconfigured" }, 500);

  // Edge-cache probe. The URL is already the cache key (coord-rounded on the
  // client), so a repeat cell hits cache without a Mapbox call.
  const cache = caches.default;
  const cacheKey = new Request(url.toString(), { method: "GET" });
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  try {
    const { seconds, meters } = await fetchMapboxWalk(
      fLat, fLon, tLat, tLon, env.MAPBOX_TOKEN, env.PUBLIC_ORIGIN,
    );
    const res = json({ seconds, meters, source: "mapbox" });
    ctx.waitUntil(cache.put(cacheKey, res.clone()));
    return res;
  } catch (e) {
    return json({ error: String(e.message || e) }, 502);
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

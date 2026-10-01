// Runtime Mapbox walk proxy client (Roadmap Phase 3).
//
// When the user has hit "Nearest stop" and we have a geolocation, the
// build-time walk matrix can't help — the origin is not a mapped building.
// This module fetches the user→stop walk from the Cloudflare Worker
// (/api/walk), caches results in localStorage keyed on a coord-rounded
// grid cell, and falls back to haversine on any failure. Mapbox is
// enrichment; never load-bearing.
//
// Cache invalidation: the localStorage key prefix embeds the walk matrix
// source hash. When stop_coords.json / buildings_osm.json change upstream,
// the matrix regenerates with a new hash and stale walks self-invalidate.

import WALK_MATRIX_JSON from "../data/walk_matrix.json";
import { haversineMeters, STOP_COORDS, BUILDING_COORDS } from "./routing.js";
import { audienceHeaders } from "./telemetry.js";

// ~30 m at Camp Humphreys latitude (37°N):
//   lat: 30 m / 111_320 m/deg = 0.000269°
//   lon: 30 m / (111_320 * cos(37°)) = 0.000337°
// Round each coord to that grid so the client and Worker edge-cache share
// the same key for effectively the same origin.
const LAT_CELL = 0.00027;
const LON_CELL = 0.00034;

const VERSION = WALK_MATRIX_JSON?._meta?.source_hash || "unversioned";
// Bump when the step-summarizing logic in the worker changes — partitions
// both localStorage and the CDN edge cache from any previously stored
// fine-grained step list so users don't see stale "turn left 22m" fluff.
// v4: depart step rewritten around street names (no compass) + per-step
// `location` / `toward` for client-side landmarks.
// v5: `via` (main street) + `alternatives` (other Mapbox routes).
// v6: real left/right turns kept on unnamed paths; an unnamed start heads
// "toward" the first named street.
// v7: sidewalks named after their street (src/data/streets.json), turns
// recomputed from headings, start/end crossings ("Cross 11th Street").
// v8: a short approach reads "Walk to X and follow it toward Y", crossings
// along the way get a line, and the arrival step carries arrive/side/cross.
// v9: crossings need the path on both sides of a street; footpaths say
// "onto the path toward X"; wiggly footpaths and short jogs fold away.
const STEPS_SCHEMA_V = 9;
const CACHE_PREFIX = `htp.walk.${VERSION}.v${STEPS_SCHEMA_V}`;
// >2× haversine usually means the walk goes around a real barrier (the
// airfield fence between Corps of Engineers and Airfield Operations is
// 904 m straight, 2193 m on foot). Mapbox is still the best data we have,
// so the route is kept and only tagged `detour: true`; it used to be
// discarded here, which left the user with a straight-line guess and no
// directions (decided 2026-09-27).
const DETOUR_RATIO = 2.0;
// Very short user→stop pairs are dominated by GPS jitter; the Worker call
// isn't worth it, and haversine is already inside the noise band.
const MIN_METERS_FOR_MAPBOX = 60;

// Tight bounding box around Camp Humphreys, derived from the real stop
// coord range in `stop_coords.json` (36.9478–36.9773 lat, 126.9864–127.0432
// lon) with a small padding for GPS jitter at gate perimeters. Any coord
// outside this box is considered off-post; no Mapbox call is made for it,
// and the walk leg falls through to haversine — matching the app's rule
// that turn-by-turn directions only cover on-post movement.
const ON_POST_BBOX = { latMin: 36.945, latMax: 36.980, lonMin: 126.985, lonMax: 127.045 };

export function isOnPost(lat, lon) {
  return lat >= ON_POST_BBOX.latMin && lat <= ON_POST_BBOX.latMax
    && lon >= ON_POST_BBOX.lonMin && lon <= ON_POST_BBOX.lonMax;
}

export function roundCell(lat, lon) {
  return {
    lat: Math.round(lat / LAT_CELL) * LAT_CELL,
    lon: Math.round(lon / LON_CELL) * LON_CELL,
  };
}

const SUPPORTED_LANGS = new Set(["en", "ko"]);

function normalizeLang(lang) {
  return SUPPORTED_LANGS.has(lang) ? lang : "en";
}

// `reverse` walks stop → point instead of point → stop: the leg from the
// alight stop to a destination. Steps are direction-dependent, so the two
// directions never share a cache entry.
function cacheKey(userCell, stopName, lang, reverse = false) {
  return `${CACHE_PREFIX}:${lang}:${reverse ? "r:" : ""}${userCell.lat.toFixed(5)},${userCell.lon.toFixed(5)}::${stopName}`;
}

// Building origins are static — cache by bldg number rather than a coord cell.
// Same source-hash prefix, so a matrix regen invalidates these too.
function bldgCacheKey(bldgNum, stopName, lang, reverse = false) {
  return `${CACHE_PREFIX}:${lang}:${reverse ? "r:" : ""}bldg:${bldgNum}::${stopName}`;
}

function walkUrl(from, to, lang) {
  return `/api/walk?flat=${from.lat}&flon=${from.lon}&tlat=${to.lat}&tlon=${to.lon}&lang=${lang}&v=${STEPS_SCHEMA_V}`;
}

function lsGet(key) {
  try { return globalThis.localStorage?.getItem(key); } catch { return null; }
}

function lsSet(key, value) {
  try { globalThis.localStorage?.setItem(key, value); } catch { /* quota / private mode */ }
}

function sanitizeSteps(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const s of raw) {
    if (!s || typeof s.instruction !== "string") continue;
    const loc = Array.isArray(s.location) && s.location.length === 2
      && s.location.every(Number.isFinite) ? s.location : null;
    out.push({
      instruction: s.instruction,
      distance: Number.isFinite(s.distance) ? s.distance : 0,
      duration: Number.isFinite(s.duration) ? s.duration : 0,
      location: loc,
      toward: s.toward === true,
    });
  }
  return out;
}

function toValue(body, straight) {
  const alternatives = Array.isArray(body.alternatives)
    ? body.alternatives
      .filter(a => a && typeof a.seconds === "number" && typeof a.meters === "number")
      .map(a => ({
        seconds: a.seconds,
        meters: a.meters,
        steps: sanitizeSteps(a.steps),
        via: typeof a.via === "string" ? a.via : null,
      }))
    : [];
  return {
    seconds: body.seconds,
    meters: body.meters,
    steps: sanitizeSteps(body.steps),
    source: "mapbox",
    detour: body.meters > straight * DETOUR_RATIO,
    via: typeof body.via === "string" ? body.via : null,
    alternatives,
  };
}

// Returns {seconds, meters, steps, source: "mapbox"} on success, or null on any
// failure (network, non-2xx, invalid response). Callers must be
// prepared for null and fall back to haversine.
export async function fetchUserWalk(userCoords, stopName, opts = {}) {
  const stop = STOP_COORDS[stopName];
  if (!stop || stop.lat == null) return null;
  if (!userCoords || userCoords.lat == null) return null;
  // Off-post users get no turn-by-turn — the app's coverage is on-post only.
  if (!isOnPost(userCoords.lat, userCoords.lon)) return null;
  if (!isOnPost(stop.lat, stop.lon)) return null;

  const straight = haversineMeters(userCoords.lat, userCoords.lon, stop.lat, stop.lon);
  if (straight < MIN_METERS_FOR_MAPBOX) return null;

  const lang = normalizeLang(opts.lang);
  const cell = roundCell(userCoords.lat, userCoords.lon);
  const key = cacheKey(cell, stopName, lang, opts.reverse);
  const cached = lsGet(key);
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      if (parsed && typeof parsed.seconds === "number") return parsed;
    } catch { /* corrupted entry — refetch below */ }
  }

  const fetchImpl = opts.fetch || globalThis.fetch;
  if (!fetchImpl) return null;

  const url = opts.reverse ? walkUrl(stop, cell, lang) : walkUrl(cell, stop, lang);
  let body;
  try {
    const r = await fetchImpl(url, { headers: audienceHeaders() });
    if (!r || !r.ok) return null;
    body = await r.json();
  } catch {
    return null;
  }
  if (!body || typeof body.seconds !== "number" || typeof body.meters !== "number") return null;


  const value = toValue(body, straight);
  lsSet(key, JSON.stringify(value));
  return value;
}

// Batch prefetch for a set of stops from one origin. Returns a Map of
// stopName → {seconds, meters, steps, source} for those that succeeded. Missing
// entries mean "fall through to haversine". Never throws.
export async function prefetchUserWalks(userCoords, stopNames, opts = {}) {
  const out = new Map();
  if (!userCoords || userCoords.lat == null) return out;
  const results = await Promise.all(
    stopNames.map(async name => [name, await fetchUserWalk(userCoords, name, opts)])
  );
  for (const [name, hit] of results) if (hit) out.set(name, hit);
  return out;
}

// Building-origin runtime fetch. The precomputed matrix already has the
// bldg→nearest-stop pair for duration, but never carries steps (bundle-size
// trade). This is the runtime path that fills in step data on demand.
// Returns {seconds, meters, steps, source: "mapbox"} or null.
export async function fetchBuildingWalk(bldgNum, stopName, opts = {}) {
  const stop = STOP_COORDS[stopName];
  const b = BUILDING_COORDS[bldgNum];
  if (!stop || stop.lat == null || !b || b.lat == null) return null;
  // Defensive: BUILDING_COORDS + STOP_COORDS are on-post by construction, but
  // the bbox check keeps the invariant tight against future data changes.
  if (!isOnPost(b.lat, b.lon) || !isOnPost(stop.lat, stop.lon)) return null;

  const straight = haversineMeters(b.lat, b.lon, stop.lat, stop.lon);
  if (straight < MIN_METERS_FOR_MAPBOX) return null;

  const lang = normalizeLang(opts.lang);
  const key = bldgCacheKey(bldgNum, stopName, lang, opts.reverse);
  const cached = lsGet(key);
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      if (parsed && typeof parsed.seconds === "number") return parsed;
    } catch { /* corrupted entry — refetch below */ }
  }

  const fetchImpl = opts.fetch || globalThis.fetch;
  if (!fetchImpl) return null;

  const url = opts.reverse ? walkUrl(stop, b, lang) : walkUrl(b, stop, lang);
  let body;
  try {
    const r = await fetchImpl(url, { headers: audienceHeaders() });
    if (!r || !r.ok) return null;
    body = await r.json();
  } catch {
    return null;
  }
  if (!body || typeof body.seconds !== "number" || typeof body.meters !== "number") return null;

  const value = toValue(body, straight);
  lsSet(key, JSON.stringify(value));
  return value;
}

// Convenience wrapper matching prefetchUserWalks's Map return so App.jsx can
// splice both into the same walkOverrides bag. One building → one primary
// stop is the common case, but a caller can pass more.
export async function prefetchBuildingWalks(bldgNum, stopNames, opts = {}) {
  const out = new Map();
  if (bldgNum == null) return out;
  const results = await Promise.all(
    stopNames.map(async name => [name, await fetchBuildingWalk(bldgNum, name, opts)])
  );
  for (const [name, hit] of results) if (hit) out.set(name, hit);
  return out;
}

// Direct origin→destination walk (no bus). Used when the trip planner
// suggests walking the whole way — the walkable-trip advisory card. Cached
// by rounded origin + rounded dest cells + lang.
export async function fetchDirectWalk(originCoords, destCoords, opts = {}) {
  if (!originCoords || originCoords.lat == null) return null;
  if (!destCoords || destCoords.lat == null) return null;
  if (!isOnPost(originCoords.lat, originCoords.lon)) return null;
  if (!isOnPost(destCoords.lat, destCoords.lon)) return null;

  const straight = haversineMeters(originCoords.lat, originCoords.lon, destCoords.lat, destCoords.lon);
  if (straight < MIN_METERS_FOR_MAPBOX) return null;

  const lang = normalizeLang(opts.lang);
  const oCell = roundCell(originCoords.lat, originCoords.lon);
  const dCell = roundCell(destCoords.lat, destCoords.lon);
  const key = `${CACHE_PREFIX}:${lang}:direct:${oCell.lat.toFixed(5)},${oCell.lon.toFixed(5)}::${dCell.lat.toFixed(5)},${dCell.lon.toFixed(5)}`;
  const cached = lsGet(key);
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      if (parsed && typeof parsed.seconds === "number") return parsed;
    } catch { /* corrupted entry — refetch below */ }
  }

  const fetchImpl = opts.fetch || globalThis.fetch;
  if (!fetchImpl) return null;

  const url = `/api/walk?flat=${oCell.lat}&flon=${oCell.lon}&tlat=${dCell.lat}&tlon=${dCell.lon}&lang=${lang}&v=${STEPS_SCHEMA_V}`;
  let body;
  try {
    const r = await fetchImpl(url, { headers: audienceHeaders() });
    if (!r || !r.ok) return null;
    body = await r.json();
  } catch {
    return null;
  }
  if (!body || typeof body.seconds !== "number" || typeof body.meters !== "number") return null;

  const value = toValue(body, straight);
  lsSet(key, JSON.stringify(value));
  return value;
}

// Exposed for testing.
export const _internal = { CACHE_PREFIX, LAT_CELL, LON_CELL, DETOUR_RATIO, MIN_METERS_FOR_MAPBOX };

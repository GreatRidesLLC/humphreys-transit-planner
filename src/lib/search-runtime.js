// Free-text origin search client (Roadmap Phase 5 step 2).
//
// Calls the Worker's /api/search (Mapbox Search Box forward, bbox-clamped to
// Camp Humphreys) and caches each query's results in localStorage for a day,
// matching the Worker's edge TTL. Like walk-runtime, Mapbox is enrichment:
// any failure yields [] and the dropdown keeps showing local matches only.

import { useEffect, useState } from "react";
import { isOnPost } from "./walk-runtime.js";

export const MIN_QUERY_LEN = 2;
const MAX_QUERY_LEN = 100;
const DEBOUNCE_MS = 300;
const TTL_MS = 24 * 60 * 60 * 1000;
// Bump when the Worker's provider or row shape changes.
const CACHE_PREFIX = "htp.search.v1";
const SUPPORTED_LANGS = new Set(["en", "ko"]);

export function normalizeQuery(q) {
  return (q || "").trim().replace(/\s+/g, " ").toLowerCase();
}

function cacheKey(q, lang) {
  return `${CACHE_PREFIX}:${lang}:${q}`;
}

function lsGet(key) {
  try { return globalThis.localStorage?.getItem(key); } catch { return null; }
}

function lsSet(key, value) {
  try { globalThis.localStorage?.setItem(key, value); } catch { /* quota / private mode */ }
}

// Drop anything the UI can't route from: no name, no coords, or off-post.
function sanitizeResults(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const r of raw) {
    if (!r || typeof r.name !== "string" || !r.name) continue;
    if (!Number.isFinite(r.lat) || !Number.isFinite(r.lon)) continue;
    if (!isOnPost(r.lat, r.lon)) continue;
    out.push({
      id: typeof r.id === "string" ? r.id : "",
      name: r.name,
      full: typeof r.full === "string" ? r.full : "",
      lat: r.lat,
      lon: r.lon,
    });
  }
  return out;
}

// Returns [{ id, name, full, lat, lon }]. Never throws; [] on any failure.
export async function searchPlaces(query, opts = {}) {
  const q = normalizeQuery(query);
  if (q.length < MIN_QUERY_LEN || q.length > MAX_QUERY_LEN) return [];
  const lang = SUPPORTED_LANGS.has(opts.lang) ? opts.lang : "en";
  const now = opts.now ?? Date.now();

  const key = cacheKey(q, lang);
  const cached = lsGet(key);
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      if (parsed && Array.isArray(parsed.results) && now - parsed.at < TTL_MS) return parsed.results;
    } catch { /* corrupted entry — refetch below */ }
  }

  const fetchImpl = opts.fetch || globalThis.fetch;
  if (!fetchImpl) return [];
  let body;
  try {
    const r = await fetchImpl(`/api/search?q=${encodeURIComponent(q)}&lang=${lang}`,
      opts.signal ? { signal: opts.signal } : undefined);
    if (!r || !r.ok) return [];
    body = await r.json();
  } catch {
    return [];
  }
  const results = sanitizeResults(body?.results);
  lsSet(key, JSON.stringify({ at: now, results }));
  return results;
}

// Debounced search hook. `enabled` false (or a short query) clears results
// without a network call. Stale responses are dropped via AbortController.
export function usePlaceSearch(query, lang, enabled = true) {
  const q = enabled ? normalizeQuery(query) : "";
  const active = q.length >= MIN_QUERY_LEN;
  const [state, setState] = useState({ q: "", results: [], loading: false });

  useEffect(() => {
    if (!active) return;
    const ctrl = new AbortController();
    const id = setTimeout(async () => {
      setState(s => ({ ...s, loading: true }));
      const results = await searchPlaces(q, { lang, signal: ctrl.signal });
      if (!ctrl.signal.aborted) setState({ q, results, loading: false });
    }, DEBOUNCE_MS);
    return () => { clearTimeout(id); ctrl.abort(); };
  }, [q, lang, active]);

  if (!active) return { results: [], loading: false };
  // Results from an older query stay hidden until the new one lands.
  return { results: state.q === q ? state.results : [], loading: state.q !== q || state.loading };
}

export const _internal = { CACHE_PREFIX, TTL_MS, DEBOUNCE_MS };

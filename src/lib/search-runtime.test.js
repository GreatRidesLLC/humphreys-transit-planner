import { describe, it, expect, beforeEach, vi } from "vitest";
import { searchPlaces, normalizeQuery, _internal } from "./search-runtime.js";

function makeLocalStorage() {
  const store = new Map();
  return {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: k => { store.delete(k); },
    clear: () => store.clear(),
    _store: store,
  };
}

const COMMISSARY = { id: "a", name: "Camp Humphreys Commissary", full: "Pyeongtaek", lat: 36.96418, lon: 127.00236 };
const OFF_POST = { id: "b", name: "Seoul Station", full: "Seoul", lat: 37.5547, lon: 126.9707 };

function okFetch(results) {
  return vi.fn(async () => ({ ok: true, json: async () => ({ results, source: "mapbox-searchbox-v1" }) }));
}

beforeEach(() => {
  globalThis.localStorage = makeLocalStorage();
});

describe("normalizeQuery", () => {
  it("trims, collapses whitespace and lowercases", () => {
    expect(normalizeQuery("  Main   Exchange ")).toBe("main exchange");
  });
});

describe("searchPlaces", () => {
  it("skips the network for queries under 2 chars", async () => {
    const fetch = okFetch([COMMISSARY]);
    expect(await searchPlaces(" c ", { fetch })).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns on-post results and drops off-post or malformed rows", async () => {
    const fetch = okFetch([COMMISSARY, OFF_POST, { name: "", lat: 36.96, lon: 127.0 }, { name: "No coords" }]);
    const out = await searchPlaces("Commissary", { fetch, lang: "en" });
    expect(out).toEqual([COMMISSARY]);
    expect(fetch.mock.calls[0][0]).toBe("/api/search?q=commissary&lang=en");
  });

  it("serves a repeat query from localStorage", async () => {
    const fetch = okFetch([COMMISSARY]);
    await searchPlaces("commissary", { fetch, now: 1000 });
    const again = await searchPlaces("COMMISSARY ", { fetch, now: 2000 });
    expect(again).toEqual([COMMISSARY]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("refetches after the TTL expires", async () => {
    const fetch = okFetch([COMMISSARY]);
    await searchPlaces("commissary", { fetch, now: 0 });
    await searchPlaces("commissary", { fetch, now: _internal.TTL_MS + 1 });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("keys the cache per language", async () => {
    const fetch = okFetch([COMMISSARY]);
    await searchPlaces("commissary", { fetch, lang: "en" });
    await searchPlaces("commissary", { fetch, lang: "ko" });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[1][0]).toContain("lang=ko");
  });

  it("returns [] on non-2xx and does not cache it", async () => {
    const fetch = vi.fn(async () => ({ ok: false, json: async () => ({}) }));
    expect(await searchPlaces("commissary", { fetch })).toEqual([]);
    expect(globalThis.localStorage._store.size).toBe(0);
  });

  it("returns [] when fetch throws", async () => {
    const fetch = vi.fn(async () => { throw new Error("offline"); });
    expect(await searchPlaces("commissary", { fetch })).toEqual([]);
  });
});

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  roundCell, fetchUserWalk, prefetchUserWalks,
  fetchBuildingWalk, prefetchBuildingWalks,
  fetchDirectWalk, isOnPost, _internal,
} from "./walk-runtime.js";
import { STOP_COORDS, BUILDING_COORDS, haversineMeters } from "./routing.js";

// Minimal in-memory localStorage — the module reads/writes globalThis.localStorage.
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

beforeEach(() => {
  globalThis.localStorage = makeLocalStorage();
});

describe("roundCell", () => {
  it("snaps two nearby coords to the same cell", () => {
    const a = roundCell(36.96000, 127.03000);
    const b = roundCell(36.96010, 127.03010);
    expect(a.lat).toBeCloseTo(b.lat, 5);
    expect(a.lon).toBeCloseTo(b.lon, 5);
  });

  it("separates coords >30 m apart into different cells", () => {
    const a = roundCell(36.96000, 127.03000);
    const b = roundCell(36.96100, 127.03100); // ~110-130 m offset
    const same = a.lat === b.lat && a.lon === b.lon;
    expect(same).toBe(false);
  });
});

describe("isOnPost", () => {
  it("accepts a coord inside the Camp Humphreys bbox", () => {
    expect(isOnPost(36.9606, 127.0158)).toBe(true);
  });
  it("rejects a coord clearly off-post (e.g. Pyeongtaek Station area)", () => {
    // Pyeongtaek Station ~36.99N 127.09E — outside the box.
    expect(isOnPost(36.99, 127.09)).toBe(false);
  });
  it("rejects a coord far south (e.g. Seoul)", () => {
    expect(isOnPost(37.55, 126.98)).toBe(false);
  });
});

describe("fetchUserWalk", () => {
  const user = { lat: 36.9606, lon: 127.0158 };
  const stop = "Bus Terminal";

  it("returns null when the user is off-post", async () => {
    const fetchMock = vi.fn();
    // Same lon, but lat outside the northern bbox edge (~36.980).
    const offPost = { lat: 37.10, lon: 127.03 };
    expect(await fetchUserWalk(offPost, stop, { fetch: fetchMock })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns null when userCoords are missing", async () => {
    const fetchMock = vi.fn();
    expect(await fetchUserWalk(null, stop, { fetch: fetchMock })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns null for unknown stop", async () => {
    const fetchMock = vi.fn();
    expect(await fetchUserWalk(user, "NoSuchStop", { fetch: fetchMock })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("skips very short pairs (<MIN_METERS) without hitting the network", async () => {
    const s = STOP_COORDS[stop];
    // Put the user 5 m from the stop — below MIN_METERS_FOR_MAPBOX.
    const near = { lat: s.lat, lon: s.lon };
    const fetchMock = vi.fn();
    expect(await fetchUserWalk(near, stop, { fetch: fetchMock })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("proxies through /api/walk and caches the successful response", async () => {
    const seconds = 300, meters = 400;
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ seconds, meters, source: "mapbox" }),
    });
    const first = await fetchUserWalk(user, stop, { fetch: fetchMock });
    // steps defaults to [] when Mapbox response omits them.
    expect(first).toEqual({ seconds, meters, steps: [], source: "mapbox" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = fetchMock.mock.calls[0][0];
    expect(url).toMatch(/^\/api\/walk\?/);
    expect(url).toContain("flat=");
    expect(url).toContain("tlat=");
    // Default lang appended so the Worker knows what to request from Mapbox.
    expect(url).toContain("lang=en");
    // Second call must hit localStorage, not the network.
    const second = await fetchUserWalk(user, stop, { fetch: fetchMock });
    expect(second).toEqual(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("stores turn-by-turn steps from the response", async () => {
    const steps = [
      { instruction: "Head north on American Street", distance: 120, duration: 90 },
      { instruction: "Turn left onto Marne Avenue", distance: 80, duration: 60 },
    ];
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ seconds: 300, meters: 400, steps, source: "mapbox" }),
    });
    const hit = await fetchUserWalk(user, stop, { fetch: fetchMock });
    expect(hit.steps).toEqual(steps);
    // Cached entry round-trips through JSON with steps intact.
    const cached = await fetchUserWalk(user, stop, { fetch: fetchMock });
    expect(cached.steps).toEqual(steps);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("passes lang through the URL and separates cache entries by lang", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ seconds: 300, meters: 400, steps: [], source: "mapbox" }),
    });
    await fetchUserWalk(user, stop, { fetch: fetchMock, lang: "ko" });
    const url = fetchMock.mock.calls[0][0];
    expect(url).toContain("lang=ko");
    // A second call at a different lang must refetch, not hit the ko cache.
    await fetchUserWalk(user, stop, { fetch: fetchMock, lang: "en" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // But another ko call hits cache.
    await fetchUserWalk(user, stop, { fetch: fetchMock, lang: "ko" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects Mapbox routes >2× haversine (sanity check)", async () => {
    const s = STOP_COORDS[stop];
    const straight = haversineMeters(user.lat, user.lon, s.lat, s.lon);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ seconds: 9999, meters: Math.round(straight * 3), source: "mapbox" }),
    });
    expect(await fetchUserWalk(user, stop, { fetch: fetchMock })).toBeNull();
  });

  it("returns null on network failure and does not cache", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("offline"));
    expect(await fetchUserWalk(user, stop, { fetch: fetchMock })).toBeNull();
    // Retry should hit the network again — nothing was cached.
    await fetchUserWalk(user, stop, { fetch: fetchMock });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns null on non-2xx and does not cache", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 502 });
    expect(await fetchUserWalk(user, stop, { fetch: fetchMock })).toBeNull();
    await fetchUserWalk(user, stop, { fetch: fetchMock });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("uses the versioned cache-key prefix from walk_matrix source_hash", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ seconds: 300, meters: 400, source: "mapbox" }),
    });
    await fetchUserWalk(user, stop, { fetch: fetchMock });
    const keys = [...globalThis.localStorage._store.keys()];
    expect(keys.length).toBe(1);
    expect(keys[0].startsWith(`${_internal.CACHE_PREFIX}:`)).toBe(true);
  });
});

describe("prefetchUserWalks", () => {
  const user = { lat: 36.9606, lon: 127.0158 };

  it("returns a Map of only the stops that succeeded", async () => {
    const fetchMock = vi.fn(async () => {
      // Fail the second call to prove missing entries are dropped, not filled.
      if (fetchMock.mock.calls.length === 2) return { ok: false, status: 500 };
      return { ok: true, json: async () => ({ seconds: 300, meters: 400, source: "mapbox" }) };
    });
    const result = await prefetchUserWalks(user, ["Bus Terminal", "Main Exchange (PX)"], { fetch: fetchMock });
    expect(result).toBeInstanceOf(Map);
    // First call wins, second fails — Map holds one entry.
    expect(result.size).toBe(1);
    const [name, hit] = [...result.entries()][0];
    expect(["Bus Terminal", "Main Exchange (PX)"]).toContain(name);
    expect(hit.source).toBe("mapbox");
  });

  it("returns an empty Map when userCoords are missing", async () => {
    const result = await prefetchUserWalks(null, ["Bus Terminal"], { fetch: vi.fn() });
    expect(result.size).toBe(0);
  });
});

describe("fetchBuildingWalk", () => {
  // Any real bldg from BUILDING_COORDS with a lat/lon.
  const bldgNum = Object.keys(BUILDING_COORDS).find(k => BUILDING_COORDS[k]?.lat != null);
  const stop = "Bus Terminal";

  it("returns null for unknown building", async () => {
    const fetchMock = vi.fn();
    expect(await fetchBuildingWalk("nope", stop, { fetch: fetchMock })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("proxies through /api/walk with the building coord and lang, caches by bldg num", async () => {
    const steps = [{ instruction: "Head south", distance: 40, duration: 30 }];
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ seconds: 240, meters: 320, steps, source: "mapbox" }),
    });
    const first = await fetchBuildingWalk(bldgNum, stop, { fetch: fetchMock, lang: "ko" });
    expect(first).toEqual({ seconds: 240, meters: 320, steps, source: "mapbox" });
    const url = fetchMock.mock.calls[0][0];
    expect(url).toContain("lang=ko");
    // The bldg's real coord should be in the URL, not a user cell.
    const b = BUILDING_COORDS[bldgNum];
    expect(url).toContain(`flat=${b.lat}`);
    // Second call hits localStorage, not the network.
    await fetchBuildingWalk(bldgNum, stop, { fetch: fetchMock, lang: "ko" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("fetchDirectWalk proxies + caches origin→dest walk without a stop", async () => {
    const steps = [{ instruction: "Head north", distance: 40, duration: 30 }];
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ seconds: 240, meters: 320, steps, source: "mapbox" }),
    });
    const origin = { lat: 36.9606, lon: 127.0158 };
    const dest = { lat: 36.9633, lon: 127.0227 };
    const first = await fetchDirectWalk(origin, dest, { fetch: fetchMock, lang: "ko" });
    expect(first.steps).toEqual(steps);
    expect(first.source).toBe("mapbox");
    // Cached: second call hits localStorage.
    await fetchDirectWalk(origin, dest, { fetch: fetchMock, lang: "ko" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("fetchDirectWalk returns null when either endpoint is off-post", async () => {
    const fetchMock = vi.fn();
    const onPost = { lat: 36.9606, lon: 127.0158 };
    const offPost = { lat: 37.55, lon: 126.98 };
    expect(await fetchDirectWalk(offPost, onPost, { fetch: fetchMock })).toBeNull();
    expect(await fetchDirectWalk(onPost, offPost, { fetch: fetchMock })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("prefetchBuildingWalks returns a Map only for successful stops", async () => {
    const fetchMock = vi.fn(async () => {
      if (fetchMock.mock.calls.length === 2) return { ok: false, status: 500 };
      return { ok: true, json: async () => ({ seconds: 200, meters: 260, steps: [], source: "mapbox" }) };
    });
    const result = await prefetchBuildingWalks(bldgNum, [stop, "Main Exchange (PX)"], { fetch: fetchMock });
    expect(result).toBeInstanceOf(Map);
    expect(result.size).toBe(1);
  });
});

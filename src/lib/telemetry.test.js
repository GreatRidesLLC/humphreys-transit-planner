import { describe, it, expect, beforeEach, vi } from "vitest";
import { applyDevMark, isDev, audienceHeaders, track, DEV_MARK } from "./telemetry.js";

function makeLocalStorage() {
  const store = new Map();
  return {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: k => { store.delete(k); },
  };
}

const at = href => ({ href });
const hist = () => ({ state: null, replaceState: vi.fn() });

beforeEach(() => {
  globalThis.localStorage = makeLocalStorage();
});

describe("developer mark", () => {
  it("marks this browser as dev and strips the parameter", () => {
    const h = hist();
    applyDevMark(at(`https://humphreysbus.app/?dev=${DEV_MARK}&x=1#t`), h);
    expect(isDev()).toBe(true);
    expect(audienceHeaders()).toEqual({ "x-htp-aud": "dev" });
    expect(h.replaceState).toHaveBeenCalledWith(null, "", "/?x=1#t");
  });

  it("ignores a wrong value but still strips it", () => {
    const h = hist();
    applyDevMark(at("https://humphreysbus.app/?dev=guess"), h);
    expect(isDev()).toBe(false);
    expect(audienceHeaders()).toEqual({});
    expect(h.replaceState).toHaveBeenCalled();
  });

  it("?dev=off clears the mark", () => {
    applyDevMark(at(`https://humphreysbus.app/?dev=${DEV_MARK}`), hist());
    applyDevMark(at("https://humphreysbus.app/?dev=off"), hist());
    expect(isDev()).toBe(false);
  });

  it("leaves URLs without the parameter alone", () => {
    const h = hist();
    applyDevMark(at("https://humphreysbus.app/"), h);
    expect(h.replaceState).not.toHaveBeenCalled();
  });
});

describe("track", () => {
  it("posts the event with the audience header and never throws", async () => {
    applyDevMark(at(`https://humphreysbus.app/?dev=${DEV_MARK}`), hist());
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    globalThis.window = globalThis.window || {};
    const prev = globalThis.fetch;
    globalThis.fetch = fetchMock;
    track("plan", { lang: "ko", p1: "trips" });
    globalThis.fetch = prev;
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/e");
    expect(init.method).toBe("POST");
    expect(init.headers["x-htp-aud"]).toBe("dev");
    expect(JSON.parse(init.body)).toEqual({ e: "plan", lang: "ko", p1: "trips", p2: "", p3: "" });
  });

  it("swallows a rejected fetch", () => {
    const prev = globalThis.fetch;
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("offline"));
    expect(() => track("open")).not.toThrow();
    globalThis.fetch = prev;
  });
});

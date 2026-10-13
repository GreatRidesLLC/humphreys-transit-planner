import { describe, it, expect, beforeEach, vi } from "vitest";
import { applyDevMark, isDev, audienceHeaders, track, DEV_MARK, readVisit, noteVisit, displayMode } from "./telemetry.js";

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

describe("visit kind", () => {
  const day = s => new Date(`${s}T12:00:00`);

  it("first open on a fresh device", () => {
    expect(readVisit(day("2026-10-13"))).toEqual({ kind: "first", gap: "", today: "2026-10-13" });
  });

  it("older devices with the app's language key count as returning", () => {
    localStorage.setItem("humphreys.lang", '"en"');
    expect(readVisit(day("2026-10-13"))).toMatchObject({ kind: "day", gap: "unknown" });
  });

  it("same-day reopen is 'again'; later days carry a gap bucket", () => {
    noteVisit(readVisit(day("2026-10-13")));
    expect(readVisit(day("2026-10-13")).kind).toBe("again");
    expect(readVisit(day("2026-10-14"))).toMatchObject({ kind: "day", gap: "1d" });
    expect(readVisit(day("2026-10-20")).gap).toBe("2-7d");
    expect(readVisit(day("2026-11-12")).gap).toBe("8-30d");
    expect(readVisit(day("2027-01-01")).gap).toBe("31d+");
  });

  it("stores only the date", () => {
    noteVisit(readVisit(day("2026-10-13")));
    expect(localStorage.getItem("htp.lastOpen")).toBe("2026-10-13");
  });

  it("display mode falls back to browser", () => {
    expect(displayMode()).toBe("browser");
  });
});

import { describe, it, expect } from "vitest";
import { extractSteps, mainRoad, sidewalkOf } from "./steps.js";
import { reverseRoute } from "./fixtures/reverse.js";
import MAUDE from "./fixtures/maude-to-mini-mall.json";
import STREETS from "../src/data/streets.json";

const toMiniMall = MAUDE.routes[0];
const toMaude = reverseRoute(toMiniMall);
const lines = (route, lang = "en") => extractSteps(route, lang).map(s => s.instruction);

describe("real walk: LTG Maude Hall → Family Mini Mall", () => {
  // Mapbox calls every step here "the walkway" (separately mapped sidewalks)
  // and ends with a left-right-left jog across 11th Street.
  it("names sidewalks after their street and folds the crossing into the arrival", () => {
    expect(lines(toMiniMall)).toEqual([
      "Walk along 9th Street toward Marne Avenue",
      "Turn left onto Marne Avenue",
      // The 11th Street sidewalk starts north of Marne Avenue's mouth.
      "Turn right onto 11th Street, then cross Marne Avenue",
      "Cross 11th Street. Your destination is on the left.",
    ]);
    expect(extractSteps(toMiniMall, "en").map(s => s.distance)).toEqual([115, 457, 151, 0]);
    expect(extractSteps(toMiniMall, "en").at(-1)).toMatchObject({ arrive: true, side: "left", cross: "11th Street" });
  });

  it("uses Korean street names where OSM has them", () => {
    expect(lines(toMiniMall, "ko")).toEqual([
      "9번가을(를) 따라 Marne Avenue 방향으로 걸으세요",
      "Marne Avenue(으)로 좌회전하세요",
      "11번가(으)로 우회전하세요. 그다음 Marne Avenue을(를) 건너세요",
      "11번가을(를) 건너세요. 목적지는 왼쪽에 있습니다.",
    ]);
  });

  it("names the route by the street walked longest", () => {
    expect(mainRoad(toMiniMall, "en")).toBe("Marne Avenue");
  });

  it("reads as its own walk in reverse, not a copy", () => {
    expect(lines(toMaude)).toEqual([
      "Cross 11th Street, then follow it toward Marne Avenue",
      "Cross Marne Avenue, then turn left along it",
      "Turn right onto 9th Street",
      "You have arrived at your destination.",
    ]);
  });
});

// Made-up walks in an empty corner of the bbox, away from every street.
const ORIGIN = [126.9870, 36.9460];
const M_LAT = 110540, M_LON = 111320 * Math.cos(36.965 * Math.PI / 180);
const go = ([lon, lat], bearing, m) => {
  const r = bearing * Math.PI / 180;
  return [lon + Math.sin(r) * m / M_LON, lat + Math.cos(r) * m / M_LAT];
};
// legs: [bearing, metres, name?]; builds Mapbox-shaped steps with geometry.
function synth(legs, arrive = {}) {
  let at = ORIGIN, prevBearing = null;
  const steps = legs.map(([bearing, m, name = ""], i) => {
    const end = go(at, bearing, m);
    const step = {
      name, distance: m, duration: m / 1.4,
      geometry: { coordinates: [at, go(at, bearing, m / 2), end] },
      maneuver: { type: i === 0 ? "depart" : "turn", bearing_before: prevBearing ?? 0, bearing_after: bearing,
        location: at, instruction: `Mapbox step ${i}` },
    };
    at = end; prevBearing = bearing;
    return step;
  });
  steps.push({ name: "", distance: 0, duration: 0, geometry: { coordinates: [at, at] },
    maneuver: { type: "arrive", location: at, instruction: "You have arrived at your destination.", ...arrive } });
  return { legs: [{ steps }] };
}

describe("turn chain", () => {
  it("works out a turn from the heading before a hidden jog", () => {
    // North, an 8 m jog east, north again, then west: one left turn.
    const out = lines(synth([[0, 100], [90, 8], [0, 100], [270, 100]]));
    expect(out).toEqual(["Start walking", "Turn left onto the path", "You have arrived at your destination."]);
  });

  it("drops a jog that leaves you going the same way", () => {
    const out = extractSteps(synth([[0, 100], [270, 6], [0, 150]]), "en");
    expect(out.map(s => s.instruction)).toEqual(["Start walking", "You have arrived at your destination."]);
    expect(out[0].distance).toBe(256);
  });

  it("folds a gentle bend on a footpath into one line", () => {
    const out = extractSteps(synth([[0, 250], [30, 100]]), "en");
    expect(out.map(s => s.instruction)).toEqual(["Start walking", "You have arrived at your destination."]);
    expect(out[0].distance).toBe(350);
  });

  it("keeps a real turn between footpaths", () => {
    expect(lines(synth([[0, 100], [90, 100]]))[1]).toBe("Turn right onto the path");
  });

  it("says which side the destination is on when Mapbox knows", () => {
    expect(lines(synth([[0, 100]], { modifier: "right" })).at(-1)).toBe("Your destination is on the right.");
    expect(lines(synth([[0, 100]], { modifier: "left" }), "ko").at(-1)).toBe("목적지는 왼쪽에 있습니다.");
  });

  it("names a turn onto a Mapbox-named street, Korean half in ko", () => {
    const route = synth([[0, 100], [90, 100, "11th Street; 11번가"]]);
    expect(lines(route)[1]).toBe("Turn right onto 11th Street");
    expect(lines(route, "ko")[1]).toBe("11번가(으)로 우회전하세요");
    expect(lines(route)[0]).toBe("Follow the path toward 11th Street");
  });
});

// A walk laid on the real street lines: from a stop 7 m off 11th Street,
// north along its west sidewalk, across the end of Marne Avenue. The shape
// of the Mini Mall stop → Commissary leg.
describe("walk from a stop beside 11th Street", () => {
  const ways = name => STREETS.streets.filter(s => s.name === name);
  const toXY = ([lon, lat]) => [lon * M_LON, lat * M_LAT];
  // Marne Avenue's end that touches 11th Street.
  const eleventh = ways("11th Street").flatMap(w => w.coords.slice(1).map((c, i) => [w.coords[i], c]));
  const dist = (p, [a, b]) => {
    const [px, py] = toXY(p), [ax, ay] = toXY(a), [bx, by] = toXY(b);
    const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(px - ax - t * dx, py - ay - t * dy);
  };
  const junction = ways("Marne Avenue").flatMap(w => [w.coords[0], w.coords.at(-1)])
    .map(p => ({ p, d: Math.min(...eleventh.map(seg => dist(p, seg))) }))
    .sort((a, b) => a.d - b.d)[0].p;
  const seg = eleventh.slice().sort((a, b) => dist(junction, a) - dist(junction, b))[0];
  let b11 = (Math.atan2((seg[1][0] - seg[0][0]) * M_LON, (seg[1][1] - seg[0][1]) * M_LAT) * 180 / Math.PI + 360) % 360;
  if (b11 > 90 && b11 < 270) b11 = (b11 + 180) % 360;          // walk north
  const west = (b11 + 270) % 360;
  const sidewalkStart = go(go(junction, (b11 + 180) % 360, 150), west, 10);
  const stop = go(sidewalkStart, west, 7);
  const end = go(sidewalkStart, b11, 300);
  const route = { legs: [{ steps: [
    { name: "", distance: 7, duration: 5, geometry: { coordinates: [stop, sidewalkStart] },
      maneuver: { type: "depart", bearing_before: 0, bearing_after: (west + 180) % 360, location: stop, instruction: "Walk east." } },
    { name: "", distance: 300, duration: 214, geometry: { coordinates: [sidewalkStart, go(sidewalkStart, b11, 150), end] },
      maneuver: { type: "turn", modifier: "left", bearing_before: (west + 180) % 360, bearing_after: b11,
        location: sidewalkStart, instruction: "Turn left onto the walkway." } },
    { name: "", distance: 0, duration: 0, geometry: { coordinates: [end, end] },
      maneuver: { type: "arrive", location: end, instruction: "You have arrived at your destination." } },
  ] }] };

  it("names the street and the way along it instead of a left/right", () => {
    const out = extractSteps(route, "en");
    expect(out.map(s => s.instruction)).toEqual([
      "Walk to 11th Street and follow it toward Marne Avenue",
      "Cross Marne Avenue and continue straight",
      "You have arrived at your destination.",
    ]);
    expect(out[0].distance + out[1].distance).toBe(307);
    expect(out.at(-1)).toMatchObject({ arrive: true, side: null });
  });

  it("in Korean", () => {
    expect(extractSteps(route, "ko").slice(0, 2).map(s => s.instruction)).toEqual([
      "11번가(으)로 가서 Marne Avenue 방향으로 걸으세요",
      "Marne Avenue을(를) 건너 계속 직진하세요",
    ]);
  });
});

describe("sidewalkOf", () => {
  it("ignores paths that cross a street rather than follow it", () => {
    // The 11 m jog across 11th Street at the end of the real walk.
    expect(sidewalkOf(toMiniMall.legs[0].steps[3].geometry.coordinates)).toBeNull();
  });
  it("finds nothing in an empty corner", () => {
    expect(sidewalkOf([ORIGIN, go(ORIGIN, 0, 100)])).toBeNull();
  });
});

// 24 real walks (12 pairs, both ways) fetched 2026-10-01 and read through by
// hand. The snapshot is the reviewed wording: a rule change that alters any
// of it shows up as a diff to read before accepting.
describe("pair check", () => {
  const files = import.meta.glob("./fixtures/pairs/*.json", { eager: true, import: "default" });
  const walks = Object.entries(files).sort(([a], [b]) => a.localeCompare(b));

  it("never says 'walkway', never opens with a bare turn, never repeats a line", () => {
    for (const [, f] of walks) {
      for (const lang of ["en", "ko"]) {
        const out = extractSteps(f.routes[0], lang).map(s => s.instruction);
        expect(out.join(" ")).not.toMatch(/walkway/i);
        expect(out[0]).not.toMatch(/^(Turn|Bear|Keep)/);
        out.forEach((l, i) => expect(l).not.toBe(out[i - 1]));
      }
    }
  });

  it("matches the reviewed wording", async () => {
    const text = walks.map(([, f]) => {
      const out = lang => extractSteps(f.routes[0], lang)
        .map(s => `    ${s.instruction}${s.distance ? ` · ${s.distance} m` : ""}`).join("\n");
      return `## ${f.origin.name} → ${f.dest.name} (${Math.round(f.routes[0].distance)} m)\n${out("en")}\n  ko:\n${out("ko")}`;
    }).join("\n\n");
    await expect(text + "\n").toMatchFileSnapshot("./fixtures/pairs.snap.md");
  });
});

import { describe, it, expect } from "vitest";
import { extractSteps, mainRoad, sidewalkOf } from "./steps.js";
import { reverseRoute } from "./fixtures/reverse.js";
import MAUDE from "./fixtures/maude-to-mini-mall.json";

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
      "Turn right onto 11th Street",
      "Cross 11th Street. Your destination is on the left.",
    ]);
    expect(extractSteps(toMiniMall, "en").map(s => s.distance)).toEqual([115, 457, 151, 0]);
  });

  it("uses Korean street names where OSM has them", () => {
    expect(lines(toMiniMall, "ko")).toEqual([
      "9번가을(를) 따라 Marne Avenue 방향으로 걸으세요",
      "Marne Avenue(으)로 좌회전하세요",
      "11번가(으)로 우회전하세요",
      "11번가을(를) 건너세요. 목적지는 왼쪽에 있습니다.",
    ]);
  });

  it("names the route by the street walked longest", () => {
    expect(mainRoad(toMiniMall, "en")).toBe("Marne Avenue");
  });

  it("reads as its own walk in reverse, not a copy", () => {
    expect(lines(toMaude)).toEqual([
      "Cross 11th Street",
      "Turn right onto 11th Street",
      "Turn left onto Marne Avenue",
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
    expect(out).toEqual(["Start walking", "Turn left", "You have arrived at your destination."]);
  });

  it("drops a jog that leaves you going the same way", () => {
    const out = extractSteps(synth([[0, 100], [270, 6], [0, 150]]), "en");
    expect(out.map(s => s.instruction)).toEqual(["Start walking", "You have arrived at your destination."]);
    expect(out[0].distance).toBe(256);
  });

  it("names a slight bend only after a long silent stretch", () => {
    expect(lines(synth([[0, 80], [30, 100]]))).toHaveLength(2);
    expect(lines(synth([[0, 250], [30, 100]]))[1]).toBe("Bear right");
  });

  it("says which side the destination is on when Mapbox knows", () => {
    expect(lines(synth([[0, 100]], { modifier: "right" })).at(-1)).toBe("Your destination is on the right.");
    expect(lines(synth([[0, 100]], { modifier: "left" }), "ko").at(-1)).toBe("목적지는 왼쪽에 있습니다.");
  });

  it("names a turn onto a Mapbox-named street, Korean half in ko", () => {
    const route = synth([[0, 100], [90, 100, "11th Street; 11번가"]]);
    expect(lines(route)[1]).toBe("Turn right onto 11th Street");
    expect(lines(route, "ko")[1]).toBe("11번가(으)로 우회전하세요");
    expect(lines(route)[0]).toBe("Walk toward 11th Street");
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

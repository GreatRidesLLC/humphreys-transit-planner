import { describe, it, expect } from "vitest";
import { extractSteps, mainRoad } from "./steps.js";

// Mapbox-shaped step. `name` "" is an unnamed footpath.
const step = (type, modifier, name, distance, instruction, location = [127.005, 36.965]) => ({
  name, distance, duration: Math.round(distance / 1.4),
  maneuver: { type, modifier, instruction, location },
});
const route = steps => ({ legs: [{ steps }] });

// Maude Hall → Family Mini Mall: mostly unnamed paths, then one named street.
const MAUDE_TO_MINI_MALL = route([
  step("depart", undefined, "", 120, "Walk east."),
  step("turn", "left", "", 200, "Turn left."),
  step("turn", "right", "", 5, "Turn right."),          // sidewalk jog
  step("continue", "straight", "", 60, "Continue straight."),
  step("turn", "right", "", 324, "Turn right."),
  step("turn", "right", "11th Street/11번가", 16, "Turn right onto 11th Street/11번가."),
  step("arrive", undefined, "", 0, "You have arrived at your destination."),
]);

describe("extractSteps", () => {
  it("keeps real turns on unnamed paths and heads toward the first street", () => {
    const out = extractSteps(MAUDE_TO_MINI_MALL, "en");
    expect(out.map(s => s.instruction)).toEqual([
      "Walk toward 11th Street",
      "Turn left.",
      "Turn right.",
      "Turn right onto 11th Street.",
      "You have arrived at your destination.",
    ]);
    // The jog and the straight stretch roll into the turn before them.
    expect(out.map(s => s.distance)).toEqual([120, 265, 324, 16, 0]);
    expect(out[0].toward).toBeUndefined();
  });

  it("words the street heading in Korean", () => {
    const out = extractSteps(MAUDE_TO_MINI_MALL, "ko");
    expect(out[0].instruction).toBe("11번가 방향으로 걸으세요");
  });

  it("keeps the full stop once when the Hangul half survives", () => {
    const out = extractSteps(route([
      step("depart", undefined, "", 50, "동쪽으로 걸으세요."),
      step("turn", "right", "11th Street/11번가", 40, "11th Street/11번가(으)로 우회전하세요."),
      step("arrive", undefined, "", 0, "목적지에 도착했습니다."),
    ]), "ko");
    expect(out[1].instruction).toBe("11번가(으)로 우회전하세요.");
  });

  it("starts along a named street when there is one", () => {
    const out = extractSteps(route([
      step("depart", undefined, "9th Street", 300, "Walk west on 9th Street."),
      step("turn", "left", "11th Street", 200, "Turn left onto 11th Street."),
      step("arrive", undefined, "", 0, "Your destination is on the left."),
    ]), "en");
    expect(out[0].instruction).toBe("Walk along 9th Street toward 11th Street");
  });

  it("breaks up a long silent stretch at a bend", () => {
    const out = extractSteps(route([
      step("depart", undefined, "", 250, "Walk north."),
      step("new name", "slight left", "", 100, "Continue slightly left."),
      step("arrive", undefined, "", 0, "Arrive."),
    ]), "en");
    expect(out).toHaveLength(3);
    expect(out[0]).toMatchObject({ instruction: "Start walking", toward: true });
  });

  it("drops a slight bend inside a short stretch", () => {
    const out = extractSteps(route([
      step("depart", undefined, "", 80, "Walk north."),
      step("new name", "slight left", "", 100, "Continue slightly left."),
      step("arrive", undefined, "", 0, "Arrive."),
    ]), "en");
    expect(out.map(s => s.distance)).toEqual([180, 0]);
  });
});

describe("mainRoad", () => {
  it("names the street walked longest, in the requested language", () => {
    expect(mainRoad(MAUDE_TO_MINI_MALL, "en")).toBe("11th Street");
    expect(mainRoad(MAUDE_TO_MINI_MALL, "ko")).toBe("11번가");
  });
});

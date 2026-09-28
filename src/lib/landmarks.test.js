import { describe, it, expect } from "vitest";
import { withLandmarks, nearestLandmark } from "./landmarks.js";
import { STOP_COORDS } from "./routing.js";

const at = name => [STOP_COORDS[name].lon, STOP_COORDS[name].lat];
const SCHOOL = [127.0129403, 36.9597081]; // Humphreys Central Elementary (OSM place)
const NOWHERE = [127.0440, 36.9790];     // on-post corner, nothing named nearby

describe("nearestLandmark", () => {
  it("finds a stop at its own coordinate", () => {
    expect(nearestLandmark(at("Commissary"), 50)?.name).toBe("Commissary");
  });
  it("returns null past the radius", () => {
    expect(nearestLandmark(NOWHERE, 50)).toBeNull();
  });
});

describe("withLandmarks", () => {
  const steps = [
    { instruction: "Walk along Pacific Victors Avenue", location: NOWHERE, toward: true },
    { instruction: "Turn left onto 11th Street.", location: at("Commissary") },
    { instruction: "Your destination is on the left.", location: SCHOOL },
  ];

  it("names a heading for the first step and a landmark at a turn (en)", () => {
    const out = withLandmarks(steps, { lang: "en" });
    expect(out[0].instruction).toBe("Walk along Pacific Victors Avenue toward Commissary");
    expect(out[1].instruction).toBe("Turn left onto 11th Street (by Commissary)");
    expect(out[2].instruction).toBe(steps[2].instruction);
  });

  it("uses Korean place names and word order in ko", () => {
    const ko = [
      { instruction: "걷기 시작하세요", location: NOWHERE, toward: true },
      { instruction: "Your destination is on the left.", location: SCHOOL },
    ];
    const out = withLandmarks(ko, { lang: "ko" });
    expect(out[0].instruction).toBe("험프리스 센트럴 초등학교 방향으로 걷기 시작하세요");
  });

  it("falls back to the leg destination when nothing named is nearby", () => {
    const lone = [
      { instruction: "Start walking", location: NOWHERE, toward: true },
      { instruction: "Arrive", location: NOWHERE },
    ];
    expect(withLandmarks(lone, { dest: "Bus Terminal" })[0].instruction).toBe("Start walking toward Bus Terminal");
    expect(withLandmarks(lone)[0].instruction).toBe("Start walking");
  });

  it("leaves steps without a location untouched", () => {
    const old = [{ instruction: "Walk west." }, { instruction: "Turn left." }, { instruction: "Arrive." }];
    expect(withLandmarks(old)).toEqual(old);
  });
});

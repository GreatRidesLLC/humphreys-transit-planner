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

  it("never heads toward, or turns by, the place the walk starts or ends at", () => {
    // Family Mini Mall → Maude Hall: the first turn is a few metres from the start.
    const flip = [
      { instruction: "Start walking", location: at("Family Mini Mall / Gas Station"), toward: true },
      { instruction: "Turn right onto 11th Street.", location: at("Family Mini Mall / Gas Station") },
      { instruction: "Turn left onto 9th Street.", location: at("LTG Maude Hall (9th St)") },
      { instruction: "Your destination is on the right.", location: at("LTG Maude Hall (9th St)") },
    ];
    const out = withLandmarks(flip);
    // Not "toward Family Mini Mall": the heading falls through to the end.
    expect(out[0].instruction).toBe("Start walking toward LTG Maude Hall (9th St)");
    expect(out[1].instruction).toBe("Turn right onto 11th Street.");
    expect(out[2].instruction).toBe("Turn left onto 9th Street.");
  });

  it("opens the first step with where the walk starts", () => {
    const first = [
      { instruction: "Walk toward 11th Street", location: NOWHERE },
      { instruction: "Arrive", location: NOWHERE },
    ];
    expect(withLandmarks(first, { origin: "Family Mini Mall Express" })[0].instruction)
      .toBe("From Family Mini Mall Express, walk toward 11th Street");
    expect(withLandmarks([{ ...first[0], instruction: "11번가 방향으로 걸으세요" }, first[1]],
      { lang: "ko", origin: "Family Mini Mall Express" })[0].instruction)
      .toBe("Family Mini Mall Express에서 11번가 방향으로 걸으세요");
  });

  it("names a bus stop as a stop at either end", () => {
    const walk = [
      { instruction: "Walk to 11th Street and follow it toward Marne Avenue", location: NOWHERE },
      { instruction: "Cross Marne Avenue and continue straight", location: NOWHERE },
      { instruction: "Your destination is on the right.", location: NOWHERE, arrive: true, side: "right", cross: null },
    ];
    const out = withLandmarks(walk, { origin: "Family Mini Mall / Gas Station", originStop: true,
      dest: "Commissary", destStop: true });
    expect(out[0].instruction).toBe("From the Family Mini Mall / Gas Station Bus Stop, walk to 11th Street and follow it toward Marne Avenue");
    expect(out[2].instruction).toBe("The Commissary Bus Stop is on the right.");
    const ko = withLandmarks(walk, { lang: "ko", origin: "Family Mini Mall / Gas Station", originStop: true,
      dest: "Commissary", destStop: true });
    expect(ko[0].instruction).toMatch(/^Family Mini Mall \/ Gas Station 버스 정류장에서 /);
    expect(ko[2].instruction).toBe("Commissary 버스 정류장은(는) 오른쪽에 있습니다.");
  });

  it("names a place destination, keeping a closing crossing", () => {
    const walk = [
      { instruction: "Walk along 9th Street toward Marne Avenue", location: NOWHERE },
      { instruction: "Cross 11th Street. Your destination is on the left.", location: NOWHERE,
        arrive: true, side: "left", cross: "11th Street" },
    ];
    expect(withLandmarks(walk, { dest: "Family Mini Mall Express" })[1].instruction)
      .toBe("Cross 11th Street. Family Mini Mall Express is on the left.");
    const noSide = [walk[0], { instruction: "You have arrived at your destination.", location: NOWHERE, arrive: true, side: null }];
    expect(withLandmarks(noSide, { dest: "Commissary", destStop: true })[1].instruction).toBe("Arrive at the Commissary Bus Stop.");
    expect(withLandmarks(noSide)[1].instruction).toBe("You have arrived at your destination.");
  });

  it("leaves steps without a location untouched", () => {
    const old = [{ instruction: "Walk west." }, { instruction: "Turn left." }, { instruction: "Arrive." }];
    expect(withLandmarks(old)).toEqual(old);
  });
});

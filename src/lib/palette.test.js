import { describe, it, expect } from "vitest";
import { ROUTES } from "./routing.js";
import { ROUTE_BADGE, contrastRatio } from "./palette.js";

describe("route badge contrast", () => {
  it.each(Object.entries(ROUTE_BADGE))("%s ink clears AA on its fill", (id, { bg, fg }) => {
    const ratio = contrastRatio(bg, fg);
    expect(ratio, `${id}: ${fg} on ${bg} is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
  });

  it("covers every route, and the badge fill is the route colour", () => {
    expect(Object.keys(ROUTE_BADGE).sort()).toEqual(Object.keys(ROUTES).sort());
    for (const [id, r] of Object.entries(ROUTES)) {
      expect(r.color.toLowerCase(), `${id} ROUTES.color vs ROUTE_BADGE.bg`)
        .toBe(ROUTE_BADGE[id].bg.toLowerCase());
    }
  });
});

describe("contrastRatio", () => {
  it("matches known reference values", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
  });
});

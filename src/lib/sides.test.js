import { describe, it, expect } from "vitest";
import { sideKeyFor, sidesFor, nearestSideIndex, resolvedSide, sidePoint } from "./sides.js";
import { STOP_COORDS, haversineMeters } from "./routing.js";

const CES = "osm:way/1304087785"; // Humphreys Central Elementary School

describe("building sides", () => {
  it("keys search items by building number or OSM id", () => {
    expect(sideKeyFor({ bldg: "3030" })).toBe("bldg:3030");
    expect(sideKeyFor({ osmId: "way/1304087785" })).toBe(CES);
    expect(sideKeyFor({ stop: "Bus Terminal" })).toBeNull();
  });

  it("has at least two named street sides for Central Elementary", () => {
    const sides = sidesFor(CES);
    expect(sides.length).toBeGreaterThanOrEqual(2);
    for (const s of sides) expect(s.street).toBeTruthy();
  });

  it("defaults to the side nearest the trip's stop, and honours a choice", () => {
    const sides = sidesFor(CES);
    const stop = "Family Housing Towers (5100s Block)";
    const i = nearestSideIndex(sides, stop);
    const s = STOP_COORDS[stop];
    const dist = k => haversineMeters(sides[k].lat, sides[k].lon, s.lat, s.lon);
    for (let k = 0; k < sides.length; k++) expect(dist(i)).toBeLessThanOrEqual(dist(k));
    expect(resolvedSide(CES, null, stop)).toBe(i);
    const other = (i + 1) % sides.length;
    expect(resolvedSide(CES, other, stop)).toBe(other);
    expect(sidePoint(CES, other, stop)).toEqual({ lat: sides[other].lat, lon: sides[other].lon, kind: "side" });
  });

  it("returns null for places without sides", () => {
    expect(sidesFor("bldg:999999")).toBeNull();
    expect(sidePoint("bldg:999999", null, "Bus Terminal")).toBeNull();
  });
});

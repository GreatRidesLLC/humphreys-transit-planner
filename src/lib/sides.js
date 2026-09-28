// Street-side start/end points for big places (scripts/gen_building_sides.py).
//
// A big footprint's centre is a poor walk endpoint: Mapbox snaps it to
// whichever road is nearest the middle, often the wrong side of the
// building. Each big place instead offers one point per bordering named
// street. The rider picks the side they're on; until they do, the side
// nearest the trip's bus stop is used. Only the chosen side is ever fetched.

import SIDES from "../data/building_sides.json";
import { STOP_COORDS, haversineMeters } from "./routing.js";

// Search-index item → key into building_sides.json.
export function sideKeyFor(item) {
  if (!item) return null;
  if (item.bldg) return `bldg:${item.bldg}`;
  if (item.osmId) return `osm:${item.osmId}`;
  return null;
}

export function sidesFor(key) {
  return (key && SIDES.places?.[key]?.sides) || null;
}

// Index of the side closest to `stopName`'s coords (0 when unknown).
export function nearestSideIndex(sides, stopName) {
  const s = STOP_COORDS[stopName];
  if (!sides?.length || !s || s.lat == null) return 0;
  let best = 0, bestM = Infinity;
  sides.forEach((side, i) => {
    const m = haversineMeters(side.lat, side.lon, s.lat, s.lon);
    if (m < bestM) { best = i; bestM = m; }
  });
  return best;
}

// The side index to use: the rider's choice, else the one nearest the stop.
export function resolvedSide(key, chosen, stopName) {
  const sides = sidesFor(key);
  if (!sides) return null;
  return chosen != null && sides[chosen] ? chosen : nearestSideIndex(sides, stopName);
}

// Walk endpoint for a big place, or null when the place has no sides.
export function sidePoint(key, chosen, stopName) {
  const sides = sidesFor(key);
  const i = resolvedSide(key, chosen, stopName);
  if (!sides || i == null) return null;
  return { lat: sides[i].lat, lon: sides[i].lon, kind: "side" };
}

// Landmark hints for walking directions.
//
// Compass bearings ("walk west") don't help someone who doesn't know which
// way west is, so the Worker words the first step around street names and
// sends each step's location. This module names a nearby thing the rider
// can see (a bus stop, a named building, an OSM place) from our own
// bundled data. No network, no Mapbox.

import PLACES_OSM from "../data/places_osm.json";
import { STOP_COORDS, BUILDING_COORDS, haversineMeters } from "./routing.js";

// Close enough to be visible from the maneuver point.
const TURN_RADIUS_M = 50;
// "Head toward X": X may sit a little past the end of the first stretch.
const TOWARD_RADIUS_M = 80;

const LANDMARKS = [
  // Stop names stay English in both locales by design.
  ...Object.entries(STOP_COORDS)
    .filter(([, s]) => s && s.lat != null)
    .map(([name, s]) => ({ name, name_ko: null, lat: s.lat, lon: s.lon })),
  ...Object.values(BUILDING_COORDS)
    .filter(b => b && b.name && b.lat != null)
    .map(b => ({ name: b.name, name_ko: null, lat: b.lat, lon: b.lon })),
  ...(PLACES_OSM.places || [])
    .filter(p => p.lat != null)
    .map(p => ({ name: p.name, name_ko: p.name_ko || null, lat: p.lat, lon: p.lon })),
];

// A landmark this close to where the walk starts or ends is the walk's own
// origin or destination: "toward" the place you are standing at, or "by" the
// place you are about to arrive at, tells the walker nothing.
const ENDPOINT_RADIUS_M = 80;

// [lon, lat] → nearest landmark within maxM, or null. `exclude` lists
// [lon, lat] points whose surrounding landmarks are skipped.
export function nearestLandmark(location, maxM, exclude = []) {
  if (!Array.isArray(location)) return null;
  const [lon, lat] = location;
  const skip = exclude.filter(Array.isArray);
  let best = null, bestM = Infinity;
  for (const l of LANDMARKS) {
    if (skip.some(([x, y]) => haversineMeters(y, x, l.lat, l.lon) <= ENDPOINT_RADIUS_M)) continue;
    const m = haversineMeters(lat, lon, l.lat, l.lon);
    if (m < bestM) { best = l; bestM = m; }
  }
  return best && bestM <= maxM ? best : null;
}

const TEXT = {
  en: {
    toward: (instr, name) => `${instr} toward ${name}`,
    near: (instr, name) => `${instr} (by ${name})`,
    from: (instr, name) => `From ${name}, ${lowerFirst(instr)}`,
  },
  ko: {
    toward: (instr, name) => `${name} 방향으로 ${instr}`,
    near: (instr, name) => `${instr} (${name} 근처)`,
    from: (instr, name) => `${name}에서 ${instr}`,
  },
};

const trimDot = s => s.replace(/[.。]\s*$/, "");
// "Walk toward …" → "walk toward …"; leaves acronyms ("PX …") alone.
const lowerFirst = s => /^[A-Z][a-z]/.test(s) ? s[0].toLowerCase() + s.slice(1) : s;

// Returns a copy of `steps` with landmark-enriched `instruction`s.
// `dest` is the leg's destination label, used as the heading of last resort.
// `origin` is where the walk starts, if it has a name; it opens the first
// step ("From Family Mini Mall Express, walk toward 11th Street").
export function withLandmarks(steps, { lang = "en", dest = null, origin = null } = {}) {
  if (!Array.isArray(steps) || !steps.length) return steps;
  const txt = TEXT[lang] || TEXT.en;
  const label = l => (lang === "ko" && l.name_ko) || l.name;
  const last = steps.length - 1;
  const start = steps[0].location, end = steps[last].location;
  return steps.map((s, i) => {
    if (i === 0) {
      let instruction = s.instruction;
      if (s.toward) {
        // Heading: something by the end of the first stretch, else by the
        // end of the walk, else the leg's destination. Never the start.
        const l = nearestLandmark(steps[1]?.location, TOWARD_RADIUS_M, [start])
          || nearestLandmark(end, TOWARD_RADIUS_M, [start]);
        const name = l ? label(l) : dest;
        if (name) instruction = txt.toward(trimDot(instruction), name);
      }
      if (origin) instruction = txt.from(trimDot(instruction), origin);
      return instruction === s.instruction ? s : { ...s, instruction };
    }
    if (i === last) return s;
    const l = nearestLandmark(s.location, TURN_RADIUS_M, [start, end]);
    return l ? { ...s, instruction: txt.near(trimDot(s.instruction), label(l)) } : s;
  });
}

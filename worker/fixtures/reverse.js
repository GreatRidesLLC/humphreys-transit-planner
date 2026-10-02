// Builds the reverse walk from a Mapbox route: same path, walked the other
// way, with headings recomputed. Lets one billed fixture test both directions.
const M_LAT = 110540, M_LON = 111320 * Math.cos(36.965 * Math.PI / 180);
const bearing = (a, b) =>
  (Math.atan2((b[0] - a[0]) * M_LON, (b[1] - a[1]) * M_LAT) * 180 / Math.PI + 360) % 360;

export function reverseRoute(route) {
  const steps = route.legs[0].steps.filter(s => s.maneuver.type !== "arrive").reverse();
  const out = steps.map((s, i) => {
    const coords = [...s.geometry.coordinates].reverse();
    const prev = i > 0 ? [...steps[i - 1].geometry.coordinates].reverse() : null;
    return {
      name: s.name, distance: s.distance, duration: s.duration,
      geometry: { type: "LineString", coordinates: coords },
      maneuver: {
        type: i === 0 ? "depart" : "turn",
        bearing_before: prev ? bearing(prev.at(-2), prev.at(-1)) : 0,
        bearing_after: bearing(coords[0], coords[1]),
        location: coords[0],
        instruction: "(reversed)",
      },
    };
  });
  const end = out.at(-1).geometry.coordinates;
  out.push({ name: "", distance: 0, duration: 0, geometry: { type: "LineString", coordinates: [end.at(-1), end.at(-1)] },
    maneuver: { type: "arrive", bearing_before: bearing(end.at(-2), end.at(-1)), bearing_after: 0,
      location: end.at(-1), instruction: "You have arrived at your destination." } });
  return { ...route, legs: [{ steps: out }] };
}

// Pure routing + scheduling logic, extracted from App.jsx so it can be
// unit-tested without pulling React / Leaflet / DOM into the test runner.
// Everything here is side-effect free and depends only on JSON data and Date.

import SCHEDULES_JSON from "../data/schedules.json";
import STOP_COORDS_JSON from "../data/stop_coords.json";
import BUILDINGS_OSM_JSON from "../data/buildings_osm.json";

// ─── Time helpers ─────────────────────────────────────────────────────────────
export const pad2 = n => String(n).padStart(2, "0");
export const addMin = (d, m) => new Date(d.getTime() + m * 60000);
export const subMin = (d, m) => new Date(d.getTime() - m * 60000);

// ─── Geo ──────────────────────────────────────────────────────────────────────
export const STOP_COORDS = STOP_COORDS_JSON.stops || {};
export const BUILDING_COORDS = BUILDINGS_OSM_JSON.buildings || {};
const WALK_FLOOR_MIN = 3;
const WALK_SPEED_M_PER_MIN = 83; // ≈ 5 km/h average

export function haversineMeters(lat1, lon1, lat2, lon2) {
  const toRad = d => d * Math.PI / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat/2)**2
          + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon/2)**2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function walkMinutes(bldgNum, stopName, userCoords) {
  const s = STOP_COORDS[stopName];
  if (s && userCoords && userCoords.lat != null) {
    const meters = haversineMeters(userCoords.lat, userCoords.lon, s.lat, s.lon);
    return Math.max(WALK_FLOOR_MIN, Math.ceil(meters / WALK_SPEED_M_PER_MIN));
  }
  if (!bldgNum) return WALK_FLOOR_MIN;
  const b = BUILDING_COORDS[bldgNum];
  if (!b || !s || b.lat == null || s.lat == null) return WALK_FLOOR_MIN;
  const meters = haversineMeters(b.lat, b.lon, s.lat, s.lon);
  return Math.max(WALK_FLOOR_MIN, Math.ceil(meters / WALK_SPEED_M_PER_MIN));
}

export function nearestStopTo(coords) {
  let bestStop = null, bestM = Infinity;
  for (const [name, s] of Object.entries(STOP_COORDS)) {
    if (s.lat == null) continue;
    const m = haversineMeters(coords.lat, coords.lon, s.lat, s.lon);
    if (m < bestM) { bestM = m; bestStop = name; }
  }
  return bestStop ? { stop: bestStop, meters: bestM } : null;
}

// ─── Routes ───────────────────────────────────────────────────────────────────
export const ROUTES = {
  BLUE:  { id:"BLUE",  name:"Blue Route",   color:"#5bb8ff", freq:15, hours:"0600–2200", days:"Mon–Fri",
    stops:["Pedestrian Gate","Provider Grill DFAC","SLQs (12200s Block)","Eighth Army HQ","Corps of Engineers","TMP / Driver's Licensing","Airfield Operations","Talon Cafe DFAC","Barracks (6000s Block)","Pacific Victors Chapel","Spartan DFAC","LTG Maude Hall (9th St)","Commissary","Main Post Office","Main Exchange (PX)","Pittman DFAC","Sitman Fitness Center","2ID Sustainment","Central Issue Facility"] },
  BLACK: { id:"BLACK", name:"Black Route",  color:"#8090a0", freq:25, hours:"0600–2200", days:"Mon–Fri",
    stops:["Pedestrian Gate","Provider Grill DFAC","SLQs (12200s Block)","Eighth Army HQ","Corps of Engineers","Pacific Victors Chapel","Commissary","LTG Maude Hall (9th St)","Spartan DFAC"] },
  GREEN: { id:"GREEN", name:"Green Route",  color:"#4dde88", freq:15, hours:"0600–2200", days:"Mon–Fri",
    stops:["Pedestrian Gate","Provider Grill DFAC","Desiderio ATC Tower","Law Enforcement Center (DES)","Bus Terminal","Lodging","KTO Museum","MSG Jenkins Medical Clinic","Collier Fitness Center","Family Housing Towers (Tropic Lightning Ave)","Talon Cafe DFAC","Airfield Operations","Barracks (6000s Block)","Pacific Victors Chapel","Spartan DFAC","LTG Maude Hall (9th St)","Commissary","Main Exchange (PX)","Balboni Sports Field (5th St)"] },
  ORANGE:{ id:"ORANGE",name:"Orange Route", color:"#ff8c3a", freq:30, hours:"0600–2200", days:"Mon–Fri",
    stops:["Pedestrian Gate","Provider Grill DFAC","SLQs (12200s Block)","TMP / Driver's Licensing","Eighth Army HQ"] },
  PURPLE:{ id:"PURPLE",name:"Purple Route", color:"#c47aff", freq:15, hours:"0600–2200", days:"Mon–Fri",
    stops:["Brian D. Allgood Hospital","Bus Terminal","Collier Fitness Center","Turner Fitness Center","TMP / Driver's Licensing","Spartan DFAC","Sitman Fitness Center","Barracks (6800s & 6900s Block)","Balboni Sports Field (5th St)","Pittman DFAC"] },
  GOLD:  { id:"GOLD",  name:"Gold Route",   color:"#FFD040", freq:20, hours:"0900–2100", days:"Mon–Sun",
    verified:true, note:"Departs Bus Terminal :00 :20 :40 each hour (from publicly posted July 2023 PDF)",
    stops:["Bus Terminal","Barracks (700s Block)","Morning Calm Center","Sentry Village Burger King","Sentry Village Mini Mall","MSG Jenkins Medical Clinic","Freedom Chapel","Collier Fitness Center","Family Housing Towers (Tropic Lightning Ave)","Family Housing Towers (Taro Ave)","Red Cloud Circle","Main Post Office","Main Exchange (PX)","Balboni Sports Field (Marne Ave)","Barracks (6800s Block)","River Bend Golf Course"] },
  BROWN: { id:"BROWN", name:"Brown Route",  color:"#e8944a", freq:30, hours:"1600–2200", days:"Fri–Sat",
    verified:true, note:"Transcribed from publicly posted PDF (15 July 2023). Friday evening + Saturday/Training Holiday only.",
    stops:["Pedestrian Gate","Provider Grill DFAC","SLQs (12200s Block)","Eighth Army HQ","Pacific Victors Chapel","Downtown Plaza","Balboni Sports Field (Marne Ave)","Balboni Sports Field (5th St)","Pittman DFAC","Spartan DFAC","TMP / Driver's Licensing","Airfield Operations","Family Housing Towers (Tropic Lightning Ave)","Collier Fitness Center","Bus Terminal"] },
  PINK:  { id:"PINK",  name:"Pink Route",   color:"#ff6bb5", freq:15, hours:"1700–2300", days:"Fri–Sat",
    verified:true, note:"Transcribed from publicly posted PDF (15 July 2023). Trial-run route; Friday/Training Holiday + Saturday only.",
    stops:["Pacific Victors Chapel","Family Mini Mall / Gas Station","Family Housing Towers (Taro Ave)","Family Housing Towers (15th Street)","Talon Cafe DFAC","TMP / Driver's Licensing"] },
};

export const STOP_ROUTES = {};
for (const [id, r] of Object.entries(ROUTES))
  for (const s of r.stops) { if (!STOP_ROUTES[s]) STOP_ROUTES[s]=[]; STOP_ROUTES[s].push(id); }

export const ALL_STOPS = [...new Set(Object.values(ROUTES).flatMap(r=>r.stops))].sort();

// ─── Service-hours / day-of-week filter ──────────────────────────────────────
export const inService = (r, d) => {
  const dow = d.getDay();
  if (r.days === "Mon–Fri" && (dow === 0 || dow === 6)) return false;
  if (r.days === "Fri–Sat" && !(dow === 5 || dow === 6)) return false;
  const [s, e] = r.hours.split("–");
  const mins = d.getHours() * 60 + d.getMinutes();
  const sm = parseInt(s.slice(0,2))*60 + parseInt(s.slice(2));
  const em = parseInt(e.slice(0,2))*60 + parseInt(e.slice(2));
  return mins >= sm && mins <= em;
};

export const serviceEndToday = (r, ref) => {
  const dow = ref.getDay();
  if (r.days === "Mon–Fri" && (dow === 0 || dow === 6)) return null;
  if (r.days === "Fri–Sat" && !(dow === 5 || dow === 6)) return null;
  const [, e] = r.hours.split("–");
  const em = parseInt(e.slice(0,2))*60 + parseInt(e.slice(2));
  const d = new Date(ref);
  d.setHours(0, 0, 0, 0);
  d.setMinutes(em);
  return d;
};

// ─── Scheduled-departure lookup ──────────────────────────────────────────────
export const ROUTE_SCHEDULE_INDEX = (() => {
  const idx = {};
  for (const [stop, blob] of Object.entries(SCHEDULES_JSON.stops || {})) {
    for (const [rid, byDay] of Object.entries(blob.by_route_pdf || {})) {
      const stopMap = (idx[rid] ||= {});
      const dayMap = (stopMap[stop] ||= {});
      for (const [day, times] of Object.entries(byDay)) {
        dayMap[day] = times
          .map(t => parseInt(t.slice(0,2),10)*60 + parseInt(t.slice(3,5),10))
          .sort((a,b)=>a-b);
      }
    }
  }
  return idx;
})();

const DAY_TYPE_DOWS = {
  "MONDAY-FRIDAY":             [1,2,3,4,5],
  "MONDAY-SATURDAY":           [1,2,3,4,5,6],
  "MONDAY-THURSDAY":           [1,2,3,4],
  "FRIDAY":                    [5],
  "FRIDAY / TRAINING HOLIDAY": [5],
  "FRIDAY & SATURDAY":         [5,6],
  "SATURDAY":                  [6],
  "SATURDAY / TRAINING HOLIDAY":[6],
  "SUNDAY-THURSDAY":           [0,1,2,3,4],
  "SUNDAY":                    [0],
};

function pickDayType(dow, available) {
  let best = null, bestSize = Infinity;
  for (const key of available) {
    const days = DAY_TYPE_DOWS[key];
    if (!days || !days.includes(dow)) continue;
    if (days.length < bestSize) { best = key; bestSize = days.length; }
  }
  return best;
}

function dateAtMinutes(ref, dayOffset, mins) {
  const d = new Date(ref);
  d.setDate(d.getDate() + dayOffset);
  d.setHours(0, 0, 0, 0);
  d.setMinutes(mins);
  d.setSeconds(0, 0);
  return d;
}

function searchSchedule(stopSched, ref, step) {
  const refMin = ref.getHours() * 60 + ref.getMinutes();
  for (let dayOffset = 0; dayOffset < 8; dayOffset++) {
    const probeDate = new Date(ref);
    probeDate.setDate(probeDate.getDate() + step * dayOffset);
    const dayType = pickDayType(probeDate.getDay(), Object.keys(stopSched));
    if (!dayType) continue;
    const times = stopSched[dayType];
    if (!times.length) continue;
    if (step > 0) {
      for (const m of times) {
        if (dayOffset > 0 || m >= refMin) return dateAtMinutes(ref, dayOffset, m);
      }
    } else {
      for (let i = times.length - 1; i >= 0; i--) {
        const m = times[i];
        if (dayOffset > 0 || m <= refMin) return dateAtMinutes(ref, -dayOffset, m);
      }
    }
  }
  return null;
}

function anchoredHeuristic(R, stop, ref, step) {
  const idx = R.stops.indexOf(stop);
  if (idx < 0) return null;
  const offsetMin = idx * 2;
  let probe = new Date(ref);
  for (let i = 0; i < 200; i++) {
    const anchor = new Date(probe);
    anchor.setHours(0, 0, 0, 0);
    const diffMin = (probe - anchor) / 60000;
    const k = step > 0
      ? Math.max(0, Math.ceil((diffMin - offsetMin) / R.freq))
      : Math.floor((diffMin - offsetMin) / R.freq);
    if (step < 0 && k < 0) {
      probe = new Date(anchor.getTime() - 60000);
      continue;
    }
    const cand = new Date(anchor);
    cand.setMinutes(offsetMin + k * R.freq);
    cand.setSeconds(0, 0);
    if (inService(R, cand)) return cand;
    probe = new Date(cand.getTime() + step * 60000);
  }
  return null;
}

export function nextScheduledDeparture(R, stop, after) {
  const stopSched = ROUTE_SCHEDULE_INDEX[R.id]?.[stop];
  if (stopSched) return searchSchedule(stopSched, after, +1);
  return anchoredHeuristic(R, stop, after, +1);
}

export function prevScheduledDeparture(R, stop, before) {
  const stopSched = ROUTE_SCHEDULE_INDEX[R.id]?.[stop];
  if (stopSched) return searchSchedule(stopSched, before, -1);
  return anchoredHeuristic(R, stop, before, -1);
}

// ─── findTrips ────────────────────────────────────────────────────────────────
// `fBldg`/`tBldg` are optional building numbers; `fCoords`/`tCoords` are
// optional user lat/lon (set by the "📍 Nearest stop" geolocation flow).
// When either is present the walk leg uses haversine instead of the 3-min
// mock. Floor stays at 3 min for the "find the stop, board the bus" buffer.
export function findTrips(from, to, refTime, mode, fBldg, tBldg, fCoords, tCoords) {
  if (!from||!to||from===to) return { trips:[], filtered:[], overnight:[] };
  const fr=STOP_ROUTES[from]||[], tr=STOP_ROUTES[to]||[];
  const candidates=[];
  const filtered=[];
  const overnight=[];

  const originWalk = walkMinutes(fBldg, from, fCoords);
  const destWalk = walkMinutes(tBldg, to, tCoords);

  const checkTime = mode === "depart" ? refTime : subMin(refTime, 60);

  for (const rid of fr.filter(r=>tr.includes(r))) {
    const R=ROUTES[rid];
    if (!inService(R, checkTime)) { filtered.push(R.name); continue; }
    const fi=R.stops.indexOf(from), ti=R.stops.indexOf(to);
    const n=Math.abs(ti-fi), t=n*2;
    candidates.push({ id:`d-${rid}`, type:"direct",
      legs:[{k:"walk",dur:originWalk,dest:from},{k:"bus",rid,from,to,n,t},{k:"walk",dur:destWalk,dest:null}] });
  }
  for (const r1 of fr) for (const r2 of tr) {
    if (r1===r2) continue;
    if (!inService(ROUTES[r1], checkTime) || !inService(ROUTES[r2], checkTime)) continue;
    const R1=ROUTES[r1], R2=ROUTES[r2];
    const shared=R1.stops.filter(s=>R2.stops.includes(s)&&s!==from&&s!==to);
    if (!shared.length) continue;
    let best=null;
    for (const x of shared) {
      const n1=Math.abs(R1.stops.indexOf(x)-R1.stops.indexOf(from));
      const n2=Math.abs(R2.stops.indexOf(to)-R2.stops.indexOf(x));
      const t1=n1*2, t2=n2*2;
      const h=t1+t2+Math.round(R1.freq/2)+Math.round(R2.freq/2)+8;
      if (!best || h<best.h) best={x,n1,n2,t1,t2,h};
    }
    const {x,n1,n2,t1,t2}=best;
    candidates.push({ id:`x-${r1}-${r2}`, type:"xfer",
      legs:[
        {k:"walk",dur:originWalk,dest:from},
        {k:"bus",rid:r1,from,to:x,n:n1,t:t1},
        {k:"xfer",dur:2,at:x},
        {k:"bus",rid:r2,from:x,to,n:n2,t:t2},
        {k:"walk",dur:destWalk,dest:null}
      ] });
  }

  const trips=[];
  for (const trip of candidates) {
    const tripBusRoutes = trip.legs.filter(l => l.k === "bus").map(l => ROUTES[l.rid].name);
    let strandedLegIdx = -1;

    if (mode === "arrive") {
      let t = new Date(refTime);
      let ok = true;
      let busLegSeen = 0;
      for (let i = trip.legs.length - 1; i >= 0; i--) {
        const leg = trip.legs[i];
        if (leg.k === "walk" || leg.k === "xfer") {
          t = subMin(t, leg.dur);
        } else if (leg.k === "bus") {
          const R = ROUTES[leg.rid];
          const latestBoard = subMin(t, leg.t);
          const sched = prevScheduledDeparture(R, leg.from, latestBoard);
          if (!sched) { ok = false; break; }
          const dayStart = (() => {
            const d = new Date(latestBoard); d.setHours(0,0,0,0); return d;
          })();
          if (sched < dayStart) {
            strandedLegIdx = tripBusRoutes.length - 1 - busLegSeen;
            ok = false; break;
          }
          t = sched;
          busLegSeen++;
        }
      }
      if (!ok) {
        if (strandedLegIdx >= 0) {
          overnight.push({
            type: trip.type, routes: tripBusRoutes, strandedLeg: strandedLegIdx,
          });
        }
        continue;
      }
      trip.departAt = new Date(t);
      let f = new Date(trip.departAt);
      for (const leg of trip.legs) {
        if (leg.k === "walk") {
          leg.startAt = new Date(f); f = addMin(f, leg.dur); leg.endAt = new Date(f);
        } else if (leg.k === "bus") {
          const sched = nextScheduledDeparture(ROUTES[leg.rid], leg.from, f);
          leg.w = Math.max(0, Math.round((sched - f) / 60000));
          leg.boardAt = sched;
          f = addMin(sched, leg.t);
          leg.alightAt = new Date(f);
        } else if (leg.k === "xfer") {
          leg.startAt = new Date(f); f = addMin(f, leg.dur); leg.endAt = new Date(f);
        }
      }
      trip.arriveAt = new Date(f);
    } else {
      let t = new Date(refTime);
      trip.departAt = new Date(t);
      let busLegSeen = 0;
      let ok = true;
      for (const leg of trip.legs) {
        if (leg.k === "walk") {
          leg.startAt = new Date(t); t = addMin(t, leg.dur); leg.endAt = new Date(t);
        } else if (leg.k === "bus") {
          const R = ROUTES[leg.rid];
          const sched = nextScheduledDeparture(R, leg.from, t);
          const endToday = serviceEndToday(R, t);
          if (!sched || !endToday || sched > endToday) {
            strandedLegIdx = busLegSeen;
            ok = false; break;
          }
          leg.w = Math.max(0, Math.round((sched - t) / 60000));
          leg.boardAt = sched;
          t = addMin(sched, leg.t);
          leg.alightAt = new Date(t);
          busLegSeen++;
        } else if (leg.k === "xfer") {
          leg.startAt = new Date(t); t = addMin(t, leg.dur); leg.endAt = new Date(t);
        }
      }
      if (!ok) {
        overnight.push({
          type: trip.type, routes: tripBusRoutes, strandedLeg: strandedLegIdx,
        });
        continue;
      }
      trip.arriveAt = new Date(t);
    }
    trip.total = Math.max(1, Math.round((trip.arriveAt - trip.departAt) / 60000));
    trips.push(trip);
  }

  return {
    trips: trips.sort((a,b)=>a.total-b.total).slice(0,3),
    filtered: [...new Set(filtered)],
    overnight,
  };
}

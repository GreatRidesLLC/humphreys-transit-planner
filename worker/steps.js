// Mapbox walking steps → the short, walker-usable list the app shows.
// Kept apart from index.js so it can be unit-tested without the Worker
// runtime (worker/steps.test.js).
//
// Three things make raw Mapbox steps hard to follow on post:
//   1. OSM maps most sidewalks as their own unnamed footways, so Mapbox says
//      "Turn left onto the walkway" for a walk down Marne Avenue. Each unnamed
//      step is matched against the street lines in src/data/streets.json and
//      named after the street it runs beside.
//   2. Every left/right is relative to the direction you face at that point.
//      Hiding a short jog (a few metres to a crosswalk) breaks that chain, so
//      kept turns are recomputed from headings: the direction you were going
//      before the hidden jog, against the direction you leave in.
//   3. A walk often ends with a crossing as three tiny steps. They become one
//      line: "Cross 11th Street. Your destination is on the left." A walk that
//      starts with one opens "Cross 11th Street".

import STREETS_JSON from "../src/data/streets.json";

// On-post OSM road names are bilingual (`11th Street/11번가`, or
// `11th Street; 11번가` in the `name` field). Mapbox substitutes that
// verbatim into instructions in both locales. Strip the non-matching half
// based on the requested lang; only rewrite when the two sides are actually
// cross-script (one Latin, one Hangul) so mixed slashes like
// "Family Mini Mall / Gas Station" pass through untouched.
const HANGUL_RE = /[가-힣]/;
const LATIN_RE = /[A-Za-z]/;
const crossScript = (a, b) => {
  const aKo = HANGUL_RE.test(a), bKo = HANGUL_RE.test(b);
  const aEn = LATIN_RE.test(a), bEn = LATIN_RE.test(b);
  return (aKo && !aEn && bEn && !bKo) || (aEn && !aKo && bKo && !bEn);
};
function stripBilingualPairs(text, lang) {
  return text.replace(/([^/;]+)[/;]([^/;]+)/g, (m, a, b) => {
    const aT = a.trim(), bT = b.trim();
    if (!aT || !bT || !crossScript(aT, bT)) return m;
    // Sentence punctuation rides on the second half ("11번가."); keep it
    // whichever half survives, along with the surrounding spacing.
    const trailing = b.match(/[.,;:!?)]*\s*$/)[0];
    const bCore = b.slice(0, b.length - trailing.length).trim();
    const chosen = lang === "ko" ? (HANGUL_RE.test(aT) ? aT : bCore) : (HANGUL_RE.test(aT) ? bCore : aT);
    return `${a.match(/^\s*/)[0]}${chosen}${trailing}`;
  });
}

// A Mapbox way name as { en, ko }, or null for an unnamed footpath.
function roadName(name) {
  if (!name || typeof name !== "string") return null;
  const n = name.trim();
  if (!n || /^(the )?(walkway|footway|path|sidewalk)$/i.test(n)) return null;
  const parts = n.split(/\s*[;/]\s*/);
  if (parts.length === 2 && crossScript(parts[0], parts[1])) {
    const [en, ko] = HANGUL_RE.test(parts[0]) ? [parts[1], parts[0]] : parts;
    return { en, ko };
  }
  return { en: n, ko: n };
}
const label = (road, lang) => (lang === "ko" ? road.ko : road.en) || road.en;

// ─── Geometry (metres on a local flat projection; the post is ~5 km wide) ───
const M_LAT = 110540;
const M_LON = 111320 * Math.cos(36.965 * Math.PI / 180);
const xy = ([lon, lat]) => [lon * M_LON, lat * M_LAT];
const bearingOf = (a, b) => {
  const [ax, ay] = xy(a), [bx, by] = xy(b);
  return (Math.atan2(bx - ax, by - ay) * 180 / Math.PI + 360) % 360;
};
// Signed turn from heading a to heading b, in (-180, 180]; positive is right.
const turnAngle = (a, b) => {
  const d = ((b - a) % 360 + 540) % 360 - 180;
  return d === -180 ? 180 : d;
};
// Angle between two undirected lines, 0..90.
const lineAngle = (a, b) => {
  const d = Math.abs(turnAngle(a, b));
  return d > 90 ? 180 - d : d;
};
function pointSegDist(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}
function segmentsCross(p1, p2, q1, q2) {
  const o = (a, b, c) => Math.sign((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
  return o(p1, p2, q1) !== o(p1, p2, q2) && o(q1, q2, p1) !== o(q1, q2, p2);
}

// Every street as projected segments with their bearing, built once.
const STREET_SEGS = (STREETS_JSON.streets || []).flatMap(s => s.coords.slice(1).map((c, i) => {
  const a = xy(s.coords[i]), b = xy(c);
  return {
    road: { en: s.name, ko: s.name_ko || s.name },
    a, b, bearing: bearingOf(s.coords[i], c),
    minX: Math.min(a[0], b[0]), maxX: Math.max(a[0], b[0]),
    minY: Math.min(a[1], b[1]), maxY: Math.max(a[1], b[1]),
  };
}));

// Street segments whose box comes within `pad` metres of a line's box: the
// only ones worth measuring against (a few dozen of ~500).
function segsNear(coords, pad) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const c of coords) {
    const [x, y] = xy(c);
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  return STREET_SEGS.filter(s => s.maxX >= minX - pad && s.minX <= maxX + pad
    && s.maxY >= minY - pad && s.minY <= maxY + pad);
}

// A sidewalk is within this distance of its street's centre line…
const SIDEWALK_M = 22;
// …and runs within this many degrees of parallel to it…
const PARALLEL_DEG = 25;
// …for at least this share of its length.
const SIDEWALK_SHARE = 0.6;
const SAMPLE_M = 5;

// Points every SAMPLE_M along a [lon, lat] line, each with its local bearing.
function samples(coords) {
  const out = [];
  for (let i = 1; i < coords.length; i++) {
    const a = coords[i - 1], b = coords[i];
    const [ax, ay] = xy(a), [bx, by] = xy(b);
    const len = Math.hypot(bx - ax, by - ay);
    if (!len) continue;
    const bearing = bearingOf(a, b);
    for (let d = SAMPLE_M / 2; d < len; d += SAMPLE_M) {
      out.push({ p: [ax + (bx - ax) * d / len, ay + (by - ay) * d / len], bearing });
    }
  }
  return out;
}

// The street an unnamed step runs beside, or null.
export function sidewalkOf(coords) {
  if (!Array.isArray(coords) || coords.length < 2) return null;
  const pts = samples(coords);
  if (pts.length < 3) return null;
  const near = segsNear(coords, SIDEWALK_M);
  const votes = new Map();
  for (const { p, bearing } of pts) {
    let best = null, bestD = SIDEWALK_M;
    for (const s of near) {
      if (lineAngle(bearing, s.bearing) > PARALLEL_DEG) continue;
      const d = pointSegDist(p, s.a, s.b);
      if (d <= bestD) { best = s.road; bestD = d; }
    }
    if (best) votes.set(best.en, { road: best, n: (votes.get(best.en)?.n || 0) + 1 });
  }
  let top = null;
  for (const v of votes.values()) if (!top || v.n > top.n) top = v;
  return top && top.n / pts.length >= SIDEWALK_SHARE ? top.road : null;
}

// The street a step's path crosses at a steep angle, or null.
export function crossingOf(coords) {
  if (!Array.isArray(coords) || coords.length < 2) return null;
  const near = segsNear(coords, 0);
  for (let i = 1; i < coords.length; i++) {
    const p1 = xy(coords[i - 1]), p2 = xy(coords[i]);
    const bearing = bearingOf(coords[i - 1], coords[i]);
    for (const s of near) {
      if (lineAngle(bearing, s.bearing) < 45) continue;
      if (segmentsCross(p1, p2, s.a, s.b)) return s.road;
    }
  }
  return null;
}

// ─── Summarising ────────────────────────────────────────────────────────────

// Steps shorter than this fold into their neighbours (sidewalk jogs).
const MIN_STEP_M = 15;
// A change of heading this big is a turn worth saying.
const TURN_DEG = 45;
// Past this much silent walking, a gentler bend gets its own line.
const MAX_SILENT_M = 200;
const BEND_DEG = 20;
// Short steps before the arrival this long in total become one closing line.
const TAIL_M = 30;

function modifierFor(angle) {
  const a = Math.abs(angle), side = angle > 0 ? "right" : "left";
  if (a < 20) return "straight";
  if (a < 50) return `slight ${side}`;
  if (a < 135) return side;
  if (a < 170) return `sharp ${side}`;
  return "uturn";
}

const TEXT = {
  en: {
    departRoadNext: (road, next) => `Walk along ${road} toward ${next}`,
    departRoad: road => `Walk along ${road}`,
    departNext: next => `Walk toward ${next}`,
    departNone: "Start walking",
    departCross: road => `Cross ${road}`,
    turn: (mod, road) => {
      if (mod === "uturn") return road ? `Turn around onto ${road}` : "Turn around";
      if (mod === "straight") return road ? `Continue onto ${road}` : "Continue straight";
      const verb = mod.startsWith("slight") ? `Bear ${mod.slice(7)}` : `Turn ${mod}`;
      return road ? `${verb} onto ${road}` : verb;
    },
    cross: road => `Cross ${road}.`,
    side: { left: "Your destination is on the left.", right: "Your destination is on the right.",
            straight: "Your destination is straight ahead." },
  },
  ko: {
    departRoadNext: (road, next) => `${road}을(를) 따라 ${next} 방향으로 걸으세요`,
    departRoad: road => `${road}을(를) 따라 걸으세요`,
    departNext: next => `${next} 방향으로 걸으세요`,
    departNone: "걷기 시작하세요",
    departCross: road => `${road}을(를) 건너세요`,
    turn: (mod, road) => {
      const verb = {
        left: "좌회전하세요", right: "우회전하세요",
        "slight left": "왼쪽으로 조금 꺾으세요", "slight right": "오른쪽으로 조금 꺾으세요",
        "sharp left": "왼쪽으로 크게 꺾으세요", "sharp right": "오른쪽으로 크게 꺾으세요",
        uturn: "되돌아가세요", straight: "계속 직진하세요",
      }[mod];
      return road ? `${road}(으)로 ${verb}` : verb;
    },
    cross: road => `${road}을(를) 건너세요.`,
    side: { left: "목적지는 왼쪽에 있습니다.", right: "목적지는 오른쪽에 있습니다.",
            straight: "목적지는 바로 앞에 있습니다." },
  },
};

// Maneuvers whose Mapbox wording is kept as is: we can't say them better.
const KEEP_MAPBOX = new Set(["roundabout", "rotary", "exit roundabout", "exit rotary", "fork"]);

// Raw Mapbox steps → [{ road, coords, distance, duration, type, before, after,
// location, instruction }] with sidewalks named.
function annotate(route) {
  const out = [];
  for (const leg of route.legs || []) {
    for (const step of leg.steps || []) {
      const m = step?.maneuver;
      if (!m?.instruction) continue;
      const coords = step.geometry?.coordinates || [];
      let road = roadName(step.name);
      if (!road && (step.distance ?? 0) >= MIN_STEP_M) road = sidewalkOf(coords);
      out.push({
        road, coords,
        distance: step.distance ?? 0, duration: step.duration ?? 0,
        type: m.type, modifier: m.modifier,
        before: m.bearing_before, after: m.bearing_after,
        location: Array.isArray(m.location) && m.location.length === 2 ? m.location : null,
        instruction: m.instruction,
      });
    }
  }
  return out;
}

// Mapbox route → { steps, via }: the walker-facing steps and the street
// the route spends longest on ("Via Marne Avenue").
export function walkSteps(route, lang) {
  const txt = TEXT[lang] || TEXT.en;
  const raw = annotate(route);
  if (!raw.length) return { steps: [], via: null };

  // The road walked longest names the route ("Via Marne Avenue").
  const byRoad = new Map();
  for (const s of raw) if (s.road) byRoad.set(s.road.en, { road: s.road, m: (byRoad.get(s.road.en)?.m || 0) + s.distance });
  let via = null;
  for (const v of byRoad.values()) if (!via || v.m > via.m) via = v;

  // Closing line: the short steps between the last real stretch and the
  // arrival, with the side the destination is on.
  let arriveIdx = raw.findIndex(s => s.type === "arrive");
  if (arriveIdx < 0) arriveIdx = raw.length;
  let tailStart = arriveIdx, tailM = 0;
  while (tailStart - 1 > 0 && tailM + raw[tailStart - 1].distance < TAIL_M) {
    tailStart--;
    tailM += raw[tailStart].distance;
  }
  const tail = raw.slice(tailStart, arriveIdx);
  const body = raw.slice(0, tailStart);
  let closing = null;
  if (tail.length && arriveIdx < raw.length) {
    const lastLeg = body[body.length - 1];
    const crossed = tail.map(s => crossingOf(s.coords)).find(Boolean);
    const dest = raw[arriveIdx].location || tail[tail.length - 1].coords.at(-1);
    const from = lastLeg.coords.length >= 2 ? lastLeg.coords : null;
    let side = "straight";
    if (from && dest) {
      const heading = bearingOf(from.at(-2), from.at(-1));
      const angle = turnAngle(heading, bearingOf(from.at(-1), dest));
      side = Math.abs(angle) < 25 ? "straight" : angle > 0 ? "right" : "left";
    }
    closing = {
      instruction: [crossed && txt.cross(label(crossed, lang)), txt.side[side]].filter(Boolean).join(" "),
      distance: 0, duration: 0, location: dest || null,
    };
    lastLeg.distance += tailM;
    lastLeg.duration += tail.reduce((n, s) => n + s.duration, 0);
  }

  // Opening crossing: short steps at the start that cross a street ("Cross
  // 11th Street" from the Mini Mall) lead the first line instead.
  let opening = null;
  for (let i = 0, m = 0; i < body.length && m + body[i].distance < TAIL_M; m += body[i].distance, i++) {
    opening = crossingOf(body[i].coords);
    if (opening) break;
  }

  // Keep the steps that change something; fold the rest into the step before.
  const kept = [];
  let lastRoad = null;
  let incoming = null;          // heading before any steps folded since the last kept one
  for (let i = 0; i < body.length; i++) {
    const s = body[i];
    const prev = kept[kept.length - 1];
    if (i === 0) {
      kept.push({ ...s });
      lastRoad = s.road?.en ?? null;
      continue;
    }
    const inHeading = incoming ?? s.before;
    const angle = typeof inHeading === "number" && typeof s.after === "number" ? turnAngle(inHeading, s.after) : 0;
    const roadChange = s.road && s.road.en !== lastRoad;
    const big = s.distance >= MIN_STEP_M;
    const keep = KEEP_MAPBOX.has(s.type)
      || (big && (roadChange || Math.abs(angle) >= TURN_DEG
        || (prev.distance >= MAX_SILENT_M && Math.abs(angle) >= BEND_DEG)));
    if (keep) {
      kept.push({ ...s, angle });
      if (s.road) lastRoad = s.road.en;
      incoming = null;
    } else {
      prev.distance += s.distance;
      prev.duration += s.duration;
      if (incoming == null) incoming = s.before;
    }
  }

  const steps = kept.map((s, i) => {
    let instruction, toward = false;
    if (i === 0) {
      const road = s.road ? label(s.road, lang) : null;
      const nextRoad = kept.slice(1).find(k => k.road && k.road.en !== s.road?.en)?.road;
      const next = nextRoad ? label(nextRoad, lang) : null;
      if (opening) instruction = txt.departCross(label(opening, lang));
      else if (road && next) instruction = txt.departRoadNext(road, next);
      else if (road) { instruction = txt.departRoad(road); toward = true; }
      else if (next) instruction = txt.departNext(next);
      else { instruction = txt.departNone; toward = true; }
    } else if (KEEP_MAPBOX.has(s.type) || s.type === "arrive") {
      instruction = stripBilingualPairs(s.instruction, lang);
    } else {
      instruction = txt.turn(modifierFor(s.angle), s.road ? label(s.road, lang) : null);
    }
    const out = { instruction, distance: Math.round(s.distance), duration: Math.round(s.duration), location: s.location };
    if (toward) out.toward = true;
    return out;
  });
  if (closing) steps.push(closing);
  else if (arriveIdx < raw.length) {
    const a = raw[arriveIdx];
    const side = { left: "left", right: "right", straight: "straight" }[a.modifier];
    steps.push({ instruction: side ? txt.side[side] : stripBilingualPairs(a.instruction, lang),
      distance: 0, duration: 0, location: a.location });
  }
  return { steps, via: via ? label(via.road, lang) : null };
}

export const extractSteps = (route, lang) => walkSteps(route, lang).steps;
export const mainRoad = (route, lang) => walkSteps(route, lang).via;

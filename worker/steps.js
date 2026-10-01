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
//   4. The first left/right depends on which way you stood at the start,
//      which nobody knows (a stop may be across the road). A short approach
//      to a street becomes "Walk to 11th Street and follow it toward Marne
//      Avenue", and streets crossed on the way get their own line.

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

// Every named street a line crosses, in walking order:
// [{ road, at (metres from the start), point ([lon, lat]) }]. `own` (the
// street the line runs along) is never reported.
//
// A crossing is the path being clearly on one side of a street and then
// clearly on the other, close to it and within a short walk. Merely touching
// the centre line does not count: that is a path joining the street, or
// walking down a road mapped without sidewalks.
const CROSS_CLEAR_M = 3;      // "clearly" beside the centre line
const CROSS_NEAR_M = 20;      // still at the street, not a block away
const CROSS_SPAN_M = 40;      // the two sides are seen this close together
export function crossingsAlong(coords, own = null) {
  if (!Array.isArray(coords) || coords.length < 2) return [];
  const byRoad = new Map();
  for (const sg of segsNear(coords, CROSS_NEAR_M)) {
    if (sg.road.en === own?.en) continue;
    if (!byRoad.has(sg.road.en)) byRoad.set(sg.road.en, []);
    byRoad.get(sg.road.en).push(sg);
  }
  if (!byRoad.size) return [];
  // Points every 2 m with the distance walked to them.
  const pts = [];
  let walked = 0;
  for (let i = 1; i < coords.length; i++) {
    const a = xy(coords[i - 1]), b = xy(coords[i]);
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    for (let d = 0; d < len; d += 2) pts.push({ p: [a[0] + (b[0] - a[0]) * d / len, a[1] + (b[1] - a[1]) * d / len], at: walked + d });
    walked += len;
  }
  pts.push({ p: xy(coords.at(-1)), at: walked });

  const out = [];
  for (const segs of byRoad.values()) {
    let solid = null;          // last point clearly on one side: { side, at, p }
    for (const { p, at } of pts) {
      let best = null, bestD = Infinity;
      for (const sg of segs) {
        const d = pointSegDist(p, sg.a, sg.b);
        if (d < bestD) { best = sg; bestD = d; }
      }
      if (bestD > CROSS_NEAR_M) { solid = null; continue; }
      if (bestD < CROSS_CLEAR_M) continue;
      const side = Math.sign((best.b[0] - best.a[0]) * (p[1] - best.a[1]) - (best.b[1] - best.a[1]) * (p[0] - best.a[0]));
      // No angle test: a crossing often has a short walk down the roadway
      // in the middle (Mapbox routes crosswalks via the centre line).
      if (solid && side !== solid.side && at - solid.at <= CROSS_SPAN_M
        && !out.some(o => o.road.en === best.road.en && Math.abs(o.at - at) < 60)) {
        const mid = [(p[0] + solid.p[0]) / 2, (p[1] + solid.p[1]) / 2];
        out.push({ road: best.road, at: (at + solid.at) / 2, point: [mid[0] / M_LON, mid[1] / M_LAT] });
      }
      solid = { side, at, p };
    }
  }
  return out.sort((a, b) => a.at - b.at);
}
const lineLength = coords => {
  let m = 0;
  for (let i = 1; i < coords.length; i++) {
    const a = xy(coords[i - 1]), b = xy(coords[i]);
    m += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return m;
};

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
// Unnamed stretches merge while the path is at most this much longer than
// the straight line across them.
const WIGGLE_RATIO = 1.3;

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
    departNext: next => `Follow the path toward ${next}`,
    departNone: "Start walking",
    // An unnamed stretch is a footpath (or a lot): say so, and where it leads.
    turnPath: (mod, toward) => {
      const verb = mod === "uturn" ? "Turn around" : mod === "straight" ? "Continue on the path"
        : mod.startsWith("slight") ? `Bear ${mod.slice(7)} onto the path` : `Turn ${mod} onto the path`;
      return toward ? `${verb} toward ${toward}` : verb;
    },
    and: names => names.length < 3 ? names.join(" and ") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`,
    departCross: road => `Cross ${road}`,
    // A short approach, then a street: say which street and which way along
    // it, never a left/right that depends on how you stood at the start.
    walkTo: (road, toward) => toward ? `Walk to ${road} and follow it toward ${toward}` : `Walk to ${road} and follow it`,
    crossFollow: (road, toward) => toward ? `Cross ${road}, then follow it toward ${toward}` : `Cross ${road}, then follow it`,
    crossAlong: (cross, road, toward) => toward ? `Cross ${cross}, then walk along ${road} toward ${toward}`
      : `Cross ${cross}, then walk along ${road}`,
    crossContinue: road => road.includes(" and ") ? `Cross ${road}, then continue straight` : `Cross ${road} and continue straight`,
    crossThen: (road, next) => `Cross ${road}, then ${lowerFirst(next)}`,
    // Crossing a street and then walking along its far side.
    crossAlongIt: (road, mod) => mod === "straight" ? `Cross ${road}, then continue along it`
      : `Cross ${road}, then turn ${mod.replace("slight ", "").replace("sharp ", "")} along it`,
    andCross: (prev, road) => `${prev}, then cross ${road}`,
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
    departNext: next => `보행로를 따라 ${next} 방향으로 걸으세요`,
    departNone: "걷기 시작하세요",
    turnPath: (mod, toward) => {
      const verb = {
        left: "좌회전하여 ", right: "우회전하여 ",
        "slight left": "왼쪽으로 조금 꺾어 ", "slight right": "오른쪽으로 조금 꺾어 ",
        "sharp left": "왼쪽으로 크게 꺾어 ", "sharp right": "오른쪽으로 크게 꺾어 ",
        uturn: "되돌아가 ", straight: "",
      }[mod];
      return toward ? `${verb}보행로를 따라 ${toward} 방향으로 걸으세요` : `${verb}보행로를 따라 걸으세요`;
    },
    and: names => names.join(", "),
    departCross: road => `${road}을(를) 건너세요`,
    walkTo: (road, toward) => toward ? `${road}(으)로 가서 ${toward} 방향으로 걸으세요` : `${road}(으)로 가서 길을 따라 걸으세요`,
    crossFollow: (road, toward) => toward ? `${road}을(를) 건넌 뒤 ${toward} 방향으로 걸으세요` : `${road}을(를) 건넌 뒤 길을 따라 걸으세요`,
    crossAlong: (cross, road, toward) => toward ? `${cross}을(를) 건넌 뒤 ${road}을(를) 따라 ${toward} 방향으로 걸으세요`
      : `${cross}을(를) 건넌 뒤 ${road}을(를) 따라 걸으세요`,
    crossContinue: road => `${road}을(를) 건너 계속 직진하세요`,
    crossThen: (road, next) => `${road}을(를) 건넌 뒤 ${next}`,
    crossAlongIt: (road, mod) => `${road}을(를) 건넌 뒤 ${mod === "straight" ? "" : mod.includes("left") ? "좌회전하여 " : "우회전하여 "}길을 따라 걸으세요`,
    andCross: (prev, road) => `${prev.replace(/[.。]\s*$/, "")}. 그다음 ${road}을(를) 건너세요`,
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
const lowerFirst = t => /^[A-Z][a-z]/.test(t) ? t[0].toLowerCase() + t.slice(1) : t;

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
    const tailLine = [...lastLeg.coords.slice(-2), ...tail.flatMap(s => s.coords.slice(1))];
    // No `own` street here: the walk often ends by crossing the very street
    // it came along ("Turn right onto 11th Street … Cross 11th Street").
    const crossed = crossingsAlong(tailLine).find(c => c.at > 0)?.road;
    const dest = raw[arriveIdx].location || tail[tail.length - 1].coords.at(-1);
    const from = lastLeg.coords.length >= 2 ? lastLeg.coords : null;
    let side = "straight";
    if (from && dest) {
      const heading = bearingOf(from.at(-2), from.at(-1));
      const angle = turnAngle(heading, bearingOf(from.at(-1), dest));
      side = Math.abs(angle) < 25 ? "straight" : angle > 0 ? "right" : "left";
    }
    // `arrive`, `side` and `cross` let the client name the destination
    // ("The Commissary stop is on the left") in place of "Your destination".
    closing = {
      instruction: [crossed && txt.cross(label(crossed, lang)), txt.side[side]].filter(Boolean).join(" "),
      distance: 0, duration: 0, location: dest || null,
      arrive: true, side, cross: crossed ? label(crossed, lang) : null,
    };
    lastLeg.distance += tailM;
    lastLeg.duration += tail.reduce((n, s) => n + s.duration, 0);
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
    // An unnamed stretch under TAIL_M is a jog to a crosswalk or round a
    // corner; folding it keeps the line count down without breaking the
    // turn chain (headings carry across the fold).
    const big = s.distance >= (s.road ? MIN_STEP_M : TAIL_M);
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
      prev.coords = prev.coords.concat(s.coords.slice(1));
      if (incoming == null) incoming = s.before;
    }
  }

  // A run of unnamed stretches whose overall line is fairly direct is one
  // footpath with wiggles, not a series of turns: say it once.
  const straightM = coords => {
    const a = xy(coords[0]), b = xy(coords.at(-1));
    return Math.hypot(b[0] - a[0], b[1] - a[1]);
  };
  const unnamed = k => k && !k.road && !KEEP_MAPBOX.has(k.type);
  for (let i = 0; i < kept.length - 1; i++) {
    if (!unnamed(kept[i])) continue;
    let coords = kept[i].coords, j = i + 1;
    while (unnamed(kept[j])) {
      const joined = coords.concat(kept[j].coords.slice(1));
      const direct = straightM(joined);
      if (direct < 30 || lineLength(joined) > WIGGLE_RATIO * direct) break;
      coords = joined; j++;
    }
    if (j === i + 1) continue;
    const run = kept.slice(i, j);
    kept.splice(i, j - i, { ...kept[i], coords,
      distance: run.reduce((n, k) => n + k.distance, 0), duration: run.reduce((n, k) => n + k.duration, 0) });
  }

  // Streets crossed inside each kept stretch, as distances along it.
  const crossings = kept.map(k => {
    const len = lineLength(k.coords) || 1;
    return crossingsAlong(k.coords, k.road).map(c => ({ ...c, at: c.at * k.distance / len }));
  });
  const lbl = road => label(road, lang);
  // A messy junction can show the same street crossed twice in a row, in
  // neighbouring stretches: say it once.
  {
    let offset = 0;
    const seen = [];
    kept.forEach((k, i) => {
      crossings[i] = crossings[i].filter(c => {
        const at = offset + c.at;
        if (seen.some(o => o.road === c.road.en && at - o.at < 60)) return false;
        seen.push({ road: c.road.en, at });
        return true;
      });
      offset += k.distance;
    });
  }

  // One kept stretch → its line, then a "Cross X and continue" line at each
  // street it crosses. `from` skips crossings already said in the opening.
  const lines = [];
  const pushStretch = (k, text, cs, extra = {}) => {
    const cuts = [0, ...cs.map(c => c.at), k.distance];
    const share = m => k.distance ? k.duration * m / k.distance : 0;
    lines.push({ instruction: text, distance: cuts[1] - cuts[0], duration: share(cuts[1] - cuts[0]),
      location: k.location, ...extra });
    cs.forEach((c, j) => {
      const m = cuts[j + 2] - cuts[j + 1];
      lines.push({ instruction: txt.crossContinue(lbl(c.road)), distance: m, duration: share(m),
        location: c.point, cross: c.road, crossName: lbl(c.road) });
    });
  };

  let next = 1;
  const first = kept[0];
  const approach = crossings[0].filter(c => c.at < TAIL_M);
  const second = kept[1];
  if (first.distance < TAIL_M && second?.road && !KEEP_MAPBOX.has(second.type)) {
    // Short approach, then a street: one line naming the street and the way
    // along it (the next street crossed or turned onto).
    const road = second.road;
    const cs = crossings[1];
    const towardRoad = cs[0]?.road || kept.slice(2).find(k => k.road && k.road.en !== road.en)?.road;
    const toward = towardRoad ? lbl(towardRoad) : null;
    const crossed = approach[0]?.road;
    const text = !crossed ? txt.walkTo(lbl(road), toward)
      : crossed.en === road.en ? txt.crossFollow(lbl(road), toward)
      : txt.crossAlong(lbl(crossed), lbl(road), toward);
    const merged = { ...second, distance: first.distance + second.distance, duration: first.duration + second.duration,
      location: first.location };
    pushStretch(merged, text, cs.map(c => ({ ...c, at: c.at + first.distance })), toward ? {} : { toward: true });
    next = 2;
  } else if (first.distance < TAIL_M && unnamed(first) && unnamed(second)) {
    // A few metres to a footpath, then along it: one line with where the
    // path leads, never a left/right off an unknown starting heading.
    const cs = crossings[1];
    const towardRoad = cs[0]?.road || kept.slice(2).find(k => k.road)?.road;
    const toward = towardRoad ? lbl(towardRoad) : null;
    const merged = { ...second, distance: first.distance + second.distance, duration: first.duration + second.duration,
      location: first.location };
    pushStretch(merged, toward ? txt.departNext(toward) : txt.departNone,
      cs.map(c => ({ ...c, at: c.at + first.distance })), toward ? {} : { toward: true });
    next = 2;
  } else {
    const road = first.road ? lbl(first.road) : null;
    const nextRoad = (!first.road && crossings[0].find(c => c.at >= TAIL_M)?.road)
      || kept.slice(1).find(k => k.road && k.road.en !== first.road?.en)?.road;
    const nextName = nextRoad ? lbl(nextRoad) : null;
    let text, toward = false;
    if (approach.length) text = txt.departCross(lbl(approach[0].road));
    else if (road && nextName) text = txt.departRoadNext(road, nextName);
    else if (road) { text = txt.departRoad(road); toward = true; }
    else if (nextName) text = txt.departNext(nextName);
    else { text = txt.departNone; toward = true; }
    pushStretch(first, text, crossings[0].filter(c => c.at >= TAIL_M), toward ? { toward: true } : {});
  }
  for (let i = next; i < kept.length; i++) {
    const k = kept[i];
    const mapbox = KEEP_MAPBOX.has(k.type);
    const extra = {};
    const mod = mapbox ? null : modifierFor(k.angle);
    let text;
    if (mapbox) text = stripBilingualPairs(k.instruction, lang);
    else if (k.road) text = txt.turn(mod, lbl(k.road));
    else {
      // Where the path leads: the first street it crosses, else the next
      // street turned onto.
      const towardRoad = crossings[i][0]?.road || kept.slice(i + 1, i + 3).find(n => n.road)?.road;
      text = txt.turnPath(mod, towardRoad ? lbl(towardRoad) : null);
      if (!towardRoad) extra.toward = true;      // the client heads it for the destination
    }
    pushStretch(k, text, crossings[i], { road: k.road, mod, ...extra });
  }

  // Crossings a few steps apart are one junction: "Cross A and B".
  for (let i = 0; i < lines.length - 1; i++) {
    const c = lines[i], d = lines[i + 1];
    if (!c.cross || !d.cross || c.distance >= TAIL_M) continue;
    c.names = [...(c.names || [c.crossName]), d.crossName];
    c.crossName = txt.and(c.names);
    c.cross = d.cross;
    c.instruction = txt.crossContinue(c.crossName);
    c.distance += d.distance; c.duration += d.duration;
    lines.splice(i + 1, 1);
    i--;
  }
  // A crossing a few metres from a turn reads as part of it.
  for (let i = 1; i < lines.length; i++) {
    const c = lines[i];
    if (!c.cross) continue;
    const prev = lines[i - 1], after = lines[i + 1];
    if (c.distance < TAIL_M && after && !after.cross) {
      after.instruction = after.mod && after.road?.en === c.cross.en && !c.names
        ? txt.crossAlongIt(c.crossName, after.mod)
        : txt.crossThen(c.crossName, after.instruction);
      prev.distance += c.distance; prev.duration += c.duration;
    } else if (prev.distance < MIN_STEP_M && i > 1 && !prev.cross) {
      prev.instruction = txt.andCross(prev.instruction, c.crossName);
      prev.distance += c.distance; prev.duration += c.duration;
    } else continue;
    lines.splice(i, 1);
    i--;
  }

  const steps = lines.map(({ instruction, distance, duration, location, toward }) => {
    const out = { instruction, distance: Math.round(distance), duration: Math.round(duration), location };
    if (toward) out.toward = true;
    return out;
  });
  if (closing) steps.push(closing);
  else if (arriveIdx < raw.length) {
    const a = raw[arriveIdx];
    const side = { left: "left", right: "right", straight: "straight" }[a.modifier] || null;
    steps.push({ instruction: side ? txt.side[side] : stripBilingualPairs(a.instruction, lang),
      distance: 0, duration: 0, location: a.location, arrive: true, side, cross: null });
  }
  return { steps, via: via ? label(via.road, lang) : null };
}

export const extractSteps = (route, lang) => walkSteps(route, lang).steps;
export const mainRoad = (route, lang) => walkSteps(route, lang).via;

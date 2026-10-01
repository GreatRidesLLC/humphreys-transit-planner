// Mapbox walking steps → the short, walker-usable list the app shows.
// Kept apart from index.js so it can be unit-tested without the Worker
// runtime (worker/steps.test.js).

// On-post OSM road names are bilingual (`11th Street/11번가`). Mapbox's
// turn-by-turn engine substitutes that verbatim into instructions in both
// locales, so the ko output ends up with English road names embedded and
// vice versa. Strip the non-matching half based on the requested lang; only
// rewrite when the two sides are actually cross-script (one Latin, one
// Hangul) so mixed slashes like "Family Mini Mall / Gas Station" pass
// through untouched.
const HANGUL_RE = /[가-힣]/;
const LATIN_RE = /[A-Za-z]/;
function stripBilingualPairs(text, lang) {
  return text.replace(/([^/]+)\/([^/]+)/g, (m, a, b) => {
    const aT = a.trim(), bT = b.trim();
    if (!aT || !bT) return m;
    const aKo = HANGUL_RE.test(aT), bKo = HANGUL_RE.test(bT);
    const aEn = LATIN_RE.test(aT), bEn = LATIN_RE.test(bT);
    const bilingual = (aKo && !aEn && bEn && !bKo) || (aEn && !aKo && bKo && !bEn);
    if (!bilingual) return m;
    // Keep the side matching the requested locale; preserve any leading /
    // trailing whitespace from the original capture so surrounding text
    // spacing (e.g. "on Foo/한.") isn't lost.
    // Sentence punctuation rides on the second half ("11번가."); keep it
    // whichever half survives.
    const trailingSpace = b.match(/[.,;:!?)]*\s*$/)[0];
    const bCore = b.slice(0, b.length - trailingSpace.length).trim();
    const chosen = lang === "ko" ? (aKo ? aT : bCore) : (aEn ? aT : bCore);
    const leadingSpace = a.match(/^\s*/)[0];
    return `${leadingSpace}${chosen}${trailingSpace}`;
  });
}

// Streets/road names Mapbox uses for on-post named ways. Anything else in
// the `name` field is treated as an unnamed footpath and does not count as a
// "road change" for the purpose of summarizing steps.
function isGenericWay(name) {
  if (!name || typeof name !== "string") return true;
  const n = name.toLowerCase().trim();
  if (!n) return true;
  return n === "walkway" || n === "the walkway" || n === "footway" || n === "path" || n === "sidewalk";
}

// A meaningful maneuver from the walker's point of view: the maneuver type
// that always deserves a mention regardless of road context.
function isKeyManeuver(type, modifier) {
  if (type === "depart" || type === "arrive") return true;
  if (type === "roundabout" || type === "exit roundabout" || type === "fork") return true;
  if (typeof modifier === "string" && (modifier.includes("sharp") || modifier === "uturn")) return true;
  return false;
}

// A plain left or right at a junction. Kept even on an unnamed footpath,
// where it is the only thing telling the walker where to go: dropping these
// is how a 709 m walk once collapsed into one "Start walking" line.
const TURN_TYPES = new Set(["turn", "end of road", "continue"]);
function isRealTurn(type, modifier) {
  return TURN_TYPES.has(type) && (modifier === "left" || modifier === "right");
}

// Short sidewalk jogs (a few metres to a crossing) roll into the step before
// rather than becoming their own line.
const MIN_TURN_M = 15;
// Never let one line run longer than this with a change of direction unsaid.
const MAX_SILENT_M = 200;

// Turn Mapbox's fine-grained step list into a short, walker-usable summary:
// only the maneuvers that change *something*  — the road you're on, a big
// bend, or the start/end of the walk. Skipped steps' distance + duration
// roll into the previous kept step so the on-screen numbers still reflect
// how far you walk before the next real turn.
function summarizeSteps(rawSteps) {
  if (!rawSteps.length) return [];
  const kept = [];
  let lastRoad = null;
  for (let i = 0; i < rawSteps.length; i++) {
    const step = rawSteps[i];
    const maneuver = step.maneuver || {};
    const instruction = maneuver.instruction;
    if (!instruction) continue;
    const type = maneuver.type;
    const modifier = maneuver.modifier;
    const road = isGenericWay(step.name) ? null : step.name.trim();
    const roadChange = road && road !== lastRoad;
    const isLast = i === rawSteps.length - 1;
    const dist = step.distance ?? 0;
    const prevDist = kept.length ? kept[kept.length - 1].distance : 0;
    const turn = isRealTurn(type, modifier) && (dist >= MIN_TURN_M || road);
    const longSilence = prevDist >= MAX_SILENT_M && dist >= MIN_TURN_M
      && typeof modifier === "string" && modifier !== "straight";
    const keep = isLast || isKeyManeuver(type, modifier) || roadChange || turn || longSilence;
    const loc = maneuver.location;
    const chunk = {
      instruction,
      distance: Math.round(step.distance ?? 0),
      duration: Math.round(step.duration ?? 0),
      type,
      road,
      // [lon, lat] where this maneuver happens. The client uses it to name
      // a nearby landmark from its own stop / building / place data.
      location: Array.isArray(loc) && loc.length === 2 ? loc : null,
    };
    if (keep) {
      kept.push(chunk);
      if (road) lastRoad = road;
    } else if (kept.length > 0) {
      // Roll this minor step into the previous kept survivor so the walk
      // distance shown accounts for the whole segment between real turns.
      const prev = kept[kept.length - 1];
      prev.distance += chunk.distance;
      prev.duration += chunk.duration;
    } else {
      // No kept survivor yet — force-keep this step as the anchor rather
      // than lose distance from the start of the walk.
      kept.push(chunk);
      if (road) lastRoad = road;
    }
  }
  return kept;
}

// Mapbox opens every walk with a compass bearing ("Walk west on …"), which
// is useless to someone who doesn't know which way west is. Rewrite that
// first step around street names: the road you start on and the next road
// you turn onto. Starting on an unnamed path, the heading is that next road
// ("Walk toward 11th Street"). With no next road at all, `toward` asks the
// client to name a landmark (or the leg's destination) as the heading.
const DEPART_TEXT = {
  en: {
    roadNext: (road, next) => `Walk along ${road} toward ${next}`,
    road: road => `Walk along ${road}`,
    next: next => `Walk toward ${next}`,
    none: "Start walking",
  },
  ko: {
    roadNext: (road, next) => `${road}을(를) 따라 ${next} 방향으로 걸으세요`,
    road: road => `${road}을(를) 따라 걸으세요`,
    next: next => `${next} 방향으로 걸으세요`,
    none: "걷기 시작하세요",
  },
};

function rewriteDepart(kept, lang) {
  const first = kept[0];
  if (!first || first.type !== "depart") return kept;
  const txt = DEPART_TEXT[lang] || DEPART_TEXT.en;
  // Strip each bilingual road name on its own: the template holds two of
  // them, which stripBilingualPairs can't split reliably in one pass.
  const road = first.road ? stripBilingualPairs(first.road, lang) : null;
  const nextRaw = kept.slice(1).find(s => s.road && s.road !== first.road)?.road;
  const next = nextRaw ? stripBilingualPairs(nextRaw, lang) : null;
  let instruction, toward = false;
  if (road && next) instruction = txt.roadNext(road, next);
  else if (road) { instruction = txt.road(road); toward = true; }
  else if (next) instruction = txt.next(next);
  else { instruction = txt.none; toward = true; }
  return [{ ...first, instruction, toward }, ...kept.slice(1)];
}

export function extractSteps(route, lang) {
  const raw = [];
  for (const leg of route.legs || []) {
    for (const step of leg.steps || []) {
      if (!step?.maneuver?.instruction) continue;
      raw.push(step);
    }
  }
  const kept = rewriteDepart(summarizeSteps(raw), lang);
  return kept.map(s => {
    const out = {
      // The rewritten depart text is already single-language.
      instruction: s === kept[0] && s.type === "depart" ? s.instruction : stripBilingualPairs(s.instruction, lang),
      distance: s.distance,
      duration: s.duration,
      location: s.location,
    };
    if (s.toward) out.toward = true;
    return out;
  });
}

// The named road a route spends the most distance on ("Via 11th Street").
export function mainRoad(route, lang) {
  const byRoad = new Map();
  for (const leg of route.legs || []) {
    for (const step of leg.steps || []) {
      if (isGenericWay(step.name)) continue;
      const road = stripBilingualPairs(step.name.trim(), lang);
      byRoad.set(road, (byRoad.get(road) || 0) + (step.distance || 0));
    }
  }
  let best = null, bestM = 0;
  for (const [road, m] of byRoad) if (m > bestM) { best = road; bestM = m; }
  return best;
}

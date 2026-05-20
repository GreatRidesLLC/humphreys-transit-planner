import { useState, useMemo, useRef, useEffect, createContext, useContext } from "react";
import SCHEDULES_JSON from "./data/schedules.json";

// ─── Army Color Palette ───────────────────────────────────────────────────────
const C = {
  bgDeep:    "#080f04",
  bgBase:    "#0e1a08",
  bgCard:    "#162210",
  bgSurface: "#1c2e14",
  bgHover:   "#243a18",
  borderMain:"#3a5820",
  borderSub: "#263c14",
  borderDim: "#182810",
  gold:      "#FFB81C",
  goldDark:  "#d4960e",
  goldAlpha: "rgba(255,184,28,0.15)",
  khaki:     "#e8dca8",
  tan:       "#c8b878",
  sage:      "#8aaa60",
  oliveDim:  "#7a9a58",
  oliveMute: "#6a8a48",
  oliveFaint:"#263c18",
};

// ─── Time Helpers ─────────────────────────────────────────────────────────────
const pad2 = n => String(n).padStart(2, "0");
const fmt  = d => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
const addMin = (d, m) => new Date(d.getTime() + m * 60000);
const subMin = (d, m) => new Date(d.getTime() - m * 60000);
// Combine "YYYY-MM-DD" date string and "HH:MM" time string into a Date.
const parseHMD = (hm, ymd) => {
  const [h, m] = hm.split(":").map(Number);
  const [y, mo, d] = ymd.split("-").map(Number);
  return new Date(y, mo-1, d, h, m, 0, 0);
};
const todayYMD = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
};
const DOW = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const DOW_KO = ["일","월","화","수","목","금","토"];

// ─── i18n ─────────────────────────────────────────────────────────────────────
// Translates UI chrome only. Stop names and route names stay English on purpose:
// the audience already says "PX" and "Maude Hall" in English on base.
// NOTE: Korean strings are first-draft. They need QA from a KATUSA, KSC employee,
// or Korean civilian colleague before public release — military/transit phrasing
// is hard to get right from machine translation alone.
const STRINGS = {
  en: {
    appTitle: "Humphreys Transit",
    appSubtitle: "Camp Humphreys · USAG Korea",
    tabPlan: "🗺 Plan", tabNow: "⏱ Now", tabRoutes: "🚌 Routes", tabOffpost: "📡 Off-Post",
    favorites: "★ Favorites", recent: "↺ Recent",
    typePrompt: "Type a stop name or building number",
    from: "From", to: "To", atStop: "At stop",
    stopPh: l => `${l} — stop name or Bldg #`,
    saveFav: "★ Save", saveFavTitle: "Save From as favorite",
    saveFavPrompt: "Name this favorite (e.g. Home, Work, Gym)",
    pickFromFirst: "Pick a From stop first, then save it as a favorite.",
    removeFavorite: "Remove favorite", removeRecent: "Remove recent",
    swapStops: "Swap from and to",
    expandTrip: "Show trip details", collapseTrip: "Hide trip details",
    expandRoute: "Show route stops", collapseRoute: "Hide route stops",
    when: "When",
    leaveNow: "Leave now", departAt: "Depart at", arriveBy: "Arrive by",
    today: "Today", tomorrow: "Tmrw", dow: DOW,
    findRoutes: "Find Routes →",
    bldgsMappedTitle: "~15 building numbers mapped",
    bldgsMappedDesc: " (e.g. 6400 → Maude Hall, 5700 → PX). Full directory pending from DPW Bldg 6140.",
    noTrips: "No Trips Available",
    noTripsOOS: names => `Possible routes are outside service hours at this time (${names}). Try a different time.`,
    noTripsNoPath: "No shared or 1-transfer path exists. Try selecting the Bus Terminal as a hub, or a nearby major stop.",
    optionsFound: n => `${n} option${n!==1?"s":""} found`,
    routesOOS: n => `${n} route${n!==1?"s":""} out of service`,
    direct: "Direct · no transfer", oneTransfer: "1 transfer",
    walkTo: stop => `Walk to ${stop}`, walkDest: "Walk to destination",
    walkMin: m => `~${m} min walk`,
    boardAt: "Board at", alightAt: "Alight at", transferHere: "Transfer here",
    busLegMeta: (w,t,n) => `~${w} min wait · ~${t} min ride · ${n} stop${n!==1?"s":""}`,
    xferMeta: (at,dur) => `${at} · ~${dur} min`,
    fastest: "FASTEST", est: "EST.",
    estTitle: "Times based on estimated schedule — not yet verified against an official PDF",
    everyMin: m => `every ${m} min`,
    waitDisclaimer: "Wait times estimate the next scheduled bus assuming each route starts its cycle at :00 from its first stop. Real PDFs may differ. Verify at USAG Humphreys or MyArmyPost app.",
    shuttleInfo: "Shuttles run Mon–Fri 0600–2200. Gold Route runs Mon–Sun 0900–2100. Out-of-service routes are filtered automatically. Confirm: DSN 755-0424.",
    noMatch: "No matching stop or building",
    whereAreYou: "Where are you?",
    asOf: time => `As of ${time} — updates every minute`,
    nextDeparturesFrom: stop => `Next departures from ${stop}`,
    goldDisclaimer: "Gold uses verified `:00 :20 :40` schedule. Other routes estimate next departure assuming a :00 cycle anchor — real timetables may shift the times.",
    noRoutesHere: "No routes serve this stop.",
    pickStopHint: "Pick a stop to see the next bus on every route that serves it. The page auto-refreshes once a minute.",
    outOfService1: "Out of", outOfService2: "service",
    inMin: m => `in ${m} min`, nowWord: "now", estAvg: "EST. AVG",
    goldDotsInfo: "Gold dots next to stop names = transfer points served by multiple routes.",
    routeMeta: (freq,n,days,hours) => `Every ${freq} min · ${n} stops · ${days} · ${hours}`,
    pdfVerified: "✓ PDF-verified schedule",
    verifiedScheduleHeader: "VERIFIED SCHEDULE (Mon–Sun)",
    liveGps: "Live GPS Tracking",
    futureFeatureLabel: "FUTURE FEATURE · WHAT IT REQUIRES",
    gpsAction: "Action:",
    gpsActionText: " Contact Transportation (DSN 755-0424) and DPW GIS/IGI&S (Bldg 6140) to explore GPS trackers or a BusWhere deployment for Humphreys.",
    interGarrisonHeader: "Inter-Garrison Routes",
    interGarrisonWarn1: "⚠️ Inter-garrison buses are ",
    interGarrisonWarnStrong: "not integrated",
    interGarrisonWarn2: " into the trip planner. Priority-based seating, fixed schedules, not connectable as transfers. Verify at:",
    pickupLabel: "Pick-up:",
    todoHeader: "📋 Your To-Do List",
  },
  ko: {
    appTitle: "험프리스 교통",
    appSubtitle: "캠프 험프리스 · USAG Korea",
    tabPlan: "🗺 계획", tabNow: "⏱ 지금", tabRoutes: "🚌 노선", tabOffpost: "📡 기지 외",
    favorites: "★ 즐겨찾기", recent: "↺ 최근",
    typePrompt: "정류장 이름 또는 건물 번호를 입력하세요",
    from: "출발", to: "도착", atStop: "정류장",
    stopPh: l => `${l} — 정류장 또는 건물 번호`,
    saveFav: "★ 저장", saveFavTitle: "출발지를 즐겨찾기에 저장",
    saveFavPrompt: "즐겨찾기 이름 (예: 집, 직장, 체육관)",
    pickFromFirst: "먼저 출발 정류장을 선택한 후 즐겨찾기에 저장하세요.",
    removeFavorite: "즐겨찾기 삭제", removeRecent: "최근 기록 삭제",
    swapStops: "출발/도착 바꾸기",
    expandTrip: "경로 상세 보기", collapseTrip: "경로 상세 숨기기",
    expandRoute: "노선 정류장 보기", collapseRoute: "노선 정류장 숨기기",
    when: "시간",
    leaveNow: "지금 출발", departAt: "출발 시간", arriveBy: "도착 시간",
    today: "오늘", tomorrow: "내일", dow: DOW_KO,
    findRoutes: "노선 찾기 →",
    bldgsMappedTitle: "건물 번호 약 15개 매핑됨",
    bldgsMappedDesc: " (예: 6400 → Maude Hall, 5700 → PX). 전체 목록은 DPW 6140동에서 제공 예정.",
    noTrips: "이용 가능한 노선 없음",
    noTripsOOS: names => `현재 시간에 운행하지 않는 노선이 있습니다 (${names}). 다른 시간을 시도해 보세요.`,
    noTripsNoPath: "공유 정류장 또는 1회 환승 경로가 없습니다. 버스 터미널이나 가까운 주요 정류장을 시도해 보세요.",
    optionsFound: n => `${n}개 옵션`,
    routesOOS: n => `${n}개 노선 운행 종료`,
    direct: "직행 · 환승 없음", oneTransfer: "환승 1회",
    walkTo: stop => `${stop}까지 도보`, walkDest: "목적지까지 도보",
    walkMin: m => `도보 ~${m}분`,
    boardAt: "탑승", alightAt: "하차", transferHere: "여기서 환승",
    busLegMeta: (w,t,n) => `~${w}분 대기 · ~${t}분 승차 · ${n}개 정류장`,
    xferMeta: (at,dur) => `${at} · ~${dur}분`,
    fastest: "최단", est: "추정",
    estTitle: "추정 시간표 기반 — 공식 PDF로 검증되지 않음",
    everyMin: m => `${m}분 간격`,
    waitDisclaimer: "대기 시간은 각 노선이 첫 정류장에서 :00에 출발한다고 가정한 추정치입니다. 실제 시간표는 다를 수 있습니다. USAG 험프리스 또는 MyArmyPost 앱에서 확인하세요.",
    shuttleInfo: "셔틀 운행: 월–금 06:00–22:00. Gold 노선: 일–월 09:00–21:00. 운행 종료된 노선은 자동 제외됩니다. 확인: DSN 755-0424.",
    noMatch: "일치하는 정류장 또는 건물 없음",
    whereAreYou: "어디에 계세요?",
    asOf: time => `${time} 기준 — 1분마다 갱신`,
    nextDeparturesFrom: stop => `${stop}에서 다음 출발`,
    goldDisclaimer: "Gold 노선은 검증된 `:00 :20 :40` 시간표를 사용합니다. 다른 노선은 :00 정시 기준 주기로 다음 출발을 추정하며, 실제 시간표와 다를 수 있습니다.",
    noRoutesHere: "이 정류장을 지나는 노선이 없습니다.",
    pickStopHint: "정류장을 선택하면 해당 정류장의 모든 노선의 다음 버스를 볼 수 있습니다. 1분마다 자동 갱신됩니다.",
    outOfService1: "운행", outOfService2: "종료",
    inMin: m => `${m}분 후`, nowWord: "지금", estAvg: "추정 평균",
    goldDotsInfo: "정류장 이름 옆 금색 점 = 여러 노선이 정차하는 환승 지점.",
    routeMeta: (freq,n,days,hours) => `${freq}분 간격 · 정류장 ${n}개 · ${days} · ${hours}`,
    pdfVerified: "✓ PDF 검증된 시간표",
    verifiedScheduleHeader: "검증된 시간표 (월–일)",
    liveGps: "실시간 GPS 추적",
    futureFeatureLabel: "추후 기능 · 필요 요건",
    gpsAction: "조치:",
    gpsActionText: " 교통과(DSN 755-0424) 및 DPW GIS/IGI&S(6140동)에 문의하여 GPS 추적기 또는 BusWhere 도입을 검토하세요.",
    interGarrisonHeader: "기지 간 노선",
    interGarrisonWarn1: "⚠️ 기지 간 버스는 노선 검색에 ",
    interGarrisonWarnStrong: "포함되지 않습니다",
    interGarrisonWarn2: ". 우선순위 좌석, 고정 시간표, 환승 불가. 확인:",
    pickupLabel: "탑승 지점:",
    todoHeader: "📋 할 일 목록",
  },
};
const LangContext = createContext({ lang: "en", t: STRINGS.en });
const useT = () => useContext(LangContext);
// Returns true if route is running at the given Date
const inService = (r, d) => {
  const dow = d.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  if (r.days === "Mon–Fri" && (dow === 0 || dow === 6)) return false;
  if (r.days === "Fri–Sat" && !(dow === 5 || dow === 6)) return false;
  // "Mon–Sun" runs every day → no day filter.
  const [s, e] = r.hours.split("–");
  const mins = d.getHours() * 60 + d.getMinutes();
  const sm = parseInt(s.slice(0,2))*60 + parseInt(s.slice(2));
  const em = parseInt(e.slice(0,2))*60 + parseInt(e.slice(2));
  return mins >= sm && mins <= em;
};

// ─── Routes ───────────────────────────────────────────────────────────────────
const ROUTES = {
  BLUE:  { id:"BLUE",  name:"Blue Route",   color:"#5bb8ff", freq:15, hours:"0600–2200", days:"Mon–Fri",
    stops:["Pedestrian Gate","Provider Grill DFAC","SLQs (12200s Block)","Eighth Army HQ","Corps of Engineers","TMP / Driver's Licensing","Airfield Operations","Talon Cafe DFAC","Barracks (6000s Block)","Pacific Victors Chapel","Spartan DFAC","LTG Maude Hall (9th St)","Commissary","Main Post Office","Main Exchange (PX)","Pittman DFAC","Sitman Fitness Center","2ID Sustainment","Central Issue Facility"] },
  BLACK: { id:"BLACK", name:"Black Route",  color:"#c0cfc0", freq:25, hours:"0600–2200", days:"Mon–Fri",
    stops:["Pedestrian Gate","Provider Grill DFAC","SLQs (12200s Block)","Eighth Army HQ","Corps of Engineers","Pacific Victors Chapel","Commissary","LTG Maude Hall (9th St)","Spartan DFAC"] },
  GREEN: { id:"GREEN", name:"Green Route",  color:"#4dde88", freq:15, hours:"0600–2200", days:"Mon–Fri",
    stops:["Pedestrian Gate","Provider Grill DFAC","Desiderio ATC Tower","Law Enforcement Center (DES)","Bus Terminal","Lodging","KTO Museum","MSG Jenkins Medical Clinic","Collier Fitness Center","Family Housing Towers (Tropic Lightning Ave)","Talon Cafe DFAC","Airfield Operations","Barracks (6000s Block)","Pacific Victors Chapel","Spartan DFAC","LTG Maude Hall (9th St)","Commissary","Main Exchange (PX)","Balboni Sports Field (5th St)"] },
  ORANGE:{ id:"ORANGE",name:"Orange Route", color:"#ff8c3a", freq:30, hours:"0600–2200", days:"Mon–Fri",
    stops:["Pedestrian Gate","Provider Grill DFAC","SLQs (12200s Block)","TMP / Driver's Licensing","Eighth Army HQ"] },
  PURPLE:{ id:"PURPLE",name:"Purple Route", color:"#c47aff", freq:15, hours:"0600–2200", days:"Mon–Fri",
    stops:["Brian D. Allgood Hospital","Bus Terminal","Collier Fitness Center","Turner Fitness Center","TMP / Driver's Licensing","Spartan DFAC","Sitman Fitness Center","Barracks (6800s & 6900s Block)","Balboni Sports Field (5th St)","Pittman DFAC"] },
  GOLD:  { id:"GOLD",  name:"Gold Route",   color:"#FFD040", freq:20, hours:"0900–2100", days:"Mon–Sun",
    verified:true, note:"Departs Bus Terminal :00 :20 :40 each hour (from official July 2023 PDF)",
    stops:["Bus Terminal","Barracks (700s Block)","Morning Calm Center","Sentry Village Burger King","Sentry Village Mini Mall","MSG Jenkins Medical Clinic","Freedom Chapel","Collier Fitness Center","Family Housing Towers (Tropic Lightning Ave)","Family Housing Towers (Taro Ave)","Red Cloud Circle","Main Post Office","Main Exchange (PX)","Balboni Sports Field (Marne Ave)","Barracks (6800s Block)","River Bend Golf Course"] },
  BROWN: { id:"BROWN", name:"Brown Route",  color:"#e8944a", freq:30, hours:"1600–2200", days:"Fri–Sat",
    verified:true, note:"From official PDF (15 July 2023). Friday evening + Saturday/Training Holiday only.",
    stops:["Pedestrian Gate","Provider Grill DFAC","SLQs (12200s Block)","Eighth Army HQ","Pacific Victors Chapel","Downtown Plaza","Balboni Sports Field (Marne Ave)","Balboni Sports Field (5th St)","Pittman DFAC","Spartan DFAC","TMP / Driver's Licensing","Airfield Operations","Family Housing Towers (Tropic Lightning Ave)","Collier Fitness Center","Bus Terminal"] },
  PINK:  { id:"PINK",  name:"Pink Route",   color:"#ff6bb5", freq:15, hours:"1700–2300", days:"Fri–Sat",
    verified:true, note:"From official PDF (15 July 2023). Trial-run route; Friday/Training Holiday + Saturday only.",
    stops:["Pacific Victors Chapel","Family Mini Mall / Gas Station","Family Housing Towers (Taro Ave)","Family Housing Towers (15th Street)","Talon Cafe DFAC","TMP / Driver's Licensing"] },
};

const BUILDINGS = {
  "400":  { name:"Sentry Village Mini Mall",      stop:"Sentry Village Mini Mall" },
  "500":  { name:"Sentry Village Burger King",    stop:"Sentry Village Burger King" },
  "501":  { name:"Humphreys Hub",                 stop:"Bus Terminal" },
  "695":  { name:"Freedom Chapel",                stop:"Freedom Chapel" },
  "700":  { name:"Barracks (700s Block)",         stop:"Barracks (700s Block)" },
  "5410": { name:"Child Development Center",      stop:"Family Housing Towers (Tropic Lightning Ave)" },
  "5700": { name:"Main Exchange (PX)",            stop:"Main Exchange (PX)" },
  "6120": { name:"8A NCO Academy",               stop:"Law Enforcement Center (DES)" },
  "6140": { name:"DPW / Corps of Engineers HQ",  stop:"Corps of Engineers" },
  "6360": { name:"Pacific Victors Chapel",        stop:"Pacific Victors Chapel" },
  "6400": { name:"LTG Maude Hall / One Stop",     stop:"LTG Maude Hall (9th St)" },
  "6420": { name:"Civilian Personnel Center",     stop:"LTG Maude Hall (9th St)" },
  "6430": { name:"Community Banking Center",      stop:"LTG Maude Hall (9th St)" },
  "6800": { name:"Warrior Chapel / Barracks",     stop:"Barracks (6800s & 6900s Block)" },
  "9600": { name:"Brian D. Allgood Hospital",     stop:"Brian D. Allgood Hospital" },
};

const OFFPOST = [
  { id:"AIRPORT", icon:"✈️", name:"Incheon Airport Shuttle", color:"#5bb8ff",
    desc:"Runs daily. Priority: PCS → Emergency Leave → TDY → Ordinary Leave → All Others. Limited seating.",
    schedule:"Updated Feb 2026. Download current PDF from USAG Humphreys website.",
    pickup:"Bus Terminal + Brian D. Allgood Hospital" },
  { id:"SEOUL", icon:"🏙️", name:"Seoul / Dragon Hill Lodge", color:"#c47aff",
    desc:"Inter-garrison service to Yongsan-area installations. 1–2 departures per day.",
    schedule:"Verify current schedule at USAG Humphreys website.",
    pickup:"Bus Terminal + Brian D. Allgood Hospital" },
  { id:"K16", icon:"🚁", name:"K-16 Seoul Air Base", color:"#4dde88",
    desc:"Service to Seongnam (Seoul Air Base). Stops at Troop Medical Clinic and Main Gate.",
    schedule:"Verify current schedule at USAG Humphreys website.",
    pickup:"Bus Terminal + Brian D. Allgood Hospital" },
  { id:"DAEGU", icon:"🏔️", name:"USAG Daegu – Camp Carroll", color:"#ff8c3a",
    desc:"Service to Waegwan / Camp Carroll (Daegu area). Very limited frequency.",
    schedule:"Verify current schedule at USAG Humphreys website.",
    pickup:"Bus Terminal" },
  { id:"OSAN", icon:"🛫", name:"Osan Air Base", color:"#ff6bb5",
    desc:"Inter-garrison service to Osan Air Base.",
    schedule:"Verify current schedule at USAG Humphreys website.",
    pickup:"Bus Terminal" },
];

// ─── localStorage hook ────────────────────────────────────────────────────────
function useLocalStorage(key, initial) {
  const [v, setV] = useState(() => {
    try {
      const x = typeof localStorage !== "undefined" ? localStorage.getItem(key) : null;
      return x ? JSON.parse(x) : initial;
    } catch { return initial; }
  });
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* quota / privacy mode */ }
  }, [key, v]);
  return [v, setV];
}

// ─── Pathfinding ──────────────────────────────────────────────────────────────
const STOP_ROUTES = {};
for (const [id, r] of Object.entries(ROUTES))
  for (const s of r.stops) { if (!STOP_ROUTES[s]) STOP_ROUTES[s]=[]; STOP_ROUTES[s].push(id); }

const ALL_STOPS = [...new Set(Object.values(ROUTES).flatMap(r=>r.stops))].sort();

const SEARCH_INDEX = [
  ...ALL_STOPS.map(s => ({ label:s, stop:s, sub:"Bus stop" })),
  ...Object.entries(BUILDINGS).map(([num,b]) => ({
    label:`Bldg ${num} – ${b.name}`, stop:b.stop, sub:`Nearest stop: ${b.stop}`, isBuilding:true
  })),
];

// ─── Scheduled-departure lookup ───────────────────────────────────────────────
// Build a runtime index: route_id → stop_name → day_type → [minutes-since-midnight]
// from src/data/schedules.json (`by_route_pdf` blocks scraped from official PDFs).
const ROUTE_SCHEDULE_INDEX = (() => {
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

// Day-type labels in schedules.json → which days-of-week they apply to.
// dow: 0=Sun, 1=Mon, ..., 6=Sat.
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

// Pick the most-specific matching day-type label for a given dow.
function pickDayType(dow, available) {
  let best = null, bestSize = Infinity;
  for (const key of available) {
    const days = DAY_TYPE_DOWS[key];
    if (!days || !days.includes(dow)) continue;
    if (days.length < bestSize) { best = key; bestSize = days.length; }
  }
  return best;
}

// Return a Date at the given dow date with the given minutes-of-day.
function dateAtMinutes(ref, dayOffset, mins) {
  const d = new Date(ref);
  d.setDate(d.getDate() + dayOffset);
  d.setHours(0, 0, 0, 0);
  d.setMinutes(mins);
  d.setSeconds(0, 0);
  return d;
}

// Walk up to 7 days forward/backward looking for the first/last scheduled
// departure relative to `ref`. step=+1 for next, step=-1 for prev.
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

// Heuristic anchor: each route's cycle assumed to start at :00 from its
// first stop, +2 min/stop offset. Used when no PDF-sourced data exists.
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

// Next scheduled departure of route R at `stop` that is >= `after`.
// Prefer PDF-sourced timetable when available; else use the cycle-anchor
// heuristic.
function nextScheduledDeparture(R, stop, after) {
  const stopSched = ROUTE_SCHEDULE_INDEX[R.id]?.[stop];
  if (stopSched) return searchSchedule(stopSched, after, +1);
  return anchoredHeuristic(R, stop, after, +1);
}

// Last scheduled departure of route R at `stop` that is <= `before`.
function prevScheduledDeparture(R, stop, before) {
  const stopSched = ROUTE_SCHEDULE_INDEX[R.id]?.[stop];
  if (stopSched) return searchSchedule(stopSched, before, -1);
  return anchoredHeuristic(R, stop, before, -1);
}

// Now accepts refTime (Date) and mode ("depart" or "arrive")
function findTrips(from, to, refTime, mode) {
  if (!from||!to||from===to) return { trips:[], filtered:[] };
  const fr=STOP_ROUTES[from]||[], tr=STOP_ROUTES[to]||[];
  const candidates=[];
  const filtered=[]; // routes excluded for being out-of-service

  // For service-hour check: in "arrive" mode the trip starts roughly earlier
  const checkTime = mode === "depart" ? refTime : subMin(refTime, 60);

  for (const rid of fr.filter(r=>tr.includes(r))) {
    const R=ROUTES[rid];
    if (!inService(R, checkTime)) { filtered.push(R.name); continue; }
    const fi=R.stops.indexOf(from), ti=R.stops.indexOf(to);
    const n=Math.abs(ti-fi), t=n*2;
    candidates.push({ id:`d-${rid}`, type:"direct",
      legs:[{k:"walk",dur:3,dest:from},{k:"bus",rid,from,to,n,t},{k:"walk",dur:3,dest:null}] });
  }
  for (const r1 of fr) for (const r2 of tr) {
    if (r1===r2) continue;
    if (!inService(ROUTES[r1], checkTime) || !inService(ROUTES[r2], checkTime)) continue;
    const R1=ROUTES[r1], R2=ROUTES[r2];
    const shared=R1.stops.filter(s=>R2.stops.includes(s)&&s!==from&&s!==to);
    if (!shared.length) continue;
    // Pick shared stop minimizing heuristic total (real total computed in scheduling pass)
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
        {k:"walk",dur:3,dest:from},
        {k:"bus",rid:r1,from,to:x,n:n1,t:t1},
        {k:"xfer",dur:2,at:x},
        {k:"bus",rid:r2,from:x,to,n:n2,t:t2},
        {k:"walk",dur:3,dest:null}
      ] });
  }

  // Attach actual clock times and compute real waits from scheduled departures
  const trips=[];
  for (const trip of candidates) {
    if (mode === "arrive") {
      // Pass 1: walk backward from deadline to find latest viable departAt
      let t = new Date(refTime);
      let ok = true;
      for (let i = trip.legs.length - 1; i >= 0; i--) {
        const leg = trip.legs[i];
        if (leg.k === "walk" || leg.k === "xfer") {
          t = subMin(t, leg.dur);
        } else if (leg.k === "bus") {
          const latestBoard = subMin(t, leg.t);
          const sched = prevScheduledDeparture(ROUTES[leg.rid], leg.from, latestBoard);
          if (!sched) { ok = false; break; }
          t = sched;
        }
      }
      if (!ok) continue;
      trip.departAt = new Date(t);
      // Pass 2: replay forward from departAt to fill in real timestamps
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
      for (const leg of trip.legs) {
        if (leg.k === "walk") {
          leg.startAt = new Date(t); t = addMin(t, leg.dur); leg.endAt = new Date(t);
        } else if (leg.k === "bus") {
          // t = moment user arrives at stop. Wait until next scheduled bus.
          const sched = nextScheduledDeparture(ROUTES[leg.rid], leg.from, t);
          leg.w = Math.max(0, Math.round((sched - t) / 60000));
          leg.boardAt = sched;
          t = addMin(sched, leg.t);
          leg.alightAt = new Date(t);
        } else if (leg.k === "xfer") {
          leg.startAt = new Date(t); t = addMin(t, leg.dur); leg.endAt = new Date(t);
        }
      }
      trip.arriveAt = new Date(t);
    }
    trip.total = Math.max(1, Math.round((trip.arriveAt - trip.departAt) / 60000));
    trips.push(trip);
  }

  return { trips: trips.sort((a,b)=>a.total-b.total).slice(0,3), filtered: [...new Set(filtered)] };
}

// ─── CSS ──────────────────────────────────────────────────────────────────────
const CSS=`
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{background:#0e1a08}
.inp{background:#1c2e14;color:#e8dca8;border:1px solid #3a5820;border-radius:8px;padding:13px 14px;width:100%;font-family:'Rajdhani','Noto Sans KR',sans-serif;font-size:15px;font-weight:500;transition:border-color .2s}
.inp:focus{outline:none;border-color:#FFB81C;box-shadow:0 0 0 2px rgba(255,184,28,.18)}
.inp::placeholder{color:#3a5828}
.dd{position:absolute;top:calc(100% + 4px);left:0;right:0;background:#1c2e14;border:1px solid #3a5820;border-radius:8px;max-height:210px;overflow-y:auto;z-index:100;box-shadow:0 8px 32px rgba(0,0,0,.7)}
.di{padding:10px 14px;cursor:pointer;border-bottom:1px solid #182810}
.di:last-child{border-bottom:none}
.di:hover{background:#243a18}
.btn{width:100%;padding:14px;background:linear-gradient(135deg,#FFB81C,#d4960e);color:#080f04;border:none;border-radius:10px;font-family:'Rajdhani','Noto Sans KR',sans-serif;font-size:16px;font-weight:700;letter-spacing:2px;text-transform:uppercase;cursor:pointer;transition:transform .1s,box-shadow .2s}
.btn:hover:not(:disabled){transform:translateY(-1px);box-shadow:0 6px 20px rgba(255,184,28,.35)}
.btn:disabled{background:#1c2e14;color:#3a5828;cursor:not-allowed}
.si{animation:si .3s cubic-bezier(.22,.68,0,1.2)}
@keyframes si{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
.tab{flex:1;padding:8px 4px;border:none;border-radius:8px;font-family:'Rajdhani','Noto Sans KR',sans-serif;font-size:12px;font-weight:700;letter-spacing:.5px;cursor:pointer;transition:all .2s}
.seg{display:flex;gap:3px;background:#1c2e14;padding:3px;border-radius:8px;border:1px solid #3a5820}
.segbtn{flex:1;padding:7px 6px;border:none;border-radius:6px;font-family:'Rajdhani','Noto Sans KR',sans-serif;font-size:11px;font-weight:600;letter-spacing:.5px;cursor:pointer;background:transparent;color:#8aaa60;text-transform:uppercase;transition:all .15s}
.segbtn.on{background:#FFB81C;color:#080f04}
.timep{background:#1c2e14;color:#FFB81C;border:1px solid #3a5820;border-radius:6px;padding:9px 12px;width:100%;font-family:'JetBrains Mono',monospace;font-size:15px;font-weight:600;letter-spacing:1px;text-align:center}
.timep:focus{outline:none;border-color:#FFB81C}
.timep::-webkit-calendar-picker-indicator{filter:invert(.7) sepia(1) saturate(4) hue-rotate(2deg);cursor:pointer}
.tm{font-family:'JetBrains Mono',monospace;font-weight:500}
::-webkit-scrollbar{width:4px}
::-webkit-scrollbar-track{background:#0e1a08}
::-webkit-scrollbar-thumb{background:#3a5820;border-radius:2px}
.chip{display:inline-flex;align-items:center;gap:6px;background:#162210;border:1px solid #3a5820;border-radius:14px;padding:5px 4px 5px 10px;font-size:12px;color:#e8dca8;white-space:nowrap;flex-shrink:0;font-family:'Rajdhani','Noto Sans KR',sans-serif}
.chipx{background:transparent;border:none;color:#5a7a40;font-size:14px;cursor:pointer;padding:0 6px;line-height:1;border-radius:50%}
.chipx:hover{color:#FFB81C;background:#243a18}
`;

// ─── Searchable Input ─────────────────────────────────────────────────────────
function StopInput({ label, value, onChange }) {
  const { t } = useT();
  const [q, setQ] = useState(value||"");
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const ref = useRef(null);
  const listRef = useRef(null);

  // FIX: Always sync local q with parent value (not just when value is empty).
  // The old `if (!value) setQ("")` caused the swap button to silently fail —
  // inputs kept showing the old text even though fStop/tStop swapped correctly.
  // Use "store previous value" pattern so the sync happens during render, not in
  // an effect (avoids cascading renders).
  const [prevValue, setPrevValue] = useState(value);
  if (prevValue !== value) {
    setPrevValue(value);
    setQ(value || "");
    setHi(0);
  }

  const filtered = useMemo(()=>{
    if(!q.trim()) return [];
    const lq = q.toLowerCase()
      .replace(/\bbuilding\b/g,"bldg")
      .replace(/\bbldg\.?\s*/g,"bldg ")
      .trim();
    const numOnly = lq.replace(/\D/g,"");
    return SEARCH_INDEX.filter(x => {
      const lbl=x.label.toLowerCase(), stp=x.stop.toLowerCase();
      if(lbl.includes(lq)||stp.includes(lq)) return true;
      if(numOnly && x.isBuilding && lbl.includes(numOnly)) return true;
      return false;
    }).slice(0,9);
  },[q]);

  // Scroll highlighted item into view
  useEffect(()=>{
    if (!open || !listRef.current) return;
    const el = listRef.current.children[hi];
    if (el) el.scrollIntoView({ block:"nearest" });
  },[hi,open]);

  useEffect(()=>{
    const h=e=>{ if(ref.current&&!ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown",h);
    return()=>document.removeEventListener("mousedown",h);
  },[]);
  const pick=item=>{ setQ(item.label); setOpen(false); onChange(item.stop,item.label); };
  const onKey=e=>{
    if (!open || !filtered.length) {
      if (e.key === "Escape") setOpen(false);
      return;
    }
    if (e.key === "ArrowDown") { e.preventDefault(); setHi(i => (i+1) % filtered.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHi(i => (i-1+filtered.length) % filtered.length); }
    else if (e.key === "Enter") { e.preventDefault(); pick(filtered[hi]); }
    else if (e.key === "Escape") { e.preventDefault(); setOpen(false); }
  };
  return (
    <div ref={ref} style={{position:"relative"}}>
      <input className="inp" placeholder={t.stopPh(label)} value={q}
        onChange={e=>{setQ(e.target.value);setHi(0);setOpen(true);if(!e.target.value)onChange("","");}}
        onFocus={()=>setOpen(true)} onKeyDown={onKey} />
      {open && filtered.length>0 && (
        <div className="dd" ref={listRef}>
          {filtered.map((x,i)=>(
            <div key={i} className="di" onMouseDown={()=>pick(x)} onMouseEnter={()=>setHi(i)}
              style={i===hi?{background:C.bgHover}:undefined}>
              <div style={{fontSize:13,fontWeight:600,color:x.isBuilding?C.gold:C.khaki}}>{x.label}</div>
              <div style={{fontSize:11,color:C.oliveDim,marginTop:1}}>{x.sub}</div>
            </div>
          ))}
        </div>
      )}
      {open&&q.trim()&&!filtered.length&&(
        <div className="dd"><div className="di"><div style={{fontSize:12,color:C.oliveDim}}>{t.noMatch}</div></div></div>
      )}
    </div>
  );
}

// ─── Leg Row ──────────────────────────────────────────────────────────────────
function Leg({leg:l, last}) {
  const { t } = useT();
  const lc = l.k==="bus" ? ROUTES[l.rid].color : C.borderMain;
  return (
    <div style={{display:"flex",gap:14,paddingBottom:last?0:6}}>
      <div style={{display:"flex",flexDirection:"column",alignItems:"center",width:34,flexShrink:0}}>
        {l.k==="walk" && <div style={{width:34,height:34,borderRadius:"50%",background:C.bgSurface,border:`2px solid ${C.borderMain}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>🚶</div>}
        {l.k==="bus"  && <div style={{width:34,height:34,borderRadius:"50%",background:ROUTES[l.rid].color,display:"flex",alignItems:"center",justifyContent:"center",fontSize:15}}>🚌</div>}
        {l.k==="xfer" && <div style={{width:34,height:34,borderRadius:"50%",background:C.bgSurface,border:`2px dashed ${C.gold}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,color:C.gold}}>⇄</div>}
        {!last && <div style={{width:2,flex:1,background:lc+"66",minHeight:20,marginTop:4,borderRadius:2}}/>}
      </div>
      <div style={{paddingTop:6,paddingBottom:last?0:16,flex:1}}>
        {l.k==="walk" && <>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",gap:8}}>
            <div style={{fontSize:13,color:C.tan}}>{l.dest ? t.walkTo(l.dest) : t.walkDest}</div>
            <div className="tm" style={{fontSize:12,color:C.sage,flexShrink:0}}>{fmt(l.startAt)}–{fmt(l.endAt)}</div>
          </div>
          <div style={{fontSize:11,color:C.oliveDim,marginTop:2}}>{t.walkMin(l.dur)}</div>
        </>}
        {l.k==="bus" && <>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
            <span style={{background:ROUTES[l.rid].color,color:"#080f04",fontSize:10,fontWeight:700,padding:"2px 9px",borderRadius:20,letterSpacing:1,fontFamily:"'JetBrains Mono',monospace"}}>
              {ROUTES[l.rid].name.replace(" Route","").toUpperCase()}
            </span>
            <span style={{fontSize:11,color:C.sage}}>{t.everyMin(ROUTES[l.rid].freq)}</span>
          </div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",gap:8}}>
            <div style={{fontSize:13,color:C.tan}}>{t.boardAt} <strong style={{color:C.khaki}}>{l.from}</strong></div>
            <div className="tm" style={{fontSize:13,color:C.gold,fontWeight:600,flexShrink:0}}>{fmt(l.boardAt)}</div>
          </div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",gap:8}}>
            <div style={{fontSize:13,color:C.tan}}>{t.alightAt} <strong style={{color:C.khaki}}>{l.to}</strong></div>
            <div className="tm" style={{fontSize:13,color:C.gold,fontWeight:600,flexShrink:0}}>{fmt(l.alightAt)}</div>
          </div>
          <div style={{fontSize:11,color:C.oliveDim,marginTop:4}}>{t.busLegMeta(l.w,l.t,l.n)}</div>
        </>}
        {l.k==="xfer" && <>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",gap:8}}>
            <div style={{fontSize:13,color:C.gold,fontWeight:600}}>{t.transferHere}</div>
            <div className="tm" style={{fontSize:12,color:C.sage,flexShrink:0}}>{fmt(l.startAt)}–{fmt(l.endAt)}</div>
          </div>
          <div style={{fontSize:11,color:C.sage,marginTop:2}}>{t.xferMeta(l.at,l.dur)}</div>
        </>}
      </div>
    </div>
  );
}

// ─── Trip Card ────────────────────────────────────────────────────────────────
function TripCard({trip, rank:r}) {
  const { t } = useT();
  const [open,setOpen]=useState(r===0);
  const bl=trip.legs.filter(l=>l.k==="bus");
  const estimated=bl.some(l=>!ROUTES[l.rid].verified);
  return (
    <div style={{background:C.bgCard,border:`1px solid ${r===0?C.gold+"55":C.borderSub}`,borderRadius:14,marginBottom:12,overflow:"hidden",boxShadow:r===0?`0 0 28px rgba(255,184,28,.1)`:"none"}}>
      <div role="button" tabIndex={0} aria-expanded={open} aria-label={open?t.collapseTrip:t.expandTrip}
        onClick={()=>setOpen(o=>!o)}
        onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();setOpen(o=>!o);}}}
        style={{padding:"14px 16px",display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer"}}>
        <div style={{display:"flex",alignItems:"center",gap:12,flex:1}}>
          {r===0 && <span style={{background:C.gold,color:C.bgDeep,fontSize:9,fontWeight:800,padding:"3px 8px",borderRadius:6,letterSpacing:1.5,fontFamily:"'JetBrains Mono',monospace",flexShrink:0}}>{t.fastest}</span>}
          {estimated && <span title={t.estTitle} style={{background:"transparent",color:C.sage,border:`1px solid ${C.oliveMute}`,fontSize:9,fontWeight:700,padding:"2px 7px",borderRadius:6,letterSpacing:1.5,fontFamily:"'JetBrains Mono',monospace",flexShrink:0}}>{t.est}</span>}
          <div style={{flex:1,minWidth:0}}>
            <div style={{display:"flex",alignItems:"baseline",gap:10,flexWrap:"wrap"}}>
              <div className="tm" style={{fontSize:22,fontWeight:600,color:C.khaki,lineHeight:1}}>
                {fmt(trip.departAt)} <span style={{color:C.oliveDim,fontWeight:400}}>→</span> {fmt(trip.arriveAt)}
              </div>
              <div style={{fontSize:13,color:C.sage,lineHeight:1}}>~{trip.total} min</div>
            </div>
            <div style={{fontSize:12,color:C.oliveDim,marginTop:5}}>
              {trip.type==="direct"?t.direct:t.oneTransfer} ·&nbsp;
              {bl.map((l,i)=><span key={i} style={{color:ROUTES[l.rid].color}}>{ROUTES[l.rid].name.replace(" Route","")}{i<bl.length-1?" → ":""}</span>)}
            </div>
          </div>
        </div>
        <div style={{display:"flex",gap:5,alignItems:"center"}}>
          {bl.map(l=><div key={l.rid} style={{width:12,height:12,borderRadius:"50%",background:ROUTES[l.rid].color}}/>)}
          <span aria-hidden="true" style={{color:C.oliveDim,marginLeft:6,fontSize:12}}>{open?"▲":"▼"}</span>
        </div>
      </div>
      {open && <div style={{padding:"4px 16px 16px",borderTop:`1px solid ${C.borderDim}`}}>
        {trip.legs.map((l,i)=><Leg key={i} leg={l} last={i===trip.legs.length-1}/>)}
      </div>}
    </div>
  );
}

// ─── Route Card ───────────────────────────────────────────────────────────────
function RouteCard({route:r}) {
  const { t } = useT();
  const [open,setOpen]=useState(false);
  return (
    <div style={{background:C.bgCard,border:`1px solid ${r.color}33`,borderRadius:12,marginBottom:10,overflow:"hidden"}}>
      <div role="button" tabIndex={0} aria-expanded={open} aria-label={open?t.collapseRoute:t.expandRoute}
        onClick={()=>setOpen(o=>!o)}
        onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();setOpen(o=>!o);}}}
        style={{padding:"14px 16px",display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer"}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <div style={{width:14,height:14,borderRadius:"50%",background:r.color,boxShadow:`0 0 10px ${r.color}88`,flexShrink:0}}/>
          <div>
            <div style={{fontSize:16,fontWeight:700,color:C.khaki}}>{r.name}</div>
            <div style={{fontSize:11,color:C.oliveDim}}>{t.routeMeta(r.freq, r.stops.length, r.days, r.hours)}</div>
            {r.verified && <div style={{fontSize:10,color:"#4dde88",marginTop:2}}>{t.pdfVerified}</div>}
          </div>
        </div>
        <span aria-hidden="true" style={{color:C.oliveDim,fontSize:13}}>{open?"▲":"▼"}</span>
      </div>
      {open && (
        <div style={{padding:"0 16px 14px",borderTop:`1px solid ${r.color}22`}}>
          {r.stops.map((s,i)=>(
            <div key={s} style={{display:"flex",gap:10,alignItems:"flex-start"}}>
              <div style={{display:"flex",flexDirection:"column",alignItems:"center",width:20,flexShrink:0}}>
                <div style={{width:8,height:8,borderRadius:"50%",background:i===0||i===r.stops.length-1?r.color:C.borderMain,border:`2px solid ${r.color}`,marginTop:8,flexShrink:0}}/>
                {i<r.stops.length-1 && <div style={{width:2,height:22,background:r.color+"44"}}/>}
              </div>
              <div style={{padding:"4px 0 14px",fontSize:13,color:i===0||i===r.stops.length-1?C.khaki:C.tan,fontWeight:i===0||i===r.stops.length-1?600:400}}>
                {s}
                {(STOP_ROUTES[s]||[]).length>1 &&
                  <span style={{marginLeft:6,fontSize:10,color:C.gold}}>
                    {(STOP_ROUTES[s]||[]).filter(x=>x!==r.id).map(x=>ROUTES[x].name.split(" ")[0]).join(" +")}
                  </span>}
              </div>
            </div>
          ))}
          {r.verified && (
            <div style={{background:C.bgSurface,border:`1px solid ${C.borderMain}`,borderRadius:8,padding:"10px 12px",marginTop:4}}>
              <div style={{fontSize:11,color:C.gold,fontWeight:700,marginBottom:4}}>{t.verifiedScheduleHeader}</div>
              <div style={{fontSize:12,color:C.tan}}>{r.note}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Now Tab ──────────────────────────────────────────────────────────────────
// Verified routes (only Gold, currently) show exact clock times.
// Unverified routes use the same scheduled-departure heuristic that findTrips
// uses (anchor :00, +2 min/stop offset) but are shown as estimates.
function nextDepartureInfo(rid, stop, now) {
  const R = ROUTES[rid];
  if (!inService(R, now)) {
    return { kind: "oos", route: R };
  }
  const next = nextScheduledDeparture(R, stop, now);
  if (!next) return { kind: "oos", route: R };
  const mins = Math.max(0, Math.round((next - now) / 60000));
  return { kind: R.verified ? "exact" : "approx", route: R, at: next, mins };
}

function NextDepartureRow({ rid, stop, now }) {
  const { t } = useT();
  const info = nextDepartureInfo(rid, stop, now);
  const R = info.route;
  return (
    <div style={{background:C.bgCard,border:`1px solid ${R.color}33`,borderRadius:12,marginBottom:10,padding:"12px 14px",display:"flex",alignItems:"center",gap:12}}>
      <div style={{width:14,height:14,borderRadius:"50%",background:R.color,boxShadow:`0 0 10px ${R.color}88`,flexShrink:0}}/>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:15,fontWeight:700,color:C.khaki}}>{R.name}</div>
        <div style={{fontSize:11,color:C.oliveDim,marginTop:2}}>
          {t.everyMin(R.freq)} · {R.days} · {R.hours}
          {R.verified && <span style={{color:"#4dde88",marginLeft:6}}>✓</span>}
        </div>
      </div>
      <div style={{textAlign:"right",flexShrink:0}}>
        {info.kind === "exact" && <>
          <div className="tm" style={{fontSize:18,fontWeight:600,color:C.gold,lineHeight:1}}>{fmt(info.at)}</div>
          <div style={{fontSize:11,color:C.sage,marginTop:3}}>{info.mins===0?t.nowWord:t.inMin(info.mins)}</div>
        </>}
        {info.kind === "approx" && <>
          <div className="tm" style={{fontSize:18,fontWeight:600,color:C.tan,lineHeight:1}}>~{fmt(info.at)}</div>
          <div style={{fontSize:10,color:C.oliveDim,marginTop:3,letterSpacing:.5}}>{info.mins===0?t.nowWord:t.inMin(info.mins)} · {t.estAvg}</div>
        </>}
        {info.kind === "oos" && <>
          <div style={{fontSize:12,fontWeight:600,color:C.oliveDim,lineHeight:1.2}}>{t.outOfService1}</div>
          <div style={{fontSize:12,fontWeight:600,color:C.oliveDim,lineHeight:1.2}}>{t.outOfService2}</div>
        </>}
      </div>
    </div>
  );
}

function NowTab() {
  const { t } = useT();
  const [stop, setStop] = useState("");
  const [stopLbl, setStopLbl] = useState("");
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(id);
  }, []);

  const routesAtStop = stop ? (STOP_ROUTES[stop] || []) : [];

  return (
    <div style={{padding:"16px 14px 32px"}}>
      <div style={{background:C.bgCard,border:`1px solid ${C.borderSub}`,borderRadius:14,padding:16,marginBottom:14}}>
        <div style={{fontSize:11,color:C.oliveMute,letterSpacing:1.5,textTransform:"uppercase",marginBottom:14}}>{t.whereAreYou}</div>
        <StopInput label={t.atStop} value={stopLbl} onChange={(s,l)=>{setStop(s);setStopLbl(l);}}/>
        <div style={{fontSize:11,color:C.oliveDim,marginTop:10,display:"flex",alignItems:"center",gap:6}}>
          <span style={{fontSize:13}}>🕒</span>
          <span>{t.asOf(fmt(now))}</span>
        </div>
      </div>

      {stop && routesAtStop.length > 0 && (
        <>
          <div style={{fontSize:11,color:C.oliveMute,letterSpacing:1.5,textTransform:"uppercase",marginBottom:10}}>
            {t.nextDeparturesFrom(stop)}
          </div>
          {routesAtStop.map(rid => <NextDepartureRow key={rid} rid={rid} stop={stop} now={now}/>)}
          <div style={{fontSize:11,color:C.oliveMute,textAlign:"center",marginTop:8,lineHeight:1.6}}>
            {t.goldDisclaimer}
          </div>
        </>
      )}

      {stop && routesAtStop.length === 0 && (
        <div style={{background:C.bgCard,border:`1px solid ${C.borderSub}`,borderRadius:14,padding:24,textAlign:"center"}}>
          <div style={{fontSize:13,color:C.oliveDim}}>{t.noRoutesHere}</div>
        </div>
      )}

      {!stop && (
        <div style={{background:C.bgCard,border:`1px solid ${C.borderSub}`,borderRadius:10,padding:"12px 14px",display:"flex",gap:10}}>
          <span style={{fontSize:16}}>ℹ️</span>
          <div style={{fontSize:11,color:C.oliveDim,lineHeight:1.6}}>
            {t.pickStopHint}
          </div>
        </div>
      )}
    </div>
  );
}
// ─── Off-Post Tab ─────────────────────────────────────────────────────────────
// Long English descriptive paragraphs here intentionally left English: MVP scope
// for the Korean toggle is UI chrome only. Long-form reference content can be
// translated in a follow-up with KATUSA/KSC QA.
function OffPostTab() {
  const { t } = useT();
  return (
    <div style={{padding:"16px 14px 32px"}}>
      <div style={{background:`linear-gradient(135deg,${C.bgCard},#162a10)`,border:`1px solid ${C.borderMain}`,borderRadius:14,padding:18,marginBottom:20}}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
          <span style={{fontSize:22}}>📡</span>
          <div>
            <div style={{fontFamily:"'Rajdhani','Noto Sans KR',sans-serif",fontSize:17,fontWeight:700,color:C.gold,letterSpacing:1}}>{t.liveGps}</div>
            <div style={{fontSize:11,color:C.oliveDim,letterSpacing:.5}}>{t.futureFeatureLabel}</div>
          </div>
        </div>
        {[
          ["🔧","Bus Hardware","GPS + cellular modem units on every bus. ~$200–500 each. Procured through DPW/Transportation office."],
          ["🖥️","Backend Server","Receives GPS pings every 5–10 sec from each bus and exposes an API. Needs DoD-compatible hosting (AWS GovCloud or on-prem USFK server)."],
          ["🔐","Security Approval","All data must traverse DoD-approved networks with authenticated APIs. Requires G6/S6 and likely USFK IT coordination."],
          ["📱","App Integration","This app polls the API every 5–10 sec and moves bus icons on a live map. Map tiles must be licensed for on-post use."],
          ["💡","Fastest Path","BusWhere is already deployed at Osan Air Base. Requesting the same system for Humphreys may be quicker than building custom."],
        ].map(([icon,title,desc])=>(
          <div key={title} style={{display:"flex",gap:10,marginBottom:10,paddingBottom:10,borderBottom:`1px solid ${C.borderDim}`}}>
            <span style={{fontSize:15,flexShrink:0,marginTop:2}}>{icon}</span>
            <div>
              <div style={{fontSize:13,fontWeight:700,color:C.tan,marginBottom:2}}>{title}</div>
              <div style={{fontSize:12,color:C.sage,lineHeight:1.6}}>{desc}</div>
            </div>
          </div>
        ))}
        <div style={{background:"#0a1a08",border:"1px solid #2a5a20",borderRadius:8,padding:"10px 12px"}}>
          <div style={{fontSize:11,color:"#5dde88",lineHeight:1.6}}>
            <strong style={{color:"#4dde88"}}>{t.gpsAction}</strong>{t.gpsActionText}
          </div>
        </div>
      </div>

      <div style={{fontSize:11,color:C.oliveMute,letterSpacing:1.5,textTransform:"uppercase",marginBottom:10}}>{t.interGarrisonHeader}</div>
      <div style={{background:C.bgCard,border:`1px solid ${C.borderSub}`,borderRadius:10,padding:"12px 14px",marginBottom:12}}>
        <div style={{fontSize:12,color:C.sage,lineHeight:1.7}}>
          {t.interGarrisonWarn1}<strong style={{color:C.tan}}>{t.interGarrisonWarnStrong}</strong>{t.interGarrisonWarn2}<br/>
          <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:11,color:C.gold}}>home.army.mil/humphreys → Inter-Garrison Bus Service</span>
        </div>
      </div>
      {OFFPOST.map(r=>(
        <div key={r.id} style={{background:C.bgCard,border:`1px solid ${r.color}33`,borderRadius:12,marginBottom:10,padding:"14px 16px"}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
            <span style={{fontSize:20}}>{r.icon}</span>
            <div>
              <div style={{fontSize:15,fontWeight:700,color:C.khaki}}>{r.name}</div>
              <div style={{fontSize:11,color:C.oliveDim}}>{t.pickupLabel} {r.pickup}</div>
            </div>
          </div>
          <div style={{fontSize:12,color:C.tan,lineHeight:1.6,marginBottom:4}}>{r.desc}</div>
          <div style={{fontSize:11,color:C.sage,fontStyle:"italic"}}>{r.schedule}</div>
        </div>
      ))}

      <div style={{background:"#120e04",border:`1px solid #4a3a10`,borderRadius:12,padding:"14px 16px",marginTop:12}}>
        <div style={{fontSize:13,fontWeight:700,color:C.gold,marginBottom:10}}>{t.todoHeader}</div>
        {[
          "Download current inter-garrison PDFs from USAG Humphreys (airport schedule updated Feb 2026)",
          "Provide Brown & Pink route PDFs to verify their stops (currently estimated)",
          "Obtain full building-number directory from DPW GIS / IGI&S office (Bldg 6140)",
          "Contact Transportation (DSN 755-0424) about GPS tracker feasibility or BusWhere deployment",
          "Confirm Blue/Black/Green/Orange/Purple schedule PDFs to replace estimated frequencies with exact timetables",
          "Get KATUSA / KSC colleague to QA the Korean translation strings before public release",
        ].map((task,i)=>(
          <div key={i} style={{display:"flex",gap:8,marginBottom:10}}>
            <span style={{color:C.gold,fontWeight:700,flexShrink:0,fontFamily:"'JetBrains Mono',monospace",fontSize:13}}>{i+1}.</span>
            <div style={{fontSize:12,color:C.tan,lineHeight:1.6}}>{task}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [fStop,setFS]=useState(""), [tStop,setTS]=useState("");
  const [fLbl,setFL]=useState(""),  [tLbl,setTL]=useState("");
  const [results,setRes]=useState(null), [searched,setSrch]=useState(false);
  const [tab,setTab]=useState("plan");

  // Time-mode state. tMode: "now" | "depart" | "arrive".
  // tTime: "HH:MM" string. tDate: "YYYY-MM-DD" string. Both ignored when tMode === "now".
  const [tMode, setTMode] = useState("now");
  const nowHM = () => { const d=new Date(); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };
  const [tTime, setTTime] = useState(nowHM);
  const [tDate, setTDate] = useState(todayYMD);

  // Favorites: user-named From stops. Recent: last 5 unique From→To searches.
  const [favorites, setFavorites] = useLocalStorage("humphreys.favorites", []);
  const [recent, setRecent] = useLocalStorage("humphreys.recent", []);

  // UI language. Persisted across reloads. Stop / route names stay English regardless.
  const [lang, setLang] = useLocalStorage("humphreys.lang", "en");
  const t = STRINGS[lang] || STRINGS.en;

  const search=()=>{
    const ref = tMode === "now" ? new Date() : parseHMD(tTime, tDate);
    const mode = tMode === "arrive" ? "arrive" : "depart";
    setRes(findTrips(fStop, tStop, ref, mode));
    setSrch(true);
    setRecent(prev => {
      const entry = { fStop, tStop, fLbl, tLbl };
      const deduped = prev.filter(r => !(r.fStop===fStop && r.tStop===tStop));
      return [entry, ...deduped].slice(0, 5);
    });
  };
  const reset=()=>{setRes(null);setSrch(false);};
  const swap=()=>{setFS(tStop);setTS(fStop);setFL(tLbl);setTL(fLbl);reset();};

  const addFavorite=()=>{
    if (!fStop) { alert(t.pickFromFirst); return; }
    const name = (prompt(t.saveFavPrompt) || "").trim();
    if (!name) return;
    setFavorites(prev => [{name, stop:fStop, label:fLbl}, ...prev.filter(f => !(f.stop===fStop && f.name===name))]);
  };
  const removeFavorite=idx=>setFavorites(prev=>prev.filter((_,i)=>i!==idx));
  const removeRecent=idx=>setRecent(prev=>prev.filter((_,i)=>i!==idx));
  const applyFavorite=f=>{setFS(f.stop);setFL(f.label);reset();};
  const applyRecent=r=>{setFS(r.fStop);setFL(r.fLbl);setTS(r.tStop);setTL(r.tLbl);reset();};
  const TABS=[["plan",t.tabPlan],["now",t.tabNow],["routes",t.tabRoutes],["offpost",t.tabOffpost]];

  return (
    <LangContext.Provider value={{ lang, t }}>
    <div style={{fontFamily:"'Rajdhani','Noto Sans KR',sans-serif",background:C.bgBase,minHeight:"100vh",color:C.tan,maxWidth:480,margin:"0 auto"}}>
      <style>{CSS}</style>

      <div style={{background:`linear-gradient(180deg,${C.bgCard} 0%,${C.bgBase} 100%)`,borderBottom:`1px solid ${C.borderSub}`,padding:"18px 16px 14px"}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <div style={{width:48,height:48,background:`linear-gradient(135deg,${C.gold},${C.goldDark})`,borderRadius:10,display:"flex",alignItems:"center",justifyContent:"center",fontSize:24,boxShadow:`0 4px 20px rgba(255,184,28,.4)`,flexShrink:0}}>🚌</div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontFamily:"'Rajdhani','Noto Sans KR',sans-serif",fontSize:lang==="ko"?20:22,fontWeight:700,color:C.gold,letterSpacing:lang==="ko"?1.5:3,textTransform:lang==="ko"?"none":"uppercase",lineHeight:1.1}}>{t.appTitle}</div>
            <div style={{fontSize:11,color:C.oliveMute,letterSpacing:lang==="ko"?1:2,textTransform:lang==="ko"?"none":"uppercase"}}>{t.appSubtitle}</div>
          </div>
          <div role="group" aria-label="Language" style={{display:"flex",gap:2,background:C.bgSurface,border:`1px solid ${C.borderMain}`,borderRadius:6,padding:2,flexShrink:0}}>
            <button onClick={()=>setLang("en")} aria-pressed={lang==="en"}
              style={{background:lang==="en"?C.gold:"transparent",color:lang==="en"?C.bgDeep:C.sage,border:"none",borderRadius:4,padding:"4px 8px",fontSize:11,fontWeight:700,fontFamily:"'Rajdhani','Noto Sans KR',sans-serif",cursor:"pointer",letterSpacing:1}}>EN</button>
            <button onClick={()=>setLang("ko")} aria-pressed={lang==="ko"}
              style={{background:lang==="ko"?C.gold:"transparent",color:lang==="ko"?C.bgDeep:C.sage,border:"none",borderRadius:4,padding:"4px 8px",fontSize:11,fontWeight:700,fontFamily:"'Rajdhani','Noto Sans KR',sans-serif",cursor:"pointer"}}>한국어</button>
          </div>
        </div>

        <div style={{display:"flex",gap:3,margin:"14px 0 12px",height:4,borderRadius:2,overflow:"hidden"}}>
          {Object.values(ROUTES).map(r=>(
            <div key={r.id} style={{flex:1,background:r.color,borderRadius:2}}/>
          ))}
        </div>

        <div role="tablist" style={{display:"flex",gap:6}}>
          {TABS.map(([id,lbl])=>(
            <button key={id} className="tab" role="tab" aria-selected={tab===id} onClick={()=>{setTab(id);reset();}}
              style={{background:tab===id?C.gold:C.bgSurface, color:tab===id?C.bgDeep:C.sage, border:`1px solid ${tab===id?C.gold:C.borderMain}`}}>
              {lbl}
            </button>
          ))}
        </div>
      </div>

      {tab==="plan" && (
        <div style={{padding:"16px 14px"}}>
          {(favorites.length>0 || recent.length>0) && (
            <div style={{marginBottom:12}}>
              {favorites.length>0 && (
                <div style={{marginBottom:8}}>
                  <div style={{fontSize:10,color:C.oliveMute,letterSpacing:1.5,textTransform:"uppercase",marginBottom:6}}>{t.favorites}</div>
                  <div style={{display:"flex",gap:6,overflowX:"auto",paddingBottom:4}}>
                    {favorites.map((f,i)=>(
                      <div key={i} className="chip" style={{borderColor:C.gold+"66",color:C.khaki}}>
                        <span onClick={()=>applyFavorite(f)} style={{cursor:"pointer",display:"flex",alignItems:"center",gap:6}}>
                          <span style={{color:C.gold}}>★</span>
                          <span style={{fontWeight:600}}>{f.name}</span>
                          <span style={{color:C.oliveDim,fontSize:10}}>· {f.stop}</span>
                        </span>
                        <button className="chipx" onClick={()=>removeFavorite(i)} aria-label={t.removeFavorite}>×</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {recent.length>0 && (
                <div>
                  <div style={{fontSize:10,color:C.oliveMute,letterSpacing:1.5,textTransform:"uppercase",marginBottom:6}}>{t.recent}</div>
                  <div style={{display:"flex",gap:6,overflowX:"auto",paddingBottom:4}}>
                    {recent.map((r,i)=>(
                      <div key={i} className="chip">
                        <span onClick={()=>applyRecent(r)} style={{cursor:"pointer",display:"flex",alignItems:"center",gap:4}}>
                          <span style={{color:C.tan}}>{r.fStop}</span>
                          <span style={{color:C.oliveDim}}>→</span>
                          <span style={{color:C.tan}}>{r.tStop}</span>
                        </span>
                        <button className="chipx" onClick={()=>removeRecent(i)} aria-label={t.removeRecent}>×</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          <div style={{background:C.bgCard,border:`1px solid ${C.borderSub}`,borderRadius:14,padding:16,marginBottom:14}}>
            <div style={{fontSize:11,color:C.oliveMute,letterSpacing:1.5,textTransform:"uppercase",marginBottom:14}}>{t.typePrompt}</div>
            <div style={{marginBottom:10}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6,justifyContent:"space-between"}}>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <div style={{width:9,height:9,borderRadius:"50%",background:"#4dde88",boxShadow:"0 0 7px #4dde88aa"}}/>
                  <span style={{fontSize:10,color:"#4dde88",textTransform:"uppercase",letterSpacing:1.5}}>{t.from}</span>
                </div>
                {fStop && <button onClick={addFavorite} title={t.saveFavTitle} style={{background:"transparent",border:`1px solid ${C.gold}55`,color:C.gold,fontSize:10,padding:"2px 8px",borderRadius:10,cursor:"pointer",letterSpacing:1,textTransform:"uppercase",fontWeight:700}}>{t.saveFav}</button>}
              </div>
              <StopInput label={t.from} value={fLbl} onChange={(s,l)=>{setFS(s);setFL(l);reset();}}/>
            </div>
            <div style={{display:"flex",justifyContent:"center",margin:"4px 0"}}>
              <button onClick={swap} aria-label={t.swapStops} title={t.swapStops} style={{background:C.bgSurface,border:`1px solid ${C.borderMain}`,borderRadius:"50%",width:32,height:32,cursor:"pointer",color:C.sage,fontSize:16,display:"flex",alignItems:"center",justifyContent:"center"}}>⇅</button>
            </div>
            <div style={{marginBottom:14}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                <div style={{width:9,height:9,borderRadius:2,background:C.gold,boxShadow:`0 0 7px ${C.gold}aa`}}/>
                <span style={{fontSize:10,color:C.gold,textTransform:"uppercase",letterSpacing:1.5}}>{t.to}</span>
              </div>
              <StopInput label={t.to} value={tLbl} onChange={(s,l)=>{setTS(s);setTL(l);reset();}}/>
            </div>

            {/* Time mode picker */}
            <div style={{borderTop:`1px solid ${C.borderDim}`,paddingTop:12,marginBottom:14}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                <span style={{fontSize:14}}>⏰</span>
                <span style={{fontSize:10,color:C.sage,textTransform:"uppercase",letterSpacing:1.5}}>{t.when}</span>
              </div>
              <div className="seg" role="group" aria-label={t.when}>
                {[["now",t.leaveNow],["depart",t.departAt],["arrive",t.arriveBy]].map(([k,lbl])=>(
                  <button key={k} className={`segbtn ${tMode===k?"on":""}`} aria-pressed={tMode===k} onClick={()=>{setTMode(k); reset();}}>{lbl}</button>
                ))}
              </div>
              {tMode !== "now" && (
                <>
                  <div style={{marginTop:10,display:"flex",gap:8}}>
                    <input type="date" className="timep" value={tDate} min={todayYMD()}
                      onChange={e=>{setTDate(e.target.value); reset();}} style={{flex:1.3}}/>
                    <input type="time" className="timep" value={tTime}
                      onChange={e=>{setTTime(e.target.value); reset();}} style={{flex:1}}/>
                  </div>
                  <div role="group" aria-label="Date" style={{display:"flex",gap:4,marginTop:8,flexWrap:"wrap"}}>
                    {Array.from({length:7}).map((_,i)=>{
                      const d=new Date(); d.setDate(d.getDate()+i);
                      const ymd=`${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
                      const lbl=i===0?t.today:i===1?t.tomorrow:t.dow[d.getDay()];
                      const on=tDate===ymd;
                      return (
                        <button key={i} className={`segbtn ${on?"on":""}`} aria-pressed={on}
                          style={{flex:"1 1 0",minWidth:42,padding:"6px 4px",fontSize:10}}
                          onClick={()=>{setTDate(ymd); reset();}}>{lbl}</button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            <button className="btn" disabled={!fStop||!tStop} onClick={search}>{t.findRoutes}</button>
          </div>

          <div style={{background:C.bgCard,border:`1px solid ${C.borderSub}`,borderRadius:10,padding:"10px 14px",marginBottom:14,display:"flex",gap:10}}>
            <span style={{fontSize:14}}>🏢</span>
            <div style={{fontSize:11,color:C.oliveDim,lineHeight:1.6}}>
              <span style={{color:C.tan,fontWeight:600}}>{t.bldgsMappedTitle}</span>{t.bldgsMappedDesc}
            </div>
          </div>

          {searched && (
            <div className="si">
              {!results.trips.length ? (
                <div style={{background:C.bgCard,border:`1px solid ${C.borderSub}`,borderRadius:14,padding:28,textAlign:"center"}}>
                  <div style={{fontSize:36,marginBottom:10}}>🔍</div>
                  <div style={{fontSize:15,fontWeight:600,color:C.khaki,marginBottom:8}}>{t.noTrips}</div>
                  <div style={{fontSize:13,color:C.oliveDim,lineHeight:1.6}}>
                    {results.filtered.length > 0
                      ? t.noTripsOOS(results.filtered.join(", "))
                      : t.noTripsNoPath}
                  </div>
                </div>
              ) : (
                <>
                  <div style={{fontSize:11,color:C.oliveMute,letterSpacing:1.5,textTransform:"uppercase",marginBottom:12}}>
                    {t.optionsFound(results.trips.length)}
                    {results.filtered.length>0 && <span style={{color:C.gold,marginLeft:8,textTransform:"none",letterSpacing:0}}>· {t.routesOOS(results.filtered.length)}</span>}
                  </div>
                  {results.trips.map((trip,i)=><TripCard key={trip.id} trip={trip} rank={i}/>)}
                  <div style={{fontSize:11,color:C.oliveMute,textAlign:"center",marginTop:8,lineHeight:1.6}}>{t.waitDisclaimer}</div>
                </>
              )}
            </div>
          )}

          {!searched && (
            <div style={{background:C.bgCard,border:`1px solid ${C.borderSub}`,borderRadius:10,padding:"12px 14px",display:"flex",gap:10}}>
              <span style={{fontSize:16}}>ℹ️</span>
              <div style={{fontSize:11,color:C.oliveDim,lineHeight:1.6}}>
                {t.shuttleInfo}
              </div>
            </div>
          )}
        </div>
      )}

      {tab==="now" && <NowTab/>}

      {tab==="routes" && (
        <div style={{padding:"16px 14px 24px"}}>
          <div style={{background:C.bgCard,border:`1px solid ${C.borderSub}`,borderRadius:10,padding:"10px 14px",marginBottom:14}}>
            <div style={{fontSize:11,color:C.sage,lineHeight:1.6}}>
              {t.goldDotsInfo}
            </div>
          </div>
          {Object.values(ROUTES).map(r=><RouteCard key={r.id} route={r}/>)}
        </div>
      )}

      {tab==="offpost" && <OffPostTab/>}
    </div>
    </LangContext.Provider>
  );
}
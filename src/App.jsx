import { Fragment, Suspense, lazy, useState, useMemo, useRef, useEffect, createContext, useContext } from "react";
import { createPortal } from "react-dom";
import {
  pad2,
  nearestStopTo,
  ROUTES, STOP_ROUTES, ALL_STOPS, STOP_ALIASES,
  inService,
  serviceEndToday,
  nextDeparture,
  departureSource,
  freqAt,
  nextServiceStart,
  findTrips,
} from "./lib/routing.js";
import { ROUTE_BADGE } from "./lib/palette.js";
import { ArrowDownUp, ChevronDown, ClockAlert, FileText, History, Languages, Monitor, Moon, Star, Sun } from "lucide-react";
import { formatDay, todayYMD, ymd } from "@/lib/datetime.js";
import { BrandMark } from "@/components/brand-mark.jsx";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

// MAPA = My Army Post App, the official U.S. Army garrison app. We point users
// toward it (Director Nagan's condition for not competing with MAPA), never away.
// Store URLs verified via public listings June 2026.
const MAPA_LINKS = {
  ios:     "https://apps.apple.com/us/app/myarmypost/id6467240977",
  android: "https://play.google.com/store/apps/details?id=mil.aswf.garrison",
};

const FEEDBACK_URL = "https://tally.so/r/dWGWEN";

const shortName = rid => ROUTES[rid].name.replace(" Route", "");

const DARK_QUERY = "(prefers-color-scheme: dark)";

function useResolvedTheme(pref) {
  const [systemDark, setSystemDark] = useState(
    () => typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia(DARK_QUERY).matches
      : false
  );
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia(DARK_QUERY);
    const onChange = e => setSystemDark(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  if (pref === "dark") return "dark";
  if (pref === "light") return "light";
  return systemDark ? "dark" : "light";
}

// ─── Time Helpers ─────────────────────────────────────────────────────────────
const fmt  = d => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
// Combine "YYYY-MM-DD" date string and "HH:MM" time string into a Date.
const parseHMD = (hm, ymd) => {
  const [h, m] = hm.split(":").map(Number);
  const [y, mo, d] = ymd.split("-").map(Number);
  return new Date(y, mo-1, d, h, m, 0, 0);
};
const DOW = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

// Promise-wrapped geolocation. Resolves to { lat, lon, accuracy } or rejects.
function requestUserLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation not supported in this browser."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      p => resolve({ lat: p.coords.latitude, lon: p.coords.longitude, accuracy: p.coords.accuracy }),
      e => reject(e),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  });
}
const DOW_KO = ["일","월","화","수","목","금","토"];

// ─── i18n ─────────────────────────────────────────────────────────────────────
// Translates UI chrome only. Stop names and route names stay English on purpose:
// the audience already says "PX" and "Maude Hall" in English on base.
// NOTE: Korean strings are first-draft. They need QA from a KATUSA, KSC employee,
// or Korean civilian colleague before public release — military/transit phrasing
// is hard to get right from machine translation alone.
const STRINGS = {
  en: {
    appTitle: "Humphreys Transit Planner",
    appSubtitle: "Community shuttle planner · Pyeongtaek",
    tabPlan: "Plan", tabNow: "Now", tabRoutes: "Routes", tabOffpost: "Off-Post",
    mainNav: "Main tabs",
    themeLabel: "Appearance",
    themeLight: "Light", themeDark: "Dark", themeSystem: "System",
    themeCycle: (current, next) => `Appearance: ${current}. Tap for ${next}`,
    switchLang: "Switch to Korean",
    pickDate: "Choose date", pickHour: "Hour", pickMinute: "Minute",
    favorites: "Favorites", recent: "Recent trips",
    planTrip: "Plan a trip",
    from: "From", to: "To", atStop: "At stop",
    stopPh: l => `${l} — stop name or Bldg #`,
    saveFav: "★ Save", saveFavTitle: "Save From as favorite",
    saveFavHeading: "Save favorite",
    saveFavPrompt: "Name this favorite (e.g. Home, Work, Gym)",
    favNameLabel: "Name",
    actionCancel: "Cancel", actionSave: "Save", actionOk: "OK",
    noticeHeading: "Notice",
    nearestStop: "Nearest",
    nearestLoading: "…",
    usingLocation: "Using your current location for walk time",
    locError: msg => `Could not get your location: ${msg}`,
    pickFromFirst: "Pick a From stop first, then save it as a favorite.",
    removeFavorite: "Remove favorite", removeRecent: "Remove recent",
    swapStops: "Swap from and to",
    expandTrip: "Show trip details", collapseTrip: "Hide trip details",
    expandRoute: "Show route stops", collapseRoute: "Hide route stops",
    when: "When",
    leaveNow: "Leave now", departAt: "Depart at", arriveBy: "Arrive by",
    today: "Today", tomorrow: "Tmrw", dow: DOW,
    findRoutes: "Find Routes →",
    bldgsMappedTitle: n => `${n} building numbers mapped`,
    bldgsMappedDesc: " (e.g. 6400 → Maude Hall, 5700 → PX). Full directory pending from DPW Bldg 6140.",
    noTrips: "No Trips Available",
    noTripsOOS: names => ["Possible routes are outside service hours at this time (", names, "). Try a different time."],
    noTripsNoPath: "No shared or 1-transfer path exists. Try selecting the Bus Terminal as a hub, or a nearby major stop.",
    noTripsOvernightDirect: names => ["Bus service (", names, ") ends before this trip can finish. Service resumes the next service day — consider a taxi, Kakao T, or walking."],
    noTripsOvernightXfer: names => ["The transfer bus (", names, ") would have stopped running before you could board it. The shuttle network can't get you there in time — consider a taxi, Kakao T, or walking."],
    optionsFound: n => `${n} option${n!==1?"s":""} found`,
    routesOOS: n => `${n} route${n!==1?"s":""} out of service`,
    direct: "Direct · no transfer", oneTransfer: "1 transfer",
    walkTo: stop => `Walk to ${stop}`, walkDest: "Walk to destination",
    walkMin: m => `~${m} min walk`,
    boardAt: "Board at", alightAt: "Alight at", transferHere: "Transfer here",
    busLegMeta: (w,t,n) => `~${w} min wait · ~${t} min ride · ${n} stop${n!==1?"s":""}`,
    xferMeta: (at,dur) => `${at} · ~${dur} min`,
    fastest: "FASTEST", estimated: "Estimated", estShort: "est.",
    editTrip: "Edit",
    otherOptions: n => `${n} other option${n!==1?"s":""}`,
    noOptionsFound: "No options found",
    countdownUntil: (route, stop) => ["until the ", route, " bus leaves ", stop],
    leavingNow: "leaving now",
    minutes: m => `${m} min`,
    walkToStopMin: (m, stop) => `Walk ${m} min to ${stop}`,
    walkToDestMin: m => `Walk ${m} min to destination`,
    boardWait: (route, w) => ["Board ", route, ` · wait ~${w} min`],
    transferWait: (route, w) => ["Transfer to ", route, ` · wait ~${w} min`],
    alightRoute: route => ["Alight ", route],
    resultsFootnote: "Estimates from posted PDFs · verify with Transportation Office (DSN 755-0424)",
    tryTomorrow: "Try tomorrow 09:00",
    changeTime: "Change time",
    endsAt: (name, hm) => [name, ` ends ${hm}`],
    estTitle: "Times based on estimated schedule — not yet matched against a publicly posted PDF",
    everyMin: m => `every ${m} min`,
    waitDisclaimer: "Wait times estimate the next scheduled bus assuming each route starts its cycle at :00 from its first stop. Real PDFs may differ. Verify with Transportation Office (DSN 755-0424) before relying on it.",
    shuttleInfoTitle: "On-post shuttle service hours",
    shuttleGroup: (names, when) => [names, `: ${when}`],
    shuttleInfoTail: "Out-of-service routes are filtered automatically. Confirm: DSN 755-0424.",
    noMatch: "No matching stop or building",
    whereAreYou: "Where are you?",
    asOf: time => `as of ${time}`,
    updatesEveryMinute: "Updates every minute",
    nextDeparturesFrom: stop => `Next departures from ${stop}`,
    goldDisclaimer: "Gold, Brown, Pink, and Purple use PDF-sourced schedules (Green at Bus Terminal only). Other routes estimate next departure assuming a :00 cycle anchor — real timetables may shift the times.",
    noRoutesHere: "No routes serve this stop.",
    pickStopHint: "Pick a stop to see the next bus on every route that serves it. The page auto-refreshes once a minute.",
    outOfService: "Out of service",
    returnsAt: hm => `returns ${hm}`,
    resumeToday: hm => `${hm} today`,
    resumeOn: (dow, hm) => `${dow} ${hm}`,
    nextLabel: "next",
    inMin: m => `in ${m} min`, nowWord: "now",
    routesNote: "Next departure is from each route's first stop. Open a route for its stop list and full schedule.",
    routesFootnote: "Times from posted PDFs where available; others estimated. Verify with the Transportation Office (DSN 755-0424).",
    backToRoutes: "← Routes",
    trial: "Trial",
    stopsHeader: "Stops",
    stopsCount: n => `${n} stops`,
    everyFreq: m => `Every ${m} min`,
    schedDay: "Day", schedHours: "Hours", schedFreq: "Freq",
    routeMetaParts: (freq,n,days) => [`Every ${freq} min`, `${n} stops`, days],
    pdfVerified: "PDF-sourced schedule",
    verifiedScheduleHeader: "PDF-SOURCED SCHEDULE",
    interGarrisonHeader: "Inter-Garrison Routes",
    interGarrisonWarn1: "Inter-garrison buses are ",
    interGarrisonWarnStrong: "not integrated",
    interGarrisonWarn2: " into the trip planner. Priority-based seating, fixed schedules, not connectable as transfers. Verify on the post's public shuttle page (link below).",
    pickupLabel: "Pick-up:",
    schedulesLabel: "Schedules:",
    disclaimer: "Community-built shuttle planner. Not affiliated with, endorsed by, or operated by USAG Humphreys, the U.S. Army, or the Department of Defense. Schedule data transcribed from publicly posted PDFs; verify with the Transportation Office (DSN 755-0424) before relying on it.",
    offpostBanner: "Unofficial planner. Inter-garrison schedules below are transcribed from publicly posted PDFs and may be out of date — always confirm departures before travel.",
    mapaFooterLabel: "Official app:",
    mapaAppStore: "App Store",
    mapaPlayStore: "Google Play",
    scheduleCredit: "Route schedules sourced from publicly posted USAG Humphreys PDFs.",
    feedbackLink: "Report an issue or suggest a fix",
    noticeTitle: "Before you start",
    noticeBody: "This is an unofficial, community-built trip planner. It is not affiliated with, endorsed by, or operated by USAG Humphreys, the U.S. Army, or the Department of Defense. For official garrison information, use MAPA (My Army Post App), the official U.S. Army app — linked at the bottom of every page.",
    noticeAck: "I understand — continue",
    feedbackNudgeQuestion: "Was this trip info right?",
    feedbackNudgeButton: "Give feedback",
    feedbackNudgeDismiss: "Close feedback prompt",
  },
  ko: {
    appTitle: "험프리스 교통 플래너",
    appSubtitle: "사용자 제작 셔틀 플래너 · 평택",
    tabPlan: "계획", tabNow: "지금", tabRoutes: "노선", tabOffpost: "기지 외",
    mainNav: "메인 탭",
    themeLabel: "화면 모드",
    themeLight: "라이트", themeDark: "다크", themeSystem: "시스템",
    themeCycle: (current, next) => `화면 모드: ${current}. 탭하여 ${next}(으)로 변경`,
    switchLang: "영어로 전환",
    pickDate: "날짜 선택", pickHour: "시", pickMinute: "분",
    favorites: "즐겨찾기", recent: "최근 경로",
    planTrip: "경로 계획",
    from: "출발", to: "도착", atStop: "정류장",
    stopPh: l => `${l} — 정류장 또는 건물 번호`,
    saveFav: "★ 저장", saveFavTitle: "출발지를 즐겨찾기에 저장",
    saveFavHeading: "즐겨찾기 저장",
    saveFavPrompt: "즐겨찾기 이름 (예: 집, 직장, 체육관)",
    favNameLabel: "이름",
    actionCancel: "취소", actionSave: "저장", actionOk: "확인",
    noticeHeading: "알림",
    nearestStop: "가까운 정류장",
    nearestLoading: "…",
    usingLocation: "현재 위치를 사용하여 도보 시간 계산",
    locError: msg => `위치를 가져올 수 없습니다: ${msg}`,
    pickFromFirst: "먼저 출발 정류장을 선택한 후 즐겨찾기에 저장하세요.",
    removeFavorite: "즐겨찾기 삭제", removeRecent: "최근 기록 삭제",
    swapStops: "출발/도착 바꾸기",
    expandTrip: "경로 상세 보기", collapseTrip: "경로 상세 숨기기",
    expandRoute: "노선 정류장 보기", collapseRoute: "노선 정류장 숨기기",
    when: "시간",
    leaveNow: "지금 출발", departAt: "출발 시간", arriveBy: "도착 시간",
    today: "오늘", tomorrow: "내일", dow: DOW_KO,
    findRoutes: "노선 찾기 →",
    bldgsMappedTitle: n => `건물 번호 ${n}개 매핑됨`,
    bldgsMappedDesc: " (예: 6400 → Maude Hall, 5700 → PX). 전체 목록은 DPW 6140동에서 제공 예정.",
    noTrips: "이용 가능한 노선 없음",
    noTripsOOS: names => ["현재 시간에 운행하지 않는 노선이 있습니다 (", names, "). 다른 시간을 시도해 보세요."],
    noTripsNoPath: "공유 정류장 또는 1회 환승 경로가 없습니다. 버스 터미널이나 가까운 주요 정류장을 시도해 보세요.",
    noTripsOvernightDirect: names => ["이 시간에 출발하면 ", names, " 노선의 운행이 종료되어 목적지까지 도착할 수 없습니다. 다음 운행일까지 기다리거나 택시, 카카오T, 도보를 이용하세요."],
    noTripsOvernightXfer: names => ["환승 버스(", names, ")가 탑승 전에 운행을 종료합니다. 셔틀로는 시간 내 도착이 불가능하니 택시, 카카오T, 도보를 권장합니다."],
    optionsFound: n => `${n}개 옵션`,
    routesOOS: n => `${n}개 노선 운행 종료`,
    direct: "직행 · 환승 없음", oneTransfer: "환승 1회",
    walkTo: stop => `${stop}까지 도보`, walkDest: "목적지까지 도보",
    walkMin: m => `도보 ~${m}분`,
    boardAt: "탑승", alightAt: "하차", transferHere: "여기서 환승",
    busLegMeta: (w,t,n) => `~${w}분 대기 · ~${t}분 승차 · ${n}개 정류장`,
    xferMeta: (at,dur) => `${at} · ~${dur}분`,
    fastest: "최단", estimated: "추정", estShort: "추정",
    editTrip: "수정",
    otherOptions: n => `다른 옵션 ${n}개`,
    noOptionsFound: "옵션 없음",
    countdownUntil: (route, stop) => [stop, "에서 ", route, " 버스 출발까지"],
    leavingNow: "지금 출발",
    minutes: m => `${m}분`,
    walkToStopMin: (m, stop) => `${stop}까지 도보 ${m}분`,
    walkToDestMin: m => `목적지까지 도보 ${m}분`,
    boardWait: (route, w) => [route, ` 탑승 · 대기 ~${w}분`],
    transferWait: (route, w) => [route, `(으)로 환승 · 대기 ~${w}분`],
    alightRoute: route => [route, " 하차"],
    resultsFootnote: "공개 PDF 기반 추정 · 교통과(DSN 755-0424)에 확인하세요",
    tryTomorrow: "내일 09:00로 검색",
    changeTime: "시간 변경",
    endsAt: (name, hm) => [name, ` ${hm} 종료`],
    estTitle: "추정 시간표 기반 — 공개 PDF와 대조되지 않음",
    everyMin: m => `${m}분 간격`,
    waitDisclaimer: "대기 시간은 각 노선이 첫 정류장에서 :00에 출발한다고 가정한 추정치입니다. 실제 시간표는 다를 수 있습니다. 운행 전 교통과(DSN 755-0424)에 확인하세요.",
    shuttleInfoTitle: "온-포스트 셔틀 운행 시간",
    shuttleGroup: (names, when) => [names, `: ${when}`],
    shuttleInfoTail: "운행 종료된 노선은 자동 제외됩니다. 확인: DSN 755-0424.",
    noMatch: "일치하는 정류장 또는 건물 없음",
    whereAreYou: "어디에 계세요?",
    asOf: time => `${time} 기준`,
    updatesEveryMinute: "1분마다 갱신",
    nextDeparturesFrom: stop => `${stop}에서 다음 출발`,
    goldDisclaimer: "Gold, Brown, Pink, Purple 노선은 PDF에서 옮긴 시간표를 사용합니다 (Green은 Bus Terminal만). 다른 노선은 :00 정시 기준 주기로 다음 출발을 추정하며, 실제 시간표와 다를 수 있습니다.",
    noRoutesHere: "이 정류장을 지나는 노선이 없습니다.",
    pickStopHint: "정류장을 선택하면 해당 정류장의 모든 노선의 다음 버스를 볼 수 있습니다. 1분마다 자동 갱신됩니다.",
    outOfService: "운행 종료",
    returnsAt: hm => `${hm} 재개`,
    resumeToday: hm => `오늘 ${hm}`,
    resumeOn: (dow, hm) => `${dow} ${hm}`,
    nextLabel: "다음",
    inMin: m => `${m}분 후`, nowWord: "지금",
    routesNote: "다음 출발은 각 노선의 첫 정류장 기준입니다. 노선을 열면 정류장 목록과 전체 시간표를 볼 수 있습니다.",
    routesFootnote: "공개 PDF가 있는 노선은 실제 시간, 나머지는 추정입니다. 교통과(DSN 755-0424)에 확인하세요.",
    backToRoutes: "← 노선",
    trial: "시범",
    stopsHeader: "정류장",
    stopsCount: n => `정류장 ${n}개`,
    everyFreq: m => `${m}분 간격`,
    schedDay: "요일", schedHours: "운행 시간", schedFreq: "간격",
    routeMetaParts: (freq,n,days) => [`${freq}분 간격`, `정류장 ${n}개`, days],
    pdfVerified: "PDF 기반 시간표",
    verifiedScheduleHeader: "PDF 기반 시간표",
    interGarrisonHeader: "기지 간 노선",
    interGarrisonWarn1: "기지 간 버스는 노선 검색에 ",
    interGarrisonWarnStrong: "포함되지 않습니다",
    interGarrisonWarn2: ". 우선순위 좌석, 고정 시간표, 환승 불가. 아래 링크의 공개 셔틀 페이지에서 확인하세요.",
    pickupLabel: "탑승 지점:",
    schedulesLabel: "시간표:",
    disclaimer: "사용자 제작 셔틀 플래너입니다. USAG 험프리스, 미 육군 또는 미 국방부와 제휴되어 있거나 승인된 것이 아닙니다. 시간표는 공개된 PDF에서 옮긴 것입니다. 운행 전 교통과(DSN 755-0424)에 확인하세요.",
    offpostBanner: "비공식 플래너입니다. 아래의 기지 간 시간표는 공개 PDF에서 옮긴 것으로 변경되었을 수 있습니다. 이동 전 반드시 출발 시간을 확인하세요.",
    mapaFooterLabel: "공식 앱:",
    mapaAppStore: "App Store",
    mapaPlayStore: "Google Play",
    scheduleCredit: "노선 시간표는 공개된 USAG 험프리스 PDF에서 가져왔습니다.",
    feedbackLink: "오류 신고 또는 수정 제안",
    noticeTitle: "시작하기 전에",
    noticeBody: "이 앱은 비공식 사용자 제작 교통 플래너입니다. USAG 험프리스, 미 육군 또는 미 국방부와 제휴되어 있거나 승인된 것이 아닙니다. 공식 기지 정보는 미 육군 공식 앱 MAPA(My Army Post App)를 이용하세요. 링크는 각 페이지 하단에 있습니다.",
    noticeAck: "확인했습니다 — 계속",
    feedbackNudgeQuestion: "이 여정 정보가 정확했나요?",
    feedbackNudgeButton: "피드백 남기기",
    feedbackNudgeDismiss: "피드백 메시지 닫기",
  },
};
const LangContext = createContext({ lang: "en", t: STRINGS.en });
const useT = () => useContext(LangContext);
// Building-number → nearest-stop directory. Hand-curated entries first
// established the dataset; OSM-sourced entries (via scripts/fetch_osm_buildings.py
// + src/data/buildings_osm.json) added the rest. Only buildings whose OSM
// name unambiguously matches a known bus stop are included here. The full
// 380-building dump lives in src/data/buildings_osm.json for later use once
// stop coordinates exist.
const BUILDINGS = {
  "125":   { name:"Morning Calm Conference Center",            stop:"Morning Calm Center" },
  "400":   { name:"Sentry Village Mini Mall",                  stop:"Sentry Village Mini Mall" },
  "500":   { name:"Sentry Village Burger King",                stop:"Sentry Village Burger King" },
  "501":   { name:"Humphreys Hub",                             stop:"Bus Terminal" },
  "555":   { name:"Jenkins Clinic",                            stop:"MSG Jenkins Medical Clinic" },
  "695":   { name:"Freedom Chapel",                            stop:"Freedom Chapel" },
  "700":   { name:"Barracks (700s Block)",                     stop:"Barracks (700s Block)" },
  "727":   { name:"Morning Calm Post Office",                  stop:"Main Post Office" },
  "859":   { name:"Law Enforcement Center",                    stop:"Law Enforcement Center (DES)" },
  "1291":  { name:"Provider Grill Dining Facility",            stop:"Provider Grill DFAC" },
  "1949":  { name:"Collier Community Fitness Center",          stop:"Collier Fitness Center" },
  "2063":  { name:"Turner Fitness Center",                     stop:"Turner Fitness Center" },
  "2097":  { name:"Talon Café Dining Facility",                stop:"Talon Cafe DFAC" },
  "2270":  { name:"Family Mini Mall Express",                  stop:"Family Mini Mall / Gas Station" },
  "5410":  { name:"Child Development Center",                  stop:"Family Housing Towers (Tropic Lightning Ave)" },
  "5700":  { name:"Main Exchange (PX)",                        stop:"Main Exchange (PX)" },
  "5725":  { name:"Commissary",                                stop:"Commissary" },
  "5730":  { name:"Main Post Office",                          stop:"Main Post Office" },
  "5904":  { name:"River Bend Golf Club House",                stop:"River Bend Golf Course" },
  "6120":  { name:"8A NCO Academy",                            stop:"Law Enforcement Center (DES)" },
  "6140":  { name:"DPW / Corps of Engineers HQ",               stop:"Corps of Engineers" },
  "6321":  { name:"Spartan Dining Facility",                   stop:"Spartan DFAC" },
  "6360":  { name:"Pacific Victors Chapel",                    stop:"Pacific Victors Chapel" },
  "6400":  { name:"LTG Maude Hall / One Stop",                 stop:"LTG Maude Hall (9th St)" },
  "6420":  { name:"Civilian Personnel Center",                 stop:"LTG Maude Hall (9th St)" },
  "6430":  { name:"Community Banking Center",                  stop:"LTG Maude Hall (9th St)" },
  "6702":  { name:"Pittman Dining Facility",                   stop:"Pittman DFAC" },
  "6800":  { name:"Warrior Chapel / Barracks",                 stop:"Barracks (6800s & 6900s Block)" },
  "6809":  { name:"Cowan Post Office",                         stop:"Main Post Office" },
  "6815":  { name:"Sitman Fitness Center",                     stop:"Sitman Fitness Center" },
  "9600":  { name:"Brian D. Allgood Hospital",                 stop:"Brian D. Allgood Hospital" },
  "12600": { name:"US Army Corps of Engineers Far East District", stop:"Corps of Engineers" },
};

const OFFPOST = [
  { id:"AIRPORT", name:"Incheon Airport Shuttle", color:"#5bb8ff",
    freq:"Daily",
    desc:"Runs daily. Priority: PCS → Emergency Leave → TDY → Ordinary Leave → All Others. Limited seating.",
    schedule:"Updated Feb 2026. Download current PDF from the post's public shuttle page.",
    pickup:"Bus Terminal + Brian D. Allgood Hospital" },
  { id:"SEOUL", name:"Seoul / Dragon Hill Lodge", color:"#c47aff",
    freq:"1–2 / day",
    desc:"Inter-garrison service to Yongsan-area installations. 1–2 departures per day.",
    schedule:"Verify current schedule on the post's public shuttle page.",
    pickup:"Bus Terminal + Brian D. Allgood Hospital" },
  { id:"K16", name:"K-16 Seoul Air Base", color:"#4dde88",
    freq:"Varies",
    desc:"Service to Seongnam (Seoul Air Base). Stops at Troop Medical Clinic and Main Gate.",
    schedule:"Verify current schedule on the post's public shuttle page.",
    pickup:"Bus Terminal + Brian D. Allgood Hospital" },
  { id:"DAEGU", name:"USAG Daegu – Camp Carroll", color:"#ff8c3a",
    freq:"Limited",
    desc:"Service to Waegwan / Camp Carroll (Daegu area). Very limited frequency.",
    schedule:"Verify current schedule on the post's public shuttle page.",
    pickup:"Bus Terminal" },
  { id:"OSAN", name:"Osan Air Base", color:"#ff6bb5",
    freq:"Varies",
    desc:"Inter-garrison service to Osan Air Base.",
    schedule:"Verify current schedule on the post's public shuttle page.",
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

const SEARCH_INDEX = [
  ...ALL_STOPS.map(s => ({ label:s, stop:s, sub:"Bus stop" })),
  ...Object.entries(STOP_ALIASES).flatMap(([canonical, aliases]) =>
    aliases.map(a => ({ label:a, stop:canonical, sub:`Also known as ${canonical}` }))
  ),
  ...Object.entries(BUILDINGS).map(([num,b]) => ({
    label:`Bldg ${num} – ${b.name}`, stop:b.stop, sub:`Nearest stop: ${b.stop}`, isBuilding:true, bldg:num
  })),
];

// ─── Schedule presentation helpers ────────────────────────────────────────────
const DOW_ORDER = [1,2,3,4,5,6,0];
const DOW_ABBR  = { 0:"Sun", 1:"Mon", 2:"Tue", 3:"Wed", 4:"Thu", 5:"Fri", 6:"Sat" };

// "Mon–Thu" / "Fri" / "Sat–Sun" for a window's dow list, collapsing runs.
function dowLabel(dows) {
  const sorted = DOW_ORDER.filter(d => dows.includes(d));
  const parts = [];
  let run = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const prevPos = DOW_ORDER.indexOf(run[run.length-1]);
    if (DOW_ORDER.indexOf(sorted[i]) === prevPos + 1) run.push(sorted[i]);
    else { parts.push(run); run = [sorted[i]]; }
  }
  parts.push(run);
  return parts
    .map(r => r.length > 1 ? `${DOW_ABBR[r[0]]}–${DOW_ABBR[r[r.length-1]]}` : DOW_ABBR[r[0]])
    .join(", ");
}

// Times past midnight are stored as >24:00 so the window stays one range.
const winTime = hhmm => {
  const [h, m] = hhmm.split(":").map(Number);
  return `${pad2(h % 24)}:${pad2(m)}`;
};

// Rows for the route-detail schedule table. Routes without windows collapse to
// a single row built from the flat days/hours/freq fields.
function scheduleRows(r) {
  if (!r.schedule) return [{ day: r.days, hours: r.hours, freq: r.freq }];
  return r.schedule.map(w => ({
    day: dowLabel(w.dow),
    hours: `${winTime(w.from)}–${winTime(w.to)}`,
    freq: w.freq || r.freq,
  }));
}

// "Mon 06:00" when the route resumes on a later day, "16:00 today" when it is
// still to come today.
function resumeHint(r, now, t) {
  const start = nextServiceStart(r, now);
  if (!start) return null;
  const hm = fmt(start);
  return start.toDateString() === now.toDateString()
    ? t.resumeToday(hm)
    : t.resumeOn(DOW_ABBR[start.getDay()], hm);
}

// Service-hours note, grouped from ROUTES so it can never drift from the data
// the planner actually filters on. Routes whose `hours` already spells out its
// own day prefixes drop the redundant `days` column.
function shuttleGroups() {
  const groups = new Map();
  for (const r of Object.values(ROUTES)) {
    const when = /[A-Za-z]/.test(r.hours) ? r.hours : `${r.days} ${r.hours}`;
    if (!groups.has(when)) groups.set(when, []);
    groups.get(when).push(r.id);
  }
  return [...groups.entries()].map(([when, ids]) => ({ when, ids }));
}

// The stops a bus leg passes between board and alight, exclusive of both ends.
function intermediateStops(leg) {
  const stops = ROUTES[leg.rid].stops;
  const a = stops.indexOf(leg.from), b = stops.indexOf(leg.to);
  if (a < 0 || b < 0) return [];
  return a < b ? stops.slice(a + 1, b) : stops.slice(b + 1, a).reverse();
}

// ─── Shared class strings ─────────────────────────────────────────────────────
// Handoff specs that recur across the ported surface. Registry components own
// their own look; these only carry the deltas the design calls for.
const INPUT_CLS =
  "h-auto rounded-md bg-card px-3 py-2.5 text-sm text-foreground placeholder:text-faint dark:bg-card " +
  // Registry focus is a 3px ring at 50% of --ring on top of a --ring border,
  // which reads as a double grey halo. The handoff wants one flat scrim ring.
  "focus-visible:ring-0 focus-visible:shadow-[shadow:var(--focus-ring)]";
const SEG_TRACK = "w-full rounded-md bg-muted p-[3px]";
// Segmented items are 24-27px tall by design; the ::after inset lifts the
// touch target to 44px without changing what is drawn. Vertical only, so
// neighbouring segments stay independently tappable.
const HIT44 = "relative after:absolute after:inset-x-0 after:-inset-y-[10px] after:content-['']";
// Half of the header pill: square corners so the two halves meet on the
// divider, full height so the 44px hit area sits symmetrically around it.
const PILL_HALF = HIT44 + " h-full rounded-none px-1.5 text-muted-foreground hover:text-foreground";
const loadWhenPicker = () => import("@/components/trip-when-picker.jsx");
const TripWhenPicker = lazy(loadWhenPicker);

// Matches the real row's geometry so a cold load cannot shift anything.
const WhenPickerSkeleton = () => (
  <div aria-hidden="true" className="mt-2 grid animate-pulse grid-cols-[1fr_auto] gap-2">
    <div className="h-11 rounded-md border border-border bg-card"/>
    <div className="flex items-center gap-1">
      <div className="h-11 w-[62px] rounded-md border border-border bg-card"/>
      <span className="font-mono text-sm text-muted-foreground">:</span>
      <div className="h-11 w-[62px] rounded-md border border-border bg-card"/>
    </div>
  </div>
);
const THEME_NEXT = { light:"dark", dark:"system", system:"light" };
const THEME_ICON = { light:Sun, dark:Moon, system:Monitor };
const SEG_ITEM = HIT44 + " " +
  "h-auto min-w-0 flex-1 shrink rounded-sm px-2 py-1.5 text-xs font-medium text-muted-foreground " +
  "group-data-[spacing=0]/toggle-group:rounded-sm group-data-[spacing=0]/toggle-group:px-2 " +
  "hover:bg-transparent hover:text-foreground " +
  "aria-pressed:bg-seg-active data-[state=on]:bg-seg-active data-[state=on]:font-semibold " +
  "data-[state=on]:text-foreground data-[state=on]:shadow-[shadow:var(--seg-active-shadow)]";
const NOTE_CLS = "rounded-lg bg-muted p-3 text-xs leading-[1.7] text-secondary-text";
const LINK_CLS = "text-link underline underline-offset-2 hover:text-link-hover";
const GHOST_BTN = HIT44 + " " +
  "h-auto rounded-md border-border bg-transparent px-[9px] py-[3px] text-[11px] font-medium " +
  "text-muted-foreground shadow-none hover:text-foreground disabled:cursor-wait dark:bg-transparent";
const CTA_BTN = "h-auto w-full rounded-md py-[11px] text-sm font-semibold disabled:opacity-45";
const CARD_CLS = "border bg-card shadow-[shadow:var(--card-shadow)] ring-0 [--card-spacing:--spacing(4)]";
const DROPDOWN_CLS =
  "fixed z-50 max-h-[40vh] overflow-y-auto rounded-[10px] border bg-card " +
  "shadow-[shadow:var(--dd-shadow)]";
const FOOTNOTE_CLS = "text-center text-[11px] leading-[1.7] text-muted-foreground";
const NOTRIPS_BTN =
  "h-11 flex-1 rounded-md border-border bg-card px-2.5 text-[13px] font-semibold text-foreground " +
  "whitespace-nowrap shadow-[shadow:var(--card-shadow)] dark:bg-card";
const SUMMARY_BTN =
  "h-11 shrink-0 rounded-md border-border bg-card px-4 text-[13px] font-semibold text-foreground " +
  "shadow-[shadow:var(--card-shadow)] dark:bg-card";

// ─── Searchable Input ─────────────────────────────────────────────────────────
// `quickPicks` are the shortcuts shown when the field is focused but empty:
// [{ key, label, Icon, items: [{ id, content, onPick, onRemove, removeLabel }] }].
// Typing anything switches back to the filtered stop search. Only the From
// field passes them — a recent trip is a From-side concept.
function StopInput({ label, value, onChange, dot = null, quickPicks = [] }) {
  const { t } = useT();
  const [q, setQ] = useState(value||"");
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const ref = useRef(null);
  const listRef = useRef(null);
  // Anchor rect for the portalled list. Null until the first measure, which
  // also keeps this render-safe on the server.
  const [rect, setRect] = useState(null);

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

  // Flat nav list: either the quick picks or the filtered stops, never both.
  const quickItems = useMemo(
    () => q.trim() ? [] : quickPicks.flatMap(sec => sec.items),
    [q, quickPicks]);
  const showQuick = quickItems.length > 0;
  const navItems = showQuick ? quickItems : filtered;

  // Keep the highlighted row visible by nudging the list's own scrollTop.
  // scrollIntoView would also scroll the page behind the dropdown. Rows are
  // addressed by data-i because section headers share the same parent.
  useEffect(()=>{
    const list = listRef.current;
    if (!open || !list) return;
    const el = list.querySelector(`[data-i="${hi}"]`);
    if (!el) return;
    const top = el.offsetTop, bottom = top + el.offsetHeight;
    if (top < list.scrollTop) list.scrollTop = top;
    else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight;
  },[hi,open]);

  // The list lives on <body>, so "outside" has to exclude it explicitly.
  useEffect(()=>{
    const h=e=>{
      if (ref.current?.contains(e.target) || listRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown",h);
    return()=>document.removeEventListener("mousedown",h);
  },[]);

  // Track the input's viewport rect while the list is open. `true` on the
  // scroll listener catches scrolling ancestors, not just the window.
  useEffect(()=>{
    if (!open) return;
    const measure = () => { if (ref.current) setRect(ref.current.getBoundingClientRect()); };
    measure();
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  },[open]);
  const pick=item=>{ setQ(item.label); setOpen(false); onChange(item.stop,item.label,item.bldg||null); };
  const runAt=i=>{ if (showQuick) { setOpen(false); quickItems[i]?.onPick(); } else { pick(filtered[i]); } };
  const onKey=e=>{
    if (!open || !navItems.length) {
      if (e.key === "Escape") setOpen(false);
      return;
    }
    if (e.key === "ArrowDown") { e.preventDefault(); setHi(i => (i+1) % navItems.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHi(i => (i-1+navItems.length) % navItems.length); }
    else if (e.key === "Enter") { e.preventDefault(); runAt(hi); }
    else if (e.key === "Escape") { e.preventDefault(); setOpen(false); }
  };
  return (
    <div ref={ref} className="relative">
      {dot}
      <Input className={cn(INPUT_CLS, dot && "pl-7")} aria-label={label} placeholder={t.stopPh(label)} value={q}
        onChange={e=>{setQ(e.target.value);setHi(0);setOpen(true);if(!e.target.value)onChange("","",null);}}
        onFocus={()=>setOpen(true)} onKeyDown={onKey} />
      {open && rect && (showQuick || filtered.length>0 || q.trim()) && createPortal(
        <div ref={listRef} role="listbox" aria-label={label} className={DROPDOWN_CLS}
          style={{ top: rect.bottom + 4, left: rect.left, width: rect.width }}>
          {showQuick
            ? (() => { let n = -1; return quickPicks.filter(sec=>sec.items.length).map(sec=>(
                <div key={sec.key} role="group" aria-label={sec.label}>
                  <div className="flex items-center gap-1.5 px-3.5 pt-2.5 pb-1 text-[11.5px] font-semibold text-muted-foreground">
                    <sec.Icon className="size-3.5" aria-hidden="true"/>{sec.label}
                  </div>
                  {sec.items.map(item=>{ const i = ++n; return (
                    <div key={item.id} data-i={i} className={cn("flex items-center border-b last:border-b-0", i===hi && "bg-muted")}>
                      <button type="button" role="option" aria-selected={i===hi}
                        onMouseDown={()=>runAt(i)} onMouseEnter={()=>setHi(i)}
                        className="min-w-0 flex-1 truncate px-3.5 py-2.5 text-left text-[13px] text-foreground outline-none">
                        {item.content}
                      </button>
                      {item.onRemove && (
                        <button type="button" aria-label={item.removeLabel}
                          onMouseDown={e=>{ e.preventDefault(); e.stopPropagation(); item.onRemove(); }}
                          className="flex size-11 shrink-0 items-center justify-center text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:text-foreground">
                          ×
                        </button>
                      )}
                    </div>
                  ); })}
                </div>
              )); })()
            : filtered.length>0
              ? filtered.map((x,i)=>(
                  <div key={i} data-i={i} role="option" aria-selected={i===hi}
                    onMouseDown={()=>pick(x)} onMouseEnter={()=>setHi(i)}
                    className={cn("cursor-pointer border-b px-3.5 py-2.5 last:border-b-0", i===hi && "bg-muted")}>
                    <div className={cn("text-[13px] text-foreground", i===hi ? "font-semibold" : "font-medium")}>{x.label}</div>
                    <div className="mt-px text-[11.5px] text-muted-foreground">{x.sub}</div>
                  </div>
                ))
              : <div className="px-3.5 py-2.5 text-[12.5px] text-muted-foreground">{t.noMatch}</div>}
        </div>,
        document.body
      )}
    </div>
  );
}

// ─── Route chrome ─────────────────────────────────────────────────────────────
function RouteBadge({ rid, className }) {
  const c = ROUTE_BADGE[rid];
  return (
    <Badge className={cn("h-5 rounded-full px-[9px] text-[10.5px] font-bold tracking-[0.02em]", className)}
      style={{ background:c.bg, color:c.fg }}>
      {shortName(rid).toUpperCase()}
    </Badge>
  );
}

// Neutral, not gold: the palette refresh retired saffron as a trust marker.
const PDF_BADGE_CLS =
  "h-5 gap-1 rounded-md border-border-strong px-2 text-[10.5px] font-semibold text-secondary-text";

function PdfBadge({ className, short }) {
  const { t } = useT();
  return (
    <Badge variant="outline" className={cn(PDF_BADGE_CLS, className)}>
      <FileText className="size-3 shrink-0" aria-hidden="true"/>
      {short ? t.pdfVerified.replace(" schedule", "") : t.pdfVerified}
    </Badge>
  );
}

const MetaTokens = ({ parts }) => parts.map((x,i)=>(
  <span key={i}>{i>0 && " · "}<span className="whitespace-nowrap">{x}</span></span>
));

// A route name in prose, tagged with its colour. The dot is the only carrier —
// the text keeps the surrounding colour and size so contrast never depends on
// the route palette. On dark, a hairline ring keeps Black and Brown visible.
const RouteName = ({ id, full, className }) => (
  <span className={cn("inline-flex items-baseline gap-1 whitespace-nowrap", className)}>
    <span aria-hidden="true"
      className="inline-block size-1.5 shrink-0 -translate-y-px rounded-full dark:ring-1 dark:ring-white/15"
      style={{ background: ROUTES[id].color }}/>
    {full ? ROUTES[id].name : shortName(id)}
  </span>
);

// Renders a string/node part list from STRINGS without keying at every callsite.
const Parts = ({ of }) => of.map((x,i)=><Fragment key={i}>{x}</Fragment>);

const RouteNameList = ({ ids, full, sep = ", " }) => ids.map((id,i)=>(
  <Fragment key={id}>{i>0 && sep}<RouteName id={id} full={full}/></Fragment>
));

const idsFromNames = names => names
  .map(n => Object.values(ROUTES).find(r => r.name === n)?.id)
  .filter(Boolean);

// The hairline ring is what keeps Black (2.19:1 on the dark card) and Brown
// (2.85:1) from disappearing; RouteName's dot carries the same treatment.
const RouteDot = ({ rid, size = 12, className }) => (
  <span aria-hidden="true" className={cn("shrink-0 rounded-full dark:ring-1 dark:ring-white/15", className)}
    style={{ width:size, height:size, background:ROUTES[rid].color }}/>
);

// ─── Trip timeline ────────────────────────────────────────────────────────────
// One row per stop the rider actually experiences: the walk to the stop, the
// boarding, every stop rolled through, the transfer, the alighting, the walk
// off. The rail on the left is drawn per row from the colour of the leg it
// belongs to, so a transfer reads as one node with two coloured dots.
function timelineRows(trip, t) {
  const rows = [];
  const buses = trip.legs.filter(l => l.k === "bus");
  for (const l of trip.legs) {
    if (l.k === "xfer") continue;                      // folded into the node below
    if (l.k === "walk") {
      rows.push(l.dest
        ? { kind:"walk", label:t.walkToStopMin(l.dur, l.dest), time:fmt(l.startAt) }
        : { kind:"walk", label:t.walkToDestMin(l.dur), time:fmt(l.endAt), last:true });
      continue;
    }
    const i = buses.indexOf(l);
    if (i === 0) {
      rows.push({ kind:"stop", rid:l.rid, stop:l.from, big:true,
                  sub:t.boardWait(<RouteName id={l.rid}/>, l.w), time:fmt(l.boardAt) });
    }
    for (const stop of intermediateStops(l)) rows.push({ kind:"stop", rid:l.rid, stop });
    const nxt = buses[i + 1];
    if (nxt) {
      rows.push({ kind:"stop", rid:l.rid, rid2:nxt.rid, stop:l.to, big:true,
                  sub:t.transferWait(<RouteName id={nxt.rid}/>, nxt.w),
                  time:`${fmt(l.alightAt)} → ${fmt(nxt.boardAt)}`, splitTime:true });
    } else {
      rows.push({ kind:"stop", rid:l.rid, stop:l.to, big:true,
                  sub:t.alightRoute(<RouteName id={l.rid}/>), time:fmt(l.alightAt) });
    }
  }
  return rows;
}

function TimelineRow({ row, prev, next }) {
  const walk = row.kind === "walk";
  const color = walk ? null : ROUTES[row.rid].color;
  const topDashed = walk || (prev && prev.kind === "walk");
  const botDashed = walk || (next && next.kind === "walk");
  const topColor = prev ? (topDashed ? null : color) : null;
  const botColor = next ? (botDashed ? null : (row.rid2 ? ROUTES[row.rid2].color : color)) : null;
  const dash = "w-0.5 flex-shrink-0 border-l-2 border-dashed border-border-strong";

  return (
    <div className="flex items-stretch gap-3">
      <div className="flex w-3.5 shrink-0 flex-col items-center">
        {prev
          ? (topDashed ? <span className={cn(dash,"h-1.5")}/>
                       : <span className="h-1.5 w-0.5 shrink-0" style={{background:topColor}}/>)
          : <span className="h-0 w-0.5 shrink-0"/>}
        {walk
          ? <span className="size-2 shrink-0 rounded-full border-2 border-border-strong bg-card"/>
          : row.big
            ? <span className="size-3 shrink-0 rounded-full" style={{background:color}}/>
            : <span className="size-2 shrink-0 rounded-full border-2 bg-card" style={{borderColor:color}}/>}
        {row.rid2 && <>
          <span className="h-1.5 w-0.5 shrink-0"/>
          <span className="size-3 shrink-0 rounded-full" style={{background:ROUTES[row.rid2].color}}/>
        </>}
        {next
          ? (botDashed ? <span className={cn(dash,"min-h-1.5 flex-1")}/>
                       : <span className="w-0.5 min-h-1.5 flex-1" style={{background:botColor}}/>)
          : null}
      </div>
      <div className={cn("flex min-w-0 flex-1 items-start gap-2.5", next ? (row.big||walk ? "pb-3" : "pb-2.5") : "pb-0")}>
        {walk ? (
          <div className="min-w-0 flex-1 text-xs leading-4 text-muted-foreground">{row.label}</div>
        ) : row.big ? (
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <div className="text-[14.5px] leading-5 font-semibold text-foreground">{row.stop}</div>
            <div className="text-[11.5px] leading-4 text-muted-foreground"><Parts of={row.sub}/></div>
          </div>
        ) : (
          <div className="min-w-0 flex-1 text-[12.5px] leading-[17px] text-secondary-text">{row.stop}</div>
        )}
        {row.time && (
          <div className={cn("shrink-0 font-mono font-semibold",
            walk ? "text-[13px] leading-4 text-secondary-text"
                 : row.splitTime ? "text-sm leading-5 text-foreground"
                                 : "text-[17px] leading-5 tracking-[-0.01em] text-foreground")}>
            {row.time}
          </div>
        )}
      </div>
    </div>
  );
}

function TripTimeline({ trip }) {
  const { t } = useT();
  const rows = timelineRows(trip, t);
  return (
    <div className="flex flex-col">
      {rows.map((row,i)=>(
        <TimelineRow key={i} row={row} prev={rows[i-1]} next={rows[i+1]}/>
      ))}
    </div>
  );
}

// A trip is only "PDF-sourced" when every leg boards at a stop the PDF covered.
const tripAllPdf = trip => trip.legs
  .filter(l => l.k === "bus")
  .every(l => departureSource(ROUTES[l.rid], l.from) === "pdf");

function TripBadges({ trip }) {
  const { t } = useT();
  return tripAllPdf(trip)
    ? <PdfBadge/>
    : <Badge variant="outline" className="h-5 rounded-md border-border px-2 text-[10.5px] font-semibold text-muted-foreground">{t.estimated}</Badge>;
}

function FastestTrip({ trip, now }) {
  const { t } = useT();
  const buses = trip.legs.filter(l => l.k === "bus");
  const first = buses[0];
  const mins = Math.round((first.boardAt - now) / 60000);
  return (
    <Card className="border border-border-strong bg-card shadow-[shadow:var(--card-shadow-strong)] ring-0 [--card-spacing:--spacing(4)]">
      <CardContent className="gap-0">
        <div className="flex items-center gap-2 pb-3">
          <Badge className="h-5 rounded-full bg-primary px-2 text-[10.5px] font-bold tracking-[0.02em] text-primary-foreground">{t.fastest}</Badge>
          <TripBadges trip={trip}/>
        </div>
        <div className="font-mono text-[34px] leading-9 font-semibold tracking-[-0.02em] text-foreground">
          {mins > 0 ? t.minutes(mins) : t.leavingNow}
        </div>
        <div className="pt-0.5 text-[12.5px] leading-[17px] text-secondary-text">
          <Parts of={t.countdownUntil(<RouteName id={first.rid}/>, first.from)}/>
        </div>
        <div className="pt-3 font-mono text-[28px] leading-8 font-semibold tracking-[-0.02em] text-foreground">
          {fmt(trip.departAt)} <span className="font-medium text-muted-foreground">→</span> {fmt(trip.arriveAt)}
        </div>
        <div className="flex flex-wrap items-center gap-2 pt-2">
          {buses.map((l,i)=>(
            <span key={i} className="contents">
              <RouteBadge rid={l.rid}/>
              {i < buses.length-1 && <span className="text-xs text-muted-foreground">→</span>}
            </span>
          ))}
          <span className="text-xs leading-5 text-muted-foreground">
            · {trip.type==="direct" ? t.direct : t.oneTransfer} · ~{t.minutes(trip.total)}
          </span>
        </div>
        <Separator className="mt-3.5"/>
        <div className="pt-3"><TripTimeline trip={trip}/></div>
      </CardContent>
    </Card>
  );
}

function OtherTrips({ trips }) {
  const { t } = useT();
  const [open, setOpen] = useState(null);
  return (
    <div className="flex flex-col gap-2">
      <div className="text-[12.5px] leading-[17px] font-semibold text-foreground">{t.otherOptions(trips.length)}</div>
      <Card className="gap-0 border bg-card py-0 shadow-[shadow:var(--card-shadow)] ring-0">
        {trips.map((trip,i)=>{
          const buses = trip.legs.filter(l => l.k === "bus");
          const isOpen = open === trip.id;
          return (
            <div key={trip.id} className={cn(i>0 && "border-t")}>
              {/* Two lines, so nothing but the names can ever truncate: the old
                  single row put six nowrap spans side by side and the card's
                  overflow-hidden ate the chevron at 375px. */}
              <button type="button" aria-expanded={isOpen}
                onClick={()=>setOpen(o => o===trip.id ? null : trip.id)}
                className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left outline-none focus-visible:bg-muted">
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex min-w-0 items-center gap-1.5">
                    {buses.map(l=><RouteDot key={l.rid} rid={l.rid} size={10}/>)}
                    <span className="truncate text-sm font-semibold text-foreground">
                      {buses.map(l=>shortName(l.rid)).join(" → ")}
                    </span>
                  </span>
                  <span className="text-[11.5px] leading-4 text-muted-foreground">
                    {trip.type==="direct" ? t.direct.split(" ·")[0] : t.oneTransfer} · ~{t.minutes(trip.total)}
                  </span>
                </span>
                <span className="shrink-0 font-mono text-[17px] leading-5 font-semibold tracking-tight whitespace-nowrap text-foreground">
                  {fmt(trip.departAt)} → {fmt(trip.arriveAt)}
                </span>
                <ChevronDown aria-hidden="true" className={cn("size-4 shrink-0 text-faint transition-transform", isOpen && "rotate-180")}/>
              </button>
              {isOpen && (
                <div className="border-t px-4 pt-3 pb-4">
                  <div className="flex items-center gap-2 pb-3"><TripBadges trip={trip}/></div>
                  <TripTimeline trip={trip}/>
                </div>
              )}
            </div>
          );
        })}
      </Card>
    </div>
  );
}

// ─── No trips ─────────────────────────────────────────────────────────────────
function NoTrips({ body, endTimes, onTryTomorrow, onChangeTime }) {
  const { t } = useT();
  return (
    <Card className="border bg-card shadow-[shadow:var(--card-shadow)] ring-0 [--card-spacing:--spacing(7)]">
      <CardContent className="items-center gap-0 text-center">
        <div className="flex size-10 items-center justify-center rounded-full bg-muted">
          <ClockAlert aria-hidden="true" className="size-5 text-muted-foreground"/>
        </div>
        <div className="pt-3 text-[17px] leading-[21px] font-semibold text-foreground">{t.noTrips}</div>
        <div className="pt-2 text-[13px] leading-[1.6] text-muted-foreground"><Parts of={body}/></div>
        {endTimes && (
          <div className="flex flex-wrap justify-center gap-x-2 pt-2.5 text-[12.5px] leading-[18px] font-medium text-secondary-text">
            {endTimes.map(([id,hm],i)=>(
              <span key={id}>{i>0 && <span className="pr-2 text-muted-foreground">·</span>}
                <Parts of={t.endsAt(<RouteName id={id}/>, hm)}/>
              </span>
            ))}
          </div>
        )}
        <div className="flex w-full gap-2 pt-4">
          <Button variant="outline" onClick={onTryTomorrow} className={NOTRIPS_BTN}>{t.tryTomorrow}</Button>
          <Button variant="outline" onClick={onChangeTime} className={NOTRIPS_BTN}>{t.changeTime}</Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Now Tab ──────────────────────────────────────────────────────────────────
// PDF-sourced stops show exact clock times. Everything else — including verified
// routes at stops the PDF never covered — falls back to the :00-anchor
// heuristic and is shown as an estimate.
function nextDepartureInfo(rid, stop, now) {
  const R = ROUTES[rid];
  if (!inService(R, now)) return { kind: "oos", route: R };
  const next = nextDeparture(R, stop, now);
  if (!next) return { kind: "oos", route: R };
  const mins = Math.max(0, Math.round((next.time - now) / 60000));
  return { kind: next.source === "pdf" ? "exact" : "approx", route: R, at: next.time, mins };
}

function NextDepartureRow({ rid, stop, now, last }) {
  const { t } = useT();
  const info = nextDepartureInfo(rid, stop, now);
  const R = info.route;

  if (info.kind === "oos") {
    const hint = resumeHint(R, now, t);
    return (
      <div className={cn("flex min-h-11 items-center gap-2.5 px-4 py-3.5", !last && "border-b")}>
        <RouteDot rid={rid} size={10}/>
        <span className="text-xs leading-4 text-muted-foreground">
          <span className="text-secondary-text">{R.name}</span> · {t.outOfService}
          {hint && ` · ${t.returnsAt(hint)}`}
        </span>
      </div>
    );
  }
  const approx = info.kind === "approx";
  return (
    <div className={cn("flex min-h-14 flex-col gap-1 px-4 py-3.5", !last && "border-b")}>
      <div className="flex items-center gap-2.5">
        <RouteBadge rid={rid} className="w-[74px]"/>
        <span className="font-mono text-[22px] leading-[26px] font-semibold tracking-[-0.01em] text-foreground">
          {approx && "~"}{fmt(info.at)}
        </span>
        {approx && <span className="shrink-0 text-[11px] leading-5 text-muted-foreground">{t.estShort}</span>}
        <span className="flex-1"/>
        <span className="text-[15px] leading-[26px] font-semibold whitespace-nowrap text-foreground">
          {info.mins === 0 ? t.nowWord : t.inMin(info.mins)}
        </span>
      </div>
      <div className="text-[11.5px] leading-4 text-muted-foreground">
        {R.name} · {t.everyMin(freqAt(R, now))}
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
    <div className="flex flex-col gap-3.5 px-5 pt-4 pb-8">
      <Card className={CARD_CLS}>
        <CardContent className="gap-2.5">
          <div className="text-[13px] leading-[17px] font-semibold text-foreground">{t.whereAreYou}</div>
          <StopInput label={t.atStop} value={stopLbl} onChange={(s,l)=>{setStop(s);setStopLbl(l);}}/>
          <div className="text-[11.5px] leading-4 text-muted-foreground">{t.updatesEveryMinute}</div>
        </CardContent>
      </Card>

      {stop && routesAtStop.length > 0 && (
        <>
          <Card className={cn(CARD_CLS,"gap-0 py-0")}>
            <div className="flex items-start justify-between gap-2.5 border-b px-4 py-3">
              <div className="min-w-0 text-[13px] leading-[17px] font-semibold text-foreground">
                {t.nextDeparturesFrom(stop)}
              </div>
              <span className="inline-flex h-[22px] shrink-0 items-center rounded-full bg-muted px-2.5 font-mono text-[11.5px] font-medium text-secondary-text">
                {t.asOf(fmt(now))}
              </span>
            </div>
            {routesAtStop.map((rid,i) => (
              <NextDepartureRow key={rid} rid={rid} stop={stop} now={now} last={i===routesAtStop.length-1}/>
            ))}
          </Card>
          <div className={FOOTNOTE_CLS}>{t.goldDisclaimer}</div>
        </>
      )}

      {stop && routesAtStop.length === 0 && (
        <Card className={CARD_CLS}>
          <CardContent className="text-center text-[13px] text-muted-foreground">{t.noRoutesHere}</CardContent>
        </Card>
      )}

      {!stop && <div className={NOTE_CLS}>{t.pickStopHint}</div>}
    </div>
  );
}

// ─── Routes ───────────────────────────────────────────────────────────────────
function RouteRow({ route:r, now, last, onOpen }) {
  const { t } = useT();
  const live = inService(r, now);
  const next = live ? nextDeparture(r, r.stops[0], now) : null;
  return (
    <button type="button" onClick={onOpen}
      className={cn("flex min-h-14 w-full items-center gap-3 px-4 py-3.5 text-left outline-none focus-visible:bg-muted", !last && "border-b")}>
      <RouteDot rid={r.id} size={12} className="mt-1 self-start"/>
      <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={cn("text-sm leading-5 font-semibold", live ? "text-foreground" : "text-secondary-text")}>{r.name}</span>
          {r.id === "PINK" && (
            <Badge variant="outline" className="h-auto rounded-md border-border-strong px-1.5 py-px text-[10.5px] leading-[14px] font-semibold text-secondary-text">{t.trial}</Badge>
          )}
        </div>
        <div className="text-[11.5px] leading-4 text-muted-foreground">
          <MetaTokens parts={t.routeMetaParts(freqAt(r, now), r.stops.length, r.days)}/>
          {r.verified && <PdfBadge short className="ml-1.5 h-auto px-1.5 py-px leading-[14px]"/>}
        </div>
        <div className="text-[11.5px] leading-4 text-muted-foreground">
          <MetaTokens parts={r.hours.split(" · ")}/>
        </div>
      </div>
      <div className="flex min-w-[84px] shrink-0 flex-col items-end gap-px text-right">
        {next ? <>
          <span className="font-mono text-[17px] leading-[22px] font-semibold whitespace-nowrap text-foreground">
            {next.source === "pdf" ? "" : "~"}{fmt(next.time)}
          </span>
          <span className="text-[11px] leading-[15px] whitespace-nowrap text-muted-foreground">
            {next.source === "pdf" ? t.nextLabel : `${t.nextLabel} · ${t.estShort}`}
          </span>
        </> : <>
          <span className="text-xs leading-4 font-medium whitespace-nowrap text-muted-foreground">{t.outOfService}</span>
          <span className="text-[11px] leading-[15px] whitespace-nowrap text-muted-foreground">{resumeHint(r, now, t)}</span>
        </>}
      </div>
      <ChevronDown aria-hidden="true" className="size-4 shrink-0 -rotate-90 text-faint"/>
    </button>
  );
}

function RouteDetail({ route:r, onBack }) {
  const { t } = useT();
  const rows = scheduleRows(r);
  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-col gap-2">
        <button type="button" onClick={onBack}
          className="inline-flex h-11 -ml-1 items-center self-start px-1 text-xs font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:text-foreground">
          {t.backToRoutes}
        </button>
        <div className="flex flex-col gap-1.5">
          <div className="flex min-w-0 flex-wrap items-center gap-2.5">
            <RouteDot rid={r.id} size={14}/>
            <span className="text-[17px] leading-[22px] font-semibold text-foreground">{r.name}</span>
            {r.verified && <PdfBadge/>}
          </div>
          <div className="text-xs leading-4 text-muted-foreground">
            <MetaTokens parts={t.routeMetaParts(r.freq, r.stops.length, r.days)}/>
          </div>
        </div>
      </div>

      <Card className={cn(CARD_CLS,"gap-0 py-0")}>
        <div className="px-4 pt-3 pb-2.5 text-[11px] leading-[15px] font-semibold tracking-[0.5px] text-foreground">
          {t.verifiedScheduleHeader}
        </div>
        <div className="grid grid-cols-[72px_1fr_58px] gap-2 px-4 pb-2 text-[11px] leading-[15px] text-muted-foreground">
          <span>{t.schedDay}</span><span>{t.schedHours}</span><span className="text-right">{t.schedFreq}</span>
        </div>
        <Separator/>
        {rows.map((row,i)=>(
          <div key={i} className={cn("grid grid-cols-[72px_1fr_58px] gap-2 px-4 py-2.5 font-mono text-[12.5px] leading-[17px]", i<rows.length-1 && "border-b")}>
            <span className="font-semibold text-foreground">{row.day}</span>
            <span className="font-medium text-body">{row.hours}</span>
            <span className="text-right font-medium text-secondary-text">{t.minutes(row.freq)}</span>
          </div>
        ))}
        {r.note && <div className="border-t px-4 py-3 text-xs leading-[1.6] text-secondary-text">{r.note}</div>}
      </Card>

      <Card className={cn(CARD_CLS,"gap-0 py-0")}>
        <div className="flex items-center justify-between gap-2.5 border-b px-4 py-3">
          <span className="text-[13px] leading-[17px] font-semibold text-foreground">{t.stopsHeader}</span>
          <span className="font-mono text-xs leading-[17px] font-medium text-muted-foreground">{t.stopsCount(r.stops.length)}</span>
        </div>
        <div className="flex flex-col px-4 py-3.5">
          {r.stops.map((stop,i)=>{
            const first = i===0, last = i===r.stops.length-1, end = first || last;
            const others = (STOP_ROUTES[stop]||[]).filter(x=>x!==r.id);
            return (
              <div key={stop} className="flex items-stretch gap-3">
                <div className="flex w-3.5 shrink-0 flex-col items-center">
                  {first ? <span className="h-0 w-0.5 shrink-0"/>
                         : <span className="h-1.5 w-0.5 shrink-0 opacity-45" style={{background:r.color}}/>}
                  {end
                    ? <span className="size-[11px] shrink-0 rounded-full" style={{background:r.color}}/>
                    : <span className="size-[9px] shrink-0 rounded-full border-2 bg-card" style={{borderColor:r.color}}/>}
                  {!last && <span className="w-0.5 min-h-2 flex-1 opacity-45" style={{background:r.color}}/>}
                </div>
                <div className={cn("min-w-0 flex-1 text-[13.5px] leading-[18px]", last ? "pb-0" : "pb-3.5",
                  end ? "font-semibold text-foreground" : "text-body")}>
                  {stop}
                  {others.map(x=>(
                    <span key={x} className="text-[11px] text-muted-foreground"> · <RouteName id={x}/></span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </Card>
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
    <div className="flex flex-col gap-3.5 px-5 pt-4 pb-8">
      <div role="note" className="rounded-lg border border-warn-border bg-warn-bg p-3 text-xs leading-[1.7] text-warn-text">
        {t.offpostBanner}
      </div>
      <div className="flex flex-col gap-2.5">
        <div className="text-[13px] leading-[17px] font-semibold text-foreground">{t.interGarrisonHeader}</div>
        <div className={NOTE_CLS}>
          {t.interGarrisonWarn1}<strong className="font-semibold text-foreground">{t.interGarrisonWarnStrong}</strong>{t.interGarrisonWarn2}
        </div>
      </div>
      <Card className={cn(CARD_CLS,"gap-0 py-0")}>
        {OFFPOST.map((r,i)=>(
          <div key={r.id} className={cn("flex flex-col gap-1.5 px-4 py-3.5", i<OFFPOST.length-1 && "border-b")}>
            <div className="flex min-w-0 items-center gap-2">
              <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full" style={{background:r.color}}/>
              <span className="min-w-0 flex-1 truncate text-sm leading-5 font-semibold text-foreground">{r.name}</span>
              <span className="shrink-0 font-mono text-xs leading-5 font-medium text-secondary-text">{r.freq}</span>
            </div>
            <div className="flex flex-col gap-1 pl-[18px]">
              <div className="text-xs leading-[1.6] text-secondary-text">{r.desc}</div>
              <div className="text-[11.5px] leading-4 text-muted-foreground">{t.pickupLabel} {r.pickup}</div>
              <div className="text-[11.5px] leading-4 text-muted-foreground">{r.schedule}</div>
            </div>
          </div>
        ))}
      </Card>
      <div className="flex min-h-11 items-center justify-center text-center text-xs leading-[1.6] text-muted-foreground">
        <span>{t.schedulesLabel}{" "}
          <a className={LINK_CLS} href="https://home.army.mil/humphreys/my-usag-humphreys/inter-garrison-bus-service"
             target="_blank" rel="noopener noreferrer">
            home.army.mil/humphreys → Inter-Garrison Bus Service
          </a>
        </span>
      </div>
    </div>
  );
}

// ─── First-run notice ─────────────────────────────────────────────────────────
// One-time non-affiliation notice. Dismissal persisted in localStorage so it
// shows once per device. Points to MAPA rather than away from it; the store
// links live in the footer, not here, so a misclick cannot leave the app.
function FirstRunNotice({ onAck }) {
  const en = STRINGS.en, ko = STRINGS.ko;
  return (
    // Deliberately not dismissible by Esc or overlay click: the non-affiliation
    // notice is an acknowledgement, so only the button may close it.
    <Dialog open onOpenChange={()=>{}}>
      <DialogContent showCloseButton={false}
        className="max-w-[420px] gap-0 rounded-[14px] border bg-card p-[22px_20px] ring-0 shadow-[shadow:var(--dd-shadow)]">
        <DialogTitle className="text-[17px] leading-[21px] font-semibold text-foreground">{en.noticeTitle}</DialogTitle>
        <div lang="ko" className="pt-1 text-sm leading-[18px] font-semibold text-secondary-text">{ko.noticeTitle}</div>
        <DialogDescription className="pt-3 text-[13px] leading-[1.7] text-secondary-text">{en.noticeBody}</DialogDescription>
        <Separator className="mt-3"/>
        <div lang="ko" className="pt-3 text-[12.5px] leading-[1.7] text-muted-foreground">{ko.noticeBody}</div>
        <div className="pt-4">
          <Button className={cn(CTA_BTN,"whitespace-normal text-center leading-snug")} onClick={onAck}>
            {en.noticeAck} / <span lang="ko">{ko.noticeAck}</span>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function App() {
  const [fStop,setFS]=useState(""), [tStop,setTS]=useState("");
  const [fLbl,setFL]=useState(""),  [tLbl,setTL]=useState("");
  // Building numbers if the user picked a "Bldg N – Name" entry — used to
  // compute a real haversine walk leg in findTrips.
  const [fBldg,setFB]=useState(null), [tBldg,setTB]=useState(null);
  // User lat/lon when the "Nearest" button has fetched geolocation.
  // Overrides building coords for the origin walk leg.
  const [fCoords,setFC]=useState(null);
  const [locBusy,setLocBusy]=useState(false);
  const [results,setRes]=useState(null), [searched,setSrch]=useState(false);
  // Results collapse the form into a summary card; "Edit" brings it back with
  // every value intact rather than resetting the search.
  const [editing,setEditing]=useState(false);
  const [tab,setTab]=useState("plan");
  // Which route's detail is open on the Routes tab; null = the list.
  const [openRoute,setOpenRoute]=useState(null);
  // Drives the fastest-trip countdown and the Routes-tab departure column.
  const [now,setNow]=useState(()=>new Date());
  useEffect(()=>{ const id=setInterval(()=>setNow(new Date()),60000); return ()=>clearInterval(id); },[]);
  const whenRef=useRef(null);
  // Replaces window.prompt / window.alert, which a standalone PWA blocks.
  const [favOpen,setFavOpen]=useState(false);
  const [favName,setFavName]=useState("");
  const [notice,setNotice]=useState(null);

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

  // Colour scheme. "system" follows prefers-color-scheme. The resolved value is
  // published as the `dark` class on <html>; every token swap hangs off that.
  const [theme, setTheme] = useLocalStorage("humphreys.theme", "system");
  const resolved = useResolvedTheme(theme);
  useEffect(() => {
    const dark = resolved === "dark";
    document.documentElement.classList.toggle("dark", dark);
    document.querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", dark ? "#0c0b0a" : "#faf9f7");
  }, [resolved]);
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);

  // Warm the date/time chunk once the page is idle. Tapping "Depart at" then
  // resolves from cache instead of showing the skeleton mid-interaction.
  useEffect(() => {
    const idle = window.requestIdleCallback || (cb => setTimeout(cb, 1500));
    const cancel = window.cancelIdleCallback || clearTimeout;
    const id = idle(() => { loadWhenPicker(); });
    return () => cancel(id);
  }, []);

  // First-run non-affiliation notice. Shown once per device until acknowledged.
  const [noticeSeen, setNoticeSeen] = useLocalStorage("humphreys.noticeSeen", false);

  // Feedback nudge: track plan count and snooze status
  const [planCount, setPlanCount] = useLocalStorage("htp_planCount", 0);
  const [nudgeSnoozedUntil, setNudgeSnoozedUntil] = useLocalStorage("htp_nudgeSnoozedUntil", null);

    // Increment plan count when displaying results
  useEffect(() => {
    if (searched && results && results.trips && results.trips.length > 0) {
      setPlanCount(prev => prev + 1);
    }
  }, [searched, results, setPlanCount]);

  const search=()=>{
    const ref = tMode === "now" ? new Date() : parseHMD(tTime, tDate);
    const mode = tMode === "arrive" ? "arrive" : "depart";
    setRes(findTrips(fStop, tStop, ref, mode, fBldg, tBldg, fCoords, null));
    setSrch(true);
    setEditing(false);
    setRecent(prev => {
      const entry = { fStop, tStop, fLbl, tLbl, fBldg, tBldg };
      const deduped = prev.filter(r => !(r.fStop===fStop && r.tStop===tStop));
      return [entry, ...deduped].slice(0, 5);
    });
  };
  const reset=()=>{setRes(null);setSrch(false);setEditing(false);};
  const swap=()=>{
    setFS(tStop);setTS(fStop);setFL(tLbl);setTL(fLbl);
    setFB(tBldg);setTB(fBldg);
    // User coords describe "From" position; after a swap they no longer apply
    // to either side, so clear.
    setFC(null);
    reset();
  };

  const findNearest = async () => {
    if (locBusy) return;
    setLocBusy(true);
    try {
      const coords = await requestUserLocation();
      const hit = nearestStopTo(coords);
      if (!hit) throw new Error("No stops have coordinates yet.");
      setFC(coords);
      setFS(hit.stop);
      setFL(hit.stop);
      setFB(null);
      reset();
    } catch (e) {
      setNotice(t.locError(e.message || String(e)));
    } finally {
      setLocBusy(false);
    }
  };

  const addFavorite=()=>{
    if (!fStop) { setNotice(t.pickFromFirst); return; }
    // Prefill with the stop minus any parenthetical, so "Barracks (700s Block)"
    // opens as "Barracks" rather than something nobody would type.
    setFavName(fStop.replace(/\s*\(.*\)\s*$/, "").trim() || fStop);
    setFavOpen(true);
  };
  const saveFavorite=()=>{
    const name = favName.trim();
    if (!name) return;
    setFavorites(prev => [{name, stop:fStop, label:fLbl, bldg:fBldg||null}, ...prev.filter(f => !(f.stop===fStop && f.name===name))]);
    setFavOpen(false);
  };
  const removeFavorite=idx=>setFavorites(prev=>prev.filter((_,i)=>i!==idx));
  const removeRecent=idx=>setRecent(prev=>prev.filter((_,i)=>i!==idx));
  const applyFavorite=f=>{setFS(f.stop);setFL(f.label);setFB(f.bldg||null);reset();};
  const applyRecent=r=>{setFS(r.fStop);setFL(r.fLbl);setFB(r.fBldg||null);setTS(r.tStop);setTL(r.tLbl);setTB(r.tBldg||null);reset();};
  const TABS=[["plan",t.tabPlan],["now",t.tabNow],["routes",t.tabRoutes],["offpost",t.tabOffpost]];

  // 2c suggestions. "Next service day" is the first upcoming date on which any
  // route runs at 09:00 — skipping a Sunday where nothing would be found.
  const tryTomorrow = () => {
    const d = new Date();
    for (let i = 1; i <= 7; i++) {
      const probe = new Date(d);
      probe.setDate(probe.getDate() + i);
      probe.setHours(9, 0, 0, 0);
      if (Object.values(ROUTES).some(r => inService(r, probe))) {
        setTMode("depart");
        setTDate(ymd(probe));
        setTTime("09:00");
        break;
      }
    }
    setEditing(true);
  };
  const changeTime = () => {
    setEditing(true);
    requestAnimationFrame(() => {
      whenRef.current?.scrollIntoView({ block:"center", behavior:"smooth" });
      whenRef.current?.querySelector("button")?.focus();
    });
  };

  // Summary line under the collapsed form: "Leave now · Sat 23 Aug, 14:10".
  const whenLabel = () => {
    const d = tMode === "now" ? now : parseHMD(tTime, tDate);
    const mode = tMode === "now" ? t.leaveNow : tMode === "depart" ? t.departAt : t.arriveBy;
    return `${mode} · ${formatDay(d, lang)}, ${fmt(d)}`;
  };

  const showForm = !searched || editing;

  // Favorites and recents used to be chip rows above the card; they overflowed
  // on a 375px screen, so they now live in the From field's empty-query
  // dropdown. Recents fill both stops and hand focus to When; favorites only
  // carry an origin, so they fill From and leave the cursor there.
  const focusWhen = () => requestAnimationFrame(() =>
    whenRef.current?.querySelector("button")?.focus());
  const quickPicks = [
    { key:"recent", label:t.recent, Icon:History,
      items: recent.map((r,i)=>({
        id:`r${i}`,
        content:<>{r.fStop} <span className="text-muted-foreground">→</span> {r.tStop}</>,
        onPick:()=>{ applyRecent(r); focusWhen(); },
        onRemove:()=>removeRecent(i), removeLabel:t.removeRecent,
      })) },
    { key:"fav", label:t.favorites, Icon:Star,
      items: favorites.map((f,i)=>({
        id:`f${i}`,
        content:<>{f.name} <span className="text-muted-foreground">· {f.stop}</span></>,
        onPick:()=>applyFavorite(f),
        onRemove:()=>removeFavorite(i), removeLabel:t.removeFavorite,
      })) },
  ];
  const themeLabelFor = m => m === "light" ? t.themeLight : m === "dark" ? t.themeDark : t.themeSystem;
  const themeCycleLabel = t.themeCycle(themeLabelFor(theme), themeLabelFor(THEME_NEXT[theme] || "dark"));

  return (
    <LangContext.Provider value={{ lang, t }}>
    <div className="mx-auto min-h-screen max-w-[480px] bg-background text-left text-body">

      {!noticeSeen && <FirstRunNotice onAck={()=>setNoticeSeen(true)}/>}

      <Dialog open={favOpen} onOpenChange={setFavOpen}>
        <DialogContent className="max-w-[420px] gap-0 rounded-[14px] border bg-card p-[22px_20px] ring-0 shadow-[shadow:var(--dd-shadow)]">
          <DialogTitle className="text-[17px] leading-[21px] font-semibold text-foreground">{t.saveFavHeading}</DialogTitle>
          <DialogDescription className="pt-1.5 text-[13px] leading-[1.6] text-secondary-text">{t.saveFavPrompt}</DialogDescription>
          <form onSubmit={e=>{e.preventDefault(); saveFavorite();}}>
            <Label htmlFor="fav-name" className="block pt-4 pb-1.5 text-[11.5px] font-semibold text-muted-foreground">
              {t.favNameLabel}
            </Label>
            <Input id="fav-name" autoFocus value={favName} className={INPUT_CLS}
              onChange={e=>setFavName(e.target.value)}/>
            <DialogFooter className="gap-2 pt-4">
              <Button type="button" variant="outline" onClick={()=>setFavOpen(false)}
                className="h-11 rounded-md border-border bg-card px-4 text-[13px] font-semibold text-foreground dark:bg-card">
                {t.actionCancel}
              </Button>
              <Button type="submit" disabled={!favName.trim()}
                className="h-11 rounded-md px-4 text-[13px] font-semibold disabled:opacity-45">
                {t.actionSave}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={notice !== null} onOpenChange={v=>{ if (!v) setNotice(null); }}>
        <DialogContent className="max-w-[420px] gap-0 rounded-[14px] border bg-card p-[22px_20px] ring-0 shadow-[shadow:var(--dd-shadow)]">
          <DialogTitle className="text-[17px] leading-[21px] font-semibold text-foreground">{t.noticeHeading}</DialogTitle>
          <DialogDescription className="pt-2 text-[13px] leading-[1.7] text-secondary-text">{notice}</DialogDescription>
          <DialogFooter className="pt-4">
            <Button onClick={()=>setNotice(null)}
              className="h-11 rounded-md px-4 text-[13px] font-semibold">{t.actionOk}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Tabs value={tab} onValueChange={v=>{setTab(v);reset();}} className="gap-0">
      <header className="border-b bg-card px-5 pt-4 pb-3.5">
        <div className="flex items-center gap-2.5">
          <BrandMark size={28} className="shrink-0"/>
          <div className="min-w-0 flex-1">
            <div className="text-[15px] leading-tight font-semibold text-foreground">{t.appTitle}</div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">{t.appSubtitle}</div>
          </div>
          {/* One pill, two halves: tap left to flip locale, tap right to cycle
              light → dark → system. Both are toggles rather than pickers, so
              the label always names what the next tap does. */}
          <div className="inline-flex h-8 shrink-0 items-center overflow-hidden rounded-full border bg-card shadow-[shadow:var(--card-shadow)]">
            <Button variant="ghost" size="sm" onClick={()=>setLang(lang==="en"?"ko":"en")}
              aria-label={t.switchLang} title={t.switchLang}
              className={cn(PILL_HALF,"gap-1 text-[11px] font-semibold")}>
              <Languages className="size-3.5" aria-hidden="true"/>
              {lang === "en" ? "EN" : "KO"}
            </Button>
            <span aria-hidden="true" className="h-full w-px shrink-0 bg-border"/>
            <Button variant="ghost" size="sm" onClick={()=>setTheme(THEME_NEXT[theme] || "dark")}
              aria-label={themeCycleLabel} title={themeCycleLabel}
              className={PILL_HALF}>
              {(() => { const I = THEME_ICON[theme] || Monitor;
                return <I className="size-3.5 transition-opacity duration-150" aria-hidden="true"/>; })()}
            </Button>
          </div>
        </div>

        <TabsList aria-label={t.mainNav}
          className="mt-3.5 grid w-full grid-cols-4 p-1 group-data-horizontal/tabs:h-11">
          {TABS.map(([id,lbl])=>(
            <TabsTrigger key={id} value={id}
              className={"h-9 rounded-[7px] text-[13px] text-muted-foreground data-active:bg-card " +
                "data-active:font-semibold data-active:text-foreground " +
                "group-data-[variant=default]/tabs-list:data-active:shadow-[shadow:var(--seg-active-shadow)] " +
                "dark:data-active:border-transparent dark:data-active:bg-card"}>
              {lbl}
            </TabsTrigger>
          ))}
        </TabsList>
      </header>

      <main>
      <TabsContent value="plan" className="px-5 py-4">
          {showForm ? (
          <Card className="mb-3.5 border bg-card shadow-[shadow:var(--card-shadow)] ring-0 [--card-spacing:--spacing(4)]">
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-[13px] font-semibold">{t.planTrip}</CardTitle>
              <div className="flex shrink-0 gap-1.5">
                <Button variant="outline" size="sm" onClick={findNearest} disabled={locBusy} title={t.nearestStop} className={GHOST_BTN}>
                  {locBusy ? t.nearestLoading : t.nearestStop}
                </Button>
                {fStop && (
                  <Button variant="outline" size="sm" onClick={addFavorite} title={t.saveFavTitle} className={GHOST_BTN}>
                    {t.saveFav}
                  </Button>
                )}
              </div>
            </CardHeader>

            <CardContent className="gap-2">
              <StopInput label={t.from} value={fLbl} quickPicks={quickPicks}
                dot={<span title={fCoords?t.usingLocation:undefined}
                  className={cn("absolute top-1/2 left-3 z-10 size-2 -translate-y-1/2 rounded-full bg-origin-dot",
                    fCoords && "ring-3 ring-origin-dot/25")}/>}
                onChange={(s,l,b)=>{setFS(s);setFL(l);setFB(b);setFC(null);reset();}}/>

              <div className="flex justify-center">
                <Button variant="ghost" size="icon" onClick={swap} aria-label={t.swapStops} title={t.swapStops}
                  className="relative size-9 rounded-md border text-muted-foreground after:absolute after:-inset-1 after:content-['']">
                  <ArrowDownUp className="size-4" aria-hidden="true"/>
                </Button>
              </div>

              <StopInput label={t.to} value={tLbl}
                dot={<span aria-hidden="true" className="absolute top-1/2 left-3 z-10 size-2 -translate-y-1/2 rounded-[2px] bg-foreground"/>}
                onChange={(s,l,b)=>{setTS(s);setTL(l);setTB(b);reset();}}/>

              <div ref={whenRef} className="mt-1.5"
                onPointerEnter={loadWhenPicker} onFocus={loadWhenPicker} onTouchStart={loadWhenPicker}>
                <div className="mb-1.5 text-xs text-muted-foreground">{t.when}</div>
                <ToggleGroup type="single" value={tMode} onValueChange={v=>{ if (v) { setTMode(v); reset(); } }}
                  spacing={0} aria-label={t.when} className={SEG_TRACK}>
                  {[["now",t.leaveNow],["depart",t.departAt],["arrive",t.arriveBy]].map(([k,lbl])=>(
                    <ToggleGroupItem key={k} value={k} className={SEG_ITEM}>{lbl}</ToggleGroupItem>
                  ))}
                </ToggleGroup>
                {tMode !== "now" && (
                  <>
                    <Suspense fallback={<WhenPickerSkeleton/>}>
                      <TripWhenPicker lang={lang} t={t} date={tDate} time={tTime}
                        onDate={v=>{setTDate(v); reset();}} onTime={v=>{setTTime(v); reset();}}/>
                    </Suspense>
                    <ToggleGroup type="single" value={tDate} onValueChange={v=>{ if (v) { setTDate(v); reset(); } }}
                      spacing={0} aria-label="Date" className={cn(SEG_TRACK,"mt-2 flex-wrap")}>
                      {Array.from({length:7}).map((_,i)=>{
                        const d=new Date(); d.setDate(d.getDate()+i);
                        const day=ymd(d);
                        const lbl=i===0?t.today:i===1?t.tomorrow:t.dow[d.getDay()];
                        return <ToggleGroupItem key={day} value={day} className={cn(SEG_ITEM,"min-w-[42px] px-1 text-[11px]")}>{lbl}</ToggleGroupItem>;
                      })}
                    </ToggleGroup>
                  </>
                )}
              </div>

              <Button className={cn(CTA_BTN,"mt-1.5")} disabled={!fStop||!tStop} onClick={search}>
                {t.findRoutes}
              </Button>
            </CardContent>
          </Card>
          ) : (
            <Card className={cn(CARD_CLS,"py-0")}>
              <div className="flex items-center gap-2.5 px-4 py-3">
                <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
                  <div className="truncate text-[13px] leading-[17px] font-semibold text-foreground">
                    {fStop} → {tStop}
                  </div>
                  <div className="text-[11.5px] leading-4 text-muted-foreground">{whenLabel()}</div>
                </div>
                <Button variant="outline" onClick={()=>setEditing(true)} className={SUMMARY_BTN}>{t.editTrip}</Button>
              </div>
            </Card>
          )}

          {showForm && (
            <div className={cn(NOTE_CLS,"mt-3.5")}>
              <span className="font-semibold text-foreground">{t.bldgsMappedTitle(Object.keys(BUILDINGS).length)}</span>{t.bldgsMappedDesc}
            </div>
          )}

          {searched && (
            <div className="si mt-3.5 flex flex-col gap-3">
              <div className="flex items-baseline justify-between gap-2">
                <div className="text-[13px] leading-[18px] font-semibold text-foreground">
                  {results.trips.length ? t.optionsFound(results.trips.length) : t.noOptionsFound}
                </div>
                {results.filtered.length>0 && (
                  <div className="text-xs leading-[18px] text-muted-foreground">{t.routesOOS(results.filtered.length)}</div>
                )}
              </div>

              {!results.trips.length ? (() => {
                const overnight = results.overnight || [];
                const overnightDirect = overnight.filter(o => o.type === "direct");
                const overnightXfer = overnight.filter(o => o.type === "xfer");
                let body, ids = [];
                if (overnightDirect.length) {
                  ids = idsFromNames([...new Set(overnightDirect.flatMap(o => o.routes))]);
                  body = t.noTripsOvernightDirect(<RouteNameList ids={ids} full/>);
                } else if (overnightXfer.length) {
                  ids = idsFromNames(overnightXfer[0].routes);
                  body = t.noTripsOvernightXfer(<RouteNameList ids={ids} full sep=" → "/>);
                } else if (results.filtered.length > 0) {
                  ids = idsFromNames(results.filtered);
                  body = t.noTripsOOS(<RouteNameList ids={ids} full/>);
                } else {
                  body = [t.noTripsNoPath];
                }
                // Mono line of when each named route actually stops for the day.
                const ref = tMode === "now" ? now : parseHMD(tTime, tDate);
                const ends = ids
                  .map(id => { const e = serviceEndToday(ROUTES[id], ref); return e && [id, fmt(e)]; })
                  .filter(Boolean);
                return <NoTrips body={body} endTimes={ends.length ? ends : null}
                  onTryTomorrow={tryTomorrow} onChangeTime={changeTime}/>;
              })() : (
                <>
                  <FastestTrip trip={results.trips[0]} now={now}/>
                  {results.trips.length > 1 && <OtherTrips trips={results.trips.slice(1)}/>}
                  {(() => {
                    // eslint-disable-next-line react-hooks/purity
                    const shouldShow = planCount >= 3 && (!nudgeSnoozedUntil || nudgeSnoozedUntil < Date.now());
                    if (!shouldShow) return null;
                    const handleDismiss = () => setNudgeSnoozedUntil(Date.now() + 60 * 24 * 60 * 60 * 1000);
                    const handleFeedback = () => setNudgeSnoozedUntil(Date.now() + 21 * 24 * 60 * 60 * 1000);
                    return (
                      <div className="flex items-center gap-2.5 rounded-lg border bg-muted p-3 text-[13px]">
                        <div className="flex-1 leading-snug text-body">{t.feedbackNudgeQuestion}</div>
                        <a className={cn(LINK_CLS,"shrink-0 text-xs font-medium whitespace-nowrap")}
                           href={FEEDBACK_URL} target="_blank" rel="noopener noreferrer" onClick={handleFeedback}>
                          {t.feedbackNudgeButton}
                        </a>
                        <button type="button" onClick={handleDismiss} aria-label={t.feedbackNudgeDismiss}
                          className="flex size-7 shrink-0 items-center justify-center rounded-md border text-muted-foreground outline-none hover:text-foreground focus-visible:text-foreground">
                          ×
                        </button>
                      </div>
                    );
                  })()}
                  <div className={FOOTNOTE_CLS}>{t.resultsFootnote}</div>
                </>
              )}
            </div>
          )}

          {!searched && (
            <div className={cn(NOTE_CLS,"mt-3.5 flex flex-col gap-1.5")}>
              <span className="font-semibold text-foreground">{t.shuttleInfoTitle}</span>
              {shuttleGroups().map(g=>(
                <span key={g.when}><Parts of={t.shuttleGroup(<RouteNameList ids={g.ids}/>, g.when)}/></span>
              ))}
              <span className="pt-1">{t.shuttleInfoTail}</span>
            </div>
          )}
      </TabsContent>

      <TabsContent value="now">
        <NowTab/>
      </TabsContent>

      <TabsContent value="routes" className="px-5 pt-4 pb-6">
        {openRoute ? (
          <RouteDetail route={ROUTES[openRoute]} onBack={()=>setOpenRoute(null)}/>
        ) : (
          <div className="flex flex-col gap-3.5">
            <div className={NOTE_CLS}>{t.routesNote}</div>
            <Card className={cn(CARD_CLS,"gap-0 py-0")}>
              {Object.values(ROUTES).map((r,i,arr)=>(
                <RouteRow key={r.id} route={r} now={now} last={i===arr.length-1}
                  onOpen={()=>setOpenRoute(r.id)}/>
              ))}
            </Card>
            <div className={FOOTNOTE_CLS}>{t.routesFootnote}</div>
          </div>
        )}
      </TabsContent>

      <TabsContent value="offpost">
        <OffPostTab/>
      </TabsContent>
      </main>
      </Tabs>

      <footer className="mt-2 border-t px-5 pt-4 pb-6 text-center text-[11px] leading-[1.7] text-muted-foreground">
        <div>{t.disclaimer}</div>
        <div className="mt-2">{t.scheduleCredit}</div>
        <div className="mt-2">
          {t.mapaFooterLabel}{" "}
          <strong className="font-semibold text-muted-foreground">MAPA (My Army Post App)</strong>
          {" — "}
          <a className={LINK_CLS} href={MAPA_LINKS.ios} target="_blank" rel="noopener noreferrer">{t.mapaAppStore}</a>
          {" · "}
          <a className={LINK_CLS} href={MAPA_LINKS.android} target="_blank" rel="noopener noreferrer">{t.mapaPlayStore}</a>
        </div>
        <div className="mt-2.5">
          <a className={LINK_CLS} href={FEEDBACK_URL} target="_blank" rel="noopener noreferrer">
            {t.feedbackLink}
          </a>
        </div>
      </footer>
    </div>
    </LangContext.Provider>
  );
}

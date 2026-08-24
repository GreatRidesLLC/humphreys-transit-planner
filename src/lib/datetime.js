import { pad2 } from "./routing.js";

// Trip state stores dates as "YYYY-MM-DD" and times as "HH:MM" because that is
// what findTrips consumes. These convert at the UI boundary and nowhere else.
export const ymd = d => `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
export const ymdToDate = s => { const [y,m,d] = s.split("-").map(Number); return new Date(y, m-1, d); };
export const todayYMD = () => ymd(new Date());
export const startOfToday = () => { const d = new Date(); d.setHours(0,0,0,0); return d; };

export const formatDay = (d, lang) =>
  d.toLocaleDateString(lang === "ko" ? "ko-KR" : "en-GB", { weekday:"short", day:"numeric", month:"short" });

export const HOURS = Array.from({length:24}, (_,i) => pad2(i));

// 5-minute steps, plus whatever the clock actually said when the form opened —
// prefilling "14:07" must not silently become "14:05".
export const minuteOptions = mm => {
  const steps = Array.from({length:12}, (_,i) => pad2(i*5));
  return steps.includes(mm) ? steps : [...steps, mm].sort();
};

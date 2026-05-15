import { useState, useMemo, useRef, useEffect } from "react";

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
  oliveDim:  "#5a7a40",
  oliveMute: "#3a5828",
  oliveFaint:"#263c18",
};

// ─── Time Helpers ─────────────────────────────────────────────────────────────
const pad2 = n => String(n).padStart(2, "0");
const fmt  = d => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
const addMin = (d, m) => new Date(d.getTime() + m * 60000);
const subMin = (d, m) => new Date(d.getTime() - m * 60000);
const parseHM = s => {
  const [h, m] = s.split(":").map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
};
// Returns true if route is running at the given Date
const inService = (r, d) => {
  const dow = d.getDay(); // 0=Sun, 6=Sat
  if (r.days === "Mon–Fri" && (dow === 0 || dow === 6)) return false;
  const [s, e] = r.hours.split("–");
  const mins = d.getHours() * 60 + d.getMinutes();
  const sm = parseInt(s.slice(0,2))*60 + parseInt(s.slice(2));
  const em = parseInt(e.slice(0,2))*60 + parseInt(e.slice(2));
  return mins >= sm && mins <= em;
};

// ─── Routes ───────────────────────────────────────────────────────────────────
const ROUTES = {
  BLUE:  { id:"BLUE",  name:"Blue Route",   color:"#5bb8ff", freq:20, hours:"0600–2200", days:"Mon–Fri",
    stops:["Pedestrian Gate","Provider Grill DFAC","SLQs (12200s Block)","Eighth Army HQ","Corps of Engineers","TMP / Driver's Licensing","Airfield Operations","Talon Cafe DFAC","Barracks (6000s Block)","Pacific Victors Chapel","Spartan DFAC","LTG Maude Hall (9th St)","Commissary","Main Post Office","Main Exchange (PX)","Pittman DFAC","Sitman Fitness Center","2ID Sustainment","Central Issue Facility"] },
  BLACK: { id:"BLACK", name:"Black Route",  color:"#c0cfc0", freq:25, hours:"0600–2200", days:"Mon–Fri",
    stops:["Pedestrian Gate","Provider Grill DFAC","SLQs (12200s Block)","Eighth Army HQ","Corps of Engineers","Pacific Victors Chapel","Commissary","LTG Maude Hall (9th St)","Spartan DFAC"] },
  GREEN: { id:"GREEN", name:"Green Route",  color:"#4dde88", freq:20, hours:"0600–2200", days:"Mon–Fri",
    stops:["Pedestrian Gate","Provider Grill DFAC","Desiderio ATC Tower","Law Enforcement Center (DES)","Bus Terminal","Lodging","KTO Museum","MSG Jenkins Medical Clinic","Collier Fitness Center","Family Housing Towers (Tropic Lightning Ave)","Talon Cafe DFAC","Airfield Operations","Barracks (6000s Block)","Pacific Victors Chapel","Spartan DFAC","LTG Maude Hall (9th St)","Commissary","Main Exchange (PX)","Balboni Sports Field (5th St)"] },
  ORANGE:{ id:"ORANGE",name:"Orange Route", color:"#ff8c3a", freq:30, hours:"0600–2200", days:"Mon–Fri",
    stops:["Pedestrian Gate","Provider Grill DFAC","SLQs (12200s Block)","TMP / Driver's Licensing","Eighth Army HQ"] },
  PURPLE:{ id:"PURPLE",name:"Purple Route", color:"#c47aff", freq:25, hours:"0600–2200", days:"Mon–Fri",
    stops:["Brian D. Allgood Hospital","Bus Terminal","Collier Fitness Center","Turner Fitness Center","TMP / Driver's Licensing","Spartan DFAC","Sitman Fitness Center","Barracks (6800s & 6900s Block)","Balboni Sports Field (5th St)","Pittman DFAC"] },
  GOLD:  { id:"GOLD",  name:"Gold Route",   color:"#FFD040", freq:20, hours:"0900–2100", days:"Mon–Sun",
    verified:true, note:"Departs Bus Terminal :00 :20 :40 each hour (from official July 2023 PDF)",
    stops:["Bus Terminal","Barracks (700s Block)","Morning Calm Center","Sentry Village Burger King","Sentry Village Mini Mall","MSG Jenkins Medical Clinic","Freedom Chapel","Collier Fitness Center","Family Housing Towers (Tropic Lightning Ave)","Family Housing Towers (Taro Ave)","Red Cloud Circle","Main Post Office","Main Exchange (PX)","Balboni Sports Field (Marne Ave)","Barracks (6800s Block)","River Bend Golf Course"] },
  BROWN: { id:"BROWN", name:"Brown Route",  color:"#e8944a", freq:30, hours:"0600–2200", days:"Mon–Fri",
    stops:["Bus Terminal","Family Housing (Stanton)","Elementary School","Middle/High School","Family Housing (Palmer)"] },
  PINK:  { id:"PINK",  name:"Pink Route",   color:"#ff6bb5", freq:30, hours:"0600–2200", days:"Mon–Fri",
    stops:["Bus Terminal","Family Housing (North)","Park Area","Family Housing (South)","Hospital Annex"] },
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

// Now accepts refTime (Date) and mode ("depart" or "arrive")
function findTrips(from, to, refTime, mode) {
  if (!from||!to||from===to) return { trips:[], filtered:[] };
  const fr=STOP_ROUTES[from]||[], tr=STOP_ROUTES[to]||[];
  const trips=[];
  const filtered=[]; // routes excluded for being out-of-service

  // For service-hour check: in "arrive" mode the trip starts roughly earlier
  const checkTime = mode === "depart" ? refTime : subMin(refTime, 60);

  for (const rid of fr.filter(r=>tr.includes(r))) {
    const R=ROUTES[rid];
    if (!inService(R, checkTime)) { filtered.push(R.name); continue; }
    const fi=R.stops.indexOf(from), ti=R.stops.indexOf(to);
    const n=Math.abs(ti-fi), t=n*2, w=Math.round(R.freq/2);
    trips.push({ id:`d-${rid}`, type:"direct", total:t+w+6,
      legs:[{k:"walk",dur:3,lbl:`Walk to ${from}`},{k:"bus",rid,from,to,n,t,w},{k:"walk",dur:3,lbl:"Walk to destination"}] });
  }
  for (const r1 of fr) for (const r2 of tr) {
    if (r1===r2) continue;
    if (!inService(ROUTES[r1], checkTime) || !inService(ROUTES[r2], checkTime)) continue;
    const shared=ROUTES[r1].stops.filter(s=>ROUTES[r2].stops.includes(s)&&s!==from&&s!==to);
    if (!shared.length) continue;
    const R1=ROUTES[r1], R2=ROUTES[r2];
    const w1=Math.round(R1.freq/2), w2=Math.round(R2.freq/2);
    // Pick shared stop that minimizes total trip time
    let best=null;
    for (const x of shared) {
      const n1=Math.abs(R1.stops.indexOf(x)-R1.stops.indexOf(from));
      const n2=Math.abs(R2.stops.indexOf(to)-R2.stops.indexOf(x));
      const t1=n1*2, t2=n2*2;
      const total=t1+t2+w1+w2+8;
      if (!best || total<best.total) best={x,n1,n2,t1,t2,total};
    }
    const {x,n1,n2,t1,t2,total}=best;
    trips.push({ id:`x-${r1}-${r2}`, type:"xfer", total,
      legs:[{k:"walk",dur:3,lbl:`Walk to ${from}`},{k:"bus",rid:r1,from,to:x,n:n1,t:t1,w:w1},{k:"xfer",dur:2,at:x},{k:"bus",rid:r2,from:x,to,n:n2,t:t2,w:w2},{k:"walk",dur:3,lbl:"Walk to destination"}] });
  }

  // Attach actual clock times to each leg
  for (const trip of trips) {
    if (mode === "arrive") {
      let t = new Date(refTime);
      trip.arriveAt = new Date(t);
      for (let i = trip.legs.length - 1; i >= 0; i--) {
        const leg = trip.legs[i];
        if (leg.k === "walk") {
          leg.endAt = new Date(t); t = subMin(t, leg.dur); leg.startAt = new Date(t);
        } else if (leg.k === "bus") {
          leg.alightAt = new Date(t);
          t = subMin(t, leg.t);
          leg.boardAt = new Date(t);
          t = subMin(t, leg.w);
        } else if (leg.k === "xfer") {
          leg.endAt = new Date(t); t = subMin(t, leg.dur); leg.startAt = new Date(t);
        }
      }
      trip.departAt = new Date(t);
    } else {
      let t = new Date(refTime);
      trip.departAt = new Date(t);
      for (const leg of trip.legs) {
        if (leg.k === "walk") {
          leg.startAt = new Date(t); t = addMin(t, leg.dur); leg.endAt = new Date(t);
        } else if (leg.k === "bus") {
          t = addMin(t, leg.w);
          leg.boardAt = new Date(t);
          t = addMin(t, leg.t);
          leg.alightAt = new Date(t);
        } else if (leg.k === "xfer") {
          leg.startAt = new Date(t); t = addMin(t, leg.dur); leg.endAt = new Date(t);
        }
      }
      trip.arriveAt = new Date(t);
    }
  }

  return { trips: trips.sort((a,b)=>a.total-b.total).slice(0,3), filtered: [...new Set(filtered)] };
}

// ─── CSS ──────────────────────────────────────────────────────────────────────
const CSS=`
@import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{background:#0e1a08}
.inp{background:#1c2e14;color:#e8dca8;border:1px solid #3a5820;border-radius:8px;padding:13px 14px;width:100%;font-family:'Rajdhani',sans-serif;font-size:15px;font-weight:500;transition:border-color .2s}
.inp:focus{outline:none;border-color:#FFB81C;box-shadow:0 0 0 2px rgba(255,184,28,.18)}
.inp::placeholder{color:#3a5828}
.dd{position:absolute;top:calc(100% + 4px);left:0;right:0;background:#1c2e14;border:1px solid #3a5820;border-radius:8px;max-height:210px;overflow-y:auto;z-index:100;box-shadow:0 8px 32px rgba(0,0,0,.7)}
.di{padding:10px 14px;cursor:pointer;border-bottom:1px solid #182810}
.di:last-child{border-bottom:none}
.di:hover{background:#243a18}
.btn{width:100%;padding:14px;background:linear-gradient(135deg,#FFB81C,#d4960e);color:#080f04;border:none;border-radius:10px;font-family:'Rajdhani',sans-serif;font-size:16px;font-weight:700;letter-spacing:2px;text-transform:uppercase;cursor:pointer;transition:transform .1s,box-shadow .2s}
.btn:hover:not(:disabled){transform:translateY(-1px);box-shadow:0 6px 20px rgba(255,184,28,.35)}
.btn:disabled{background:#1c2e14;color:#3a5828;cursor:not-allowed}
.si{animation:si .3s cubic-bezier(.22,.68,0,1.2)}
@keyframes si{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
.tab{flex:1;padding:8px 4px;border:none;border-radius:8px;font-family:'Rajdhani',sans-serif;font-size:12px;font-weight:700;letter-spacing:.5px;cursor:pointer;transition:all .2s}
.seg{display:flex;gap:3px;background:#1c2e14;padding:3px;border-radius:8px;border:1px solid #3a5820}
.segbtn{flex:1;padding:7px 6px;border:none;border-radius:6px;font-family:'Rajdhani',sans-serif;font-size:11px;font-weight:600;letter-spacing:.5px;cursor:pointer;background:transparent;color:#8aaa60;text-transform:uppercase;transition:all .15s}
.segbtn.on{background:#FFB81C;color:#080f04}
.timep{background:#1c2e14;color:#FFB81C;border:1px solid #3a5820;border-radius:6px;padding:9px 12px;width:100%;font-family:'JetBrains Mono',monospace;font-size:15px;font-weight:600;letter-spacing:1px;text-align:center}
.timep:focus{outline:none;border-color:#FFB81C}
.timep::-webkit-calendar-picker-indicator{filter:invert(.7) sepia(1) saturate(4) hue-rotate(2deg);cursor:pointer}
.tm{font-family:'JetBrains Mono',monospace;font-weight:500}
::-webkit-scrollbar{width:4px}
::-webkit-scrollbar-track{background:#0e1a08}
::-webkit-scrollbar-thumb{background:#3a5820;border-radius:2px}
.chip{display:inline-flex;align-items:center;gap:6px;background:#162210;border:1px solid #3a5820;border-radius:14px;padding:5px 4px 5px 10px;font-size:12px;color:#e8dca8;white-space:nowrap;flex-shrink:0;font-family:'Rajdhani',sans-serif}
.chipx{background:transparent;border:none;color:#5a7a40;font-size:14px;cursor:pointer;padding:0 6px;line-height:1;border-radius:50%}
.chipx:hover{color:#FFB81C;background:#243a18}
`;

// ─── Searchable Input ─────────────────────────────────────────────────────────
function StopInput({ label, value, onChange }) {
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
      <input className="inp" placeholder={`${label} — stop name or Bldg #`} value={q}
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
        <div className="dd"><div className="di"><div style={{fontSize:12,color:C.oliveDim}}>No matching stop or building</div></div></div>
      )}
    </div>
  );
}

// ─── Leg Row ──────────────────────────────────────────────────────────────────
function Leg({leg:l, last}) {
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
            <div style={{fontSize:13,color:C.tan}}>{l.lbl}</div>
            <div className="tm" style={{fontSize:12,color:C.sage,flexShrink:0}}>{fmt(l.startAt)}–{fmt(l.endAt)}</div>
          </div>
          <div style={{fontSize:11,color:C.oliveDim,marginTop:2}}>~{l.dur} min walk</div>
        </>}
        {l.k==="bus" && <>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
            <span style={{background:ROUTES[l.rid].color,color:"#080f04",fontSize:10,fontWeight:700,padding:"2px 9px",borderRadius:20,letterSpacing:1,fontFamily:"'JetBrains Mono',monospace"}}>
              {ROUTES[l.rid].name.replace(" Route","").toUpperCase()}
            </span>
            <span style={{fontSize:11,color:C.sage}}>every {ROUTES[l.rid].freq} min</span>
          </div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",gap:8}}>
            <div style={{fontSize:13,color:C.tan}}>Board at <strong style={{color:C.khaki}}>{l.from}</strong></div>
            <div className="tm" style={{fontSize:13,color:C.gold,fontWeight:600,flexShrink:0}}>{fmt(l.boardAt)}</div>
          </div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",gap:8}}>
            <div style={{fontSize:13,color:C.tan}}>Alight at <strong style={{color:C.khaki}}>{l.to}</strong></div>
            <div className="tm" style={{fontSize:13,color:C.gold,fontWeight:600,flexShrink:0}}>{fmt(l.alightAt)}</div>
          </div>
          <div style={{fontSize:11,color:C.oliveDim,marginTop:4}}>~{l.w} min wait · ~{l.t} min ride · {l.n} stop{l.n!==1?"s":""}</div>
        </>}
        {l.k==="xfer" && <>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",gap:8}}>
            <div style={{fontSize:13,color:C.gold,fontWeight:600}}>Transfer here</div>
            <div className="tm" style={{fontSize:12,color:C.sage,flexShrink:0}}>{fmt(l.startAt)}–{fmt(l.endAt)}</div>
          </div>
          <div style={{fontSize:11,color:C.sage,marginTop:2}}>{l.at} · ~{l.dur} min</div>
        </>}
      </div>
    </div>
  );
}

// ─── Trip Card ────────────────────────────────────────────────────────────────
function TripCard({trip:t, rank:r}) {
  const [open,setOpen]=useState(r===0);
  const bl=t.legs.filter(l=>l.k==="bus");
  const estimated=bl.some(l=>!ROUTES[l.rid].verified);
  return (
    <div style={{background:C.bgCard,border:`1px solid ${r===0?C.gold+"55":C.borderSub}`,borderRadius:14,marginBottom:12,overflow:"hidden",boxShadow:r===0?`0 0 28px rgba(255,184,28,.1)`:"none"}}>
      <div onClick={()=>setOpen(o=>!o)} style={{padding:"14px 16px",display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer"}}>
        <div style={{display:"flex",alignItems:"center",gap:12,flex:1}}>
          {r===0 && <span style={{background:C.gold,color:C.bgDeep,fontSize:9,fontWeight:800,padding:"3px 8px",borderRadius:6,letterSpacing:1.5,fontFamily:"'JetBrains Mono',monospace",flexShrink:0}}>FASTEST</span>}
          {estimated && <span title="Times based on estimated schedule — not yet verified against an official PDF" style={{background:"transparent",color:C.sage,border:`1px solid ${C.oliveMute}`,fontSize:9,fontWeight:700,padding:"2px 7px",borderRadius:6,letterSpacing:1.5,fontFamily:"'JetBrains Mono',monospace",flexShrink:0}}>EST.</span>}
          <div style={{flex:1,minWidth:0}}>
            <div style={{display:"flex",alignItems:"baseline",gap:10,flexWrap:"wrap"}}>
              <div className="tm" style={{fontSize:22,fontWeight:600,color:C.khaki,lineHeight:1}}>
                {fmt(t.departAt)} <span style={{color:C.oliveDim,fontWeight:400}}>→</span> {fmt(t.arriveAt)}
              </div>
              <div style={{fontSize:13,color:C.sage,lineHeight:1}}>~{t.total} min</div>
            </div>
            <div style={{fontSize:12,color:C.oliveDim,marginTop:5}}>
              {t.type==="direct"?"Direct · no transfer":"1 transfer"} ·&nbsp;
              {bl.map((l,i)=><span key={i} style={{color:ROUTES[l.rid].color}}>{ROUTES[l.rid].name.replace(" Route","")}{i<bl.length-1?" → ":""}</span>)}
            </div>
          </div>
        </div>
        <div style={{display:"flex",gap:5,alignItems:"center"}}>
          {bl.map(l=><div key={l.rid} style={{width:12,height:12,borderRadius:"50%",background:ROUTES[l.rid].color}}/>)}
          <span style={{color:C.oliveDim,marginLeft:6,fontSize:12}}>{open?"▲":"▼"}</span>
        </div>
      </div>
      {open && <div style={{padding:"4px 16px 16px",borderTop:`1px solid ${C.borderDim}`}}>
        {t.legs.map((l,i)=><Leg key={i} leg={l} last={i===t.legs.length-1}/>)}
      </div>}
    </div>
  );
}

// ─── Route Card ───────────────────────────────────────────────────────────────
function RouteCard({route:r}) {
  const [open,setOpen]=useState(false);
  return (
    <div style={{background:C.bgCard,border:`1px solid ${r.color}33`,borderRadius:12,marginBottom:10,overflow:"hidden"}}>
      <div onClick={()=>setOpen(o=>!o)} style={{padding:"14px 16px",display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer"}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <div style={{width:14,height:14,borderRadius:"50%",background:r.color,boxShadow:`0 0 10px ${r.color}88`,flexShrink:0}}/>
          <div>
            <div style={{fontSize:16,fontWeight:700,color:C.khaki}}>{r.name}</div>
            <div style={{fontSize:11,color:C.oliveDim}}>Every {r.freq} min · {r.stops.length} stops · {r.days} · {r.hours}</div>
            {r.verified && <div style={{fontSize:10,color:"#4dde88",marginTop:2}}>✓ PDF-verified schedule</div>}
          </div>
        </div>
        <span style={{color:C.oliveDim,fontSize:13}}>{open?"▲":"▼"}</span>
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
              <div style={{fontSize:11,color:C.gold,fontWeight:700,marginBottom:4}}>VERIFIED SCHEDULE (Mon–Sun)</div>
              <div style={{fontSize:12,color:C.tan}}>{r.note}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Now Tab ──────────────────────────────────────────────────────────────────
// For Gold from Bus Terminal we have verified `:00 :20 :40` departures.
// Everywhere else we only know frequency, so fall back to `~freq÷2 min` average.
function nextDepartureInfo(rid, stop, now) {
  const R = ROUTES[rid];
  if (!inService(R, now)) {
    return { kind: "oos", route: R };
  }
  if (rid === "GOLD" && stop === "Bus Terminal") {
    const targets = [0, 20, 40];
    const m = now.getMinutes();
    const t = targets.find(x => x > m);
    const next = new Date(now);
    next.setSeconds(0, 0);
    if (t === undefined) { next.setHours(next.getHours()+1); next.setMinutes(0); }
    else next.setMinutes(t);
    const mins = Math.max(0, Math.round((next - now)/60000));
    return { kind: "exact", route: R, at: next, mins };
  }
  return { kind: "approx", route: R, mins: Math.max(1, Math.round(R.freq/2)) };
}

function NextDepartureRow({ rid, stop, now }) {
  const info = nextDepartureInfo(rid, stop, now);
  const R = info.route;
  return (
    <div style={{background:C.bgCard,border:`1px solid ${R.color}33`,borderRadius:12,marginBottom:10,padding:"12px 14px",display:"flex",alignItems:"center",gap:12}}>
      <div style={{width:14,height:14,borderRadius:"50%",background:R.color,boxShadow:`0 0 10px ${R.color}88`,flexShrink:0}}/>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:15,fontWeight:700,color:C.khaki}}>{R.name}</div>
        <div style={{fontSize:11,color:C.oliveDim,marginTop:2}}>
          every {R.freq} min · {R.days} · {R.hours}
          {R.verified && <span style={{color:"#4dde88",marginLeft:6}}>✓</span>}
        </div>
      </div>
      <div style={{textAlign:"right",flexShrink:0}}>
        {info.kind === "exact" && <>
          <div className="tm" style={{fontSize:18,fontWeight:600,color:C.gold,lineHeight:1}}>{fmt(info.at)}</div>
          <div style={{fontSize:11,color:C.sage,marginTop:3}}>{info.mins===0?"now":`in ${info.mins} min`}</div>
        </>}
        {info.kind === "approx" && <>
          <div className="tm" style={{fontSize:18,fontWeight:600,color:C.tan,lineHeight:1}}>~{info.mins} min</div>
          <div style={{fontSize:10,color:C.oliveDim,marginTop:3,letterSpacing:.5}}>EST. AVG</div>
        </>}
        {info.kind === "oos" && <>
          <div style={{fontSize:12,fontWeight:600,color:C.oliveDim,lineHeight:1.2}}>Out of</div>
          <div style={{fontSize:12,fontWeight:600,color:C.oliveDim,lineHeight:1.2}}>service</div>
        </>}
      </div>
    </div>
  );
}

function NowTab() {
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
        <div style={{fontSize:11,color:C.oliveMute,letterSpacing:1.5,textTransform:"uppercase",marginBottom:14}}>Where are you?</div>
        <StopInput label="At stop" value={stopLbl} onChange={(s,l)=>{setStop(s);setStopLbl(l);}}/>
        <div style={{fontSize:11,color:C.oliveDim,marginTop:10,display:"flex",alignItems:"center",gap:6}}>
          <span style={{fontSize:13}}>🕒</span>
          <span>As of <span className="tm" style={{color:C.gold}}>{fmt(now)}</span> — updates every minute</span>
        </div>
      </div>

      {stop && routesAtStop.length > 0 && (
        <>
          <div style={{fontSize:11,color:C.oliveMute,letterSpacing:1.5,textTransform:"uppercase",marginBottom:10}}>
            Next departures from {stop}
          </div>
          {routesAtStop.map(rid => <NextDepartureRow key={rid} rid={rid} stop={stop} now={now}/>)}
          <div style={{fontSize:11,color:C.oliveMute,textAlign:"center",marginTop:8,lineHeight:1.6}}>
            Gold from Bus Terminal uses verified `:00 :20 :40` schedule. Other routes show <span style={{color:C.tan}}>~freq ÷ 2</span> averages.
          </div>
        </>
      )}

      {stop && routesAtStop.length === 0 && (
        <div style={{background:C.bgCard,border:`1px solid ${C.borderSub}`,borderRadius:14,padding:24,textAlign:"center"}}>
          <div style={{fontSize:13,color:C.oliveDim}}>No routes serve this stop.</div>
        </div>
      )}

      {!stop && (
        <div style={{background:C.bgCard,border:`1px solid ${C.borderSub}`,borderRadius:10,padding:"12px 14px",display:"flex",gap:10}}>
          <span style={{fontSize:16}}>ℹ️</span>
          <div style={{fontSize:11,color:C.oliveDim,lineHeight:1.6}}>
            Pick a stop to see the next bus on every route that serves it. The page auto-refreshes once a minute.
          </div>
        </div>
      )}
    </div>
  );
}
// ─── Off-Post Tab ─────────────────────────────────────────────────────────────
function OffPostTab() {
  return (
    <div style={{padding:"16px 14px 32px"}}>
      <div style={{background:`linear-gradient(135deg,${C.bgCard},#162a10)`,border:`1px solid ${C.borderMain}`,borderRadius:14,padding:18,marginBottom:20}}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
          <span style={{fontSize:22}}>📡</span>
          <div>
            <div style={{fontFamily:"'Rajdhani',sans-serif",fontSize:17,fontWeight:700,color:C.gold,letterSpacing:1}}>Live GPS Tracking</div>
            <div style={{fontSize:11,color:C.oliveDim,letterSpacing:.5}}>FUTURE FEATURE · WHAT IT REQUIRES</div>
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
            <strong style={{color:"#4dde88"}}>Action:</strong> Contact Transportation (DSN 755-0424) and DPW GIS/IGI&S (Bldg 6140) to explore GPS trackers or a BusWhere deployment for Humphreys.
          </div>
        </div>
      </div>

      <div style={{fontSize:11,color:C.oliveMute,letterSpacing:1.5,textTransform:"uppercase",marginBottom:10}}>Inter-Garrison Routes</div>
      <div style={{background:C.bgCard,border:`1px solid ${C.borderSub}`,borderRadius:10,padding:"12px 14px",marginBottom:12}}>
        <div style={{fontSize:12,color:C.sage,lineHeight:1.7}}>
          ⚠️ Inter-garrison buses are <strong style={{color:C.tan}}>not integrated</strong> into the trip planner. Priority-based seating, fixed schedules, not connectable as transfers. Verify at:<br/>
          <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:11,color:C.gold}}>home.army.mil/humphreys → Inter-Garrison Bus Service</span>
        </div>
      </div>
      {OFFPOST.map(r=>(
        <div key={r.id} style={{background:C.bgCard,border:`1px solid ${r.color}33`,borderRadius:12,marginBottom:10,padding:"14px 16px"}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
            <span style={{fontSize:20}}>{r.icon}</span>
            <div>
              <div style={{fontSize:15,fontWeight:700,color:C.khaki}}>{r.name}</div>
              <div style={{fontSize:11,color:C.oliveDim}}>Pick-up: {r.pickup}</div>
            </div>
          </div>
          <div style={{fontSize:12,color:C.tan,lineHeight:1.6,marginBottom:4}}>{r.desc}</div>
          <div style={{fontSize:11,color:C.sage,fontStyle:"italic"}}>{r.schedule}</div>
        </div>
      ))}

      <div style={{background:"#120e04",border:`1px solid #4a3a10`,borderRadius:12,padding:"14px 16px",marginTop:12}}>
        <div style={{fontSize:13,fontWeight:700,color:C.gold,marginBottom:10}}>📋 Your To-Do List</div>
        {[
          "Download current inter-garrison PDFs from USAG Humphreys (airport schedule updated Feb 2026)",
          "Provide Brown & Pink route PDFs to verify their stops (currently estimated)",
          "Obtain full building-number directory from DPW GIS / IGI&S office (Bldg 6140)",
          "Contact Transportation (DSN 755-0424) about GPS tracker feasibility or BusWhere deployment",
          "Confirm Blue/Black/Green/Orange/Purple schedule PDFs to replace estimated frequencies with exact timetables",
          "Add Korean language toggle (KATUSAs, KSC, family — no existing app fills this gap)",
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

  // Time-mode state. tMode: "now" | "depart" | "arrive". tTime is a "HH:MM" string.
  const [tMode, setTMode] = useState("now");
  const nowHM = () => { const d=new Date(); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };
  const [tTime, setTTime] = useState(nowHM);

  // Favorites: user-named From stops. Recent: last 5 unique From→To searches.
  const [favorites, setFavorites] = useLocalStorage("humphreys.favorites", []);
  const [recent, setRecent] = useLocalStorage("humphreys.recent", []);

  const search=()=>{
    const ref = tMode === "now" ? new Date() : parseHM(tTime);
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
    if (!fStop) { alert("Pick a From stop first, then save it as a favorite."); return; }
    const name = (prompt("Name this favorite (e.g. Home, Work, Gym)") || "").trim();
    if (!name) return;
    setFavorites(prev => [{name, stop:fStop, label:fLbl}, ...prev.filter(f => !(f.stop===fStop && f.name===name))]);
  };
  const removeFavorite=idx=>setFavorites(prev=>prev.filter((_,i)=>i!==idx));
  const removeRecent=idx=>setRecent(prev=>prev.filter((_,i)=>i!==idx));
  const applyFavorite=f=>{setFS(f.stop);setFL(f.label);reset();};
  const applyRecent=r=>{setFS(r.fStop);setFL(r.fLbl);setTS(r.tStop);setTL(r.tLbl);reset();};
  const TABS=[["plan","🗺 Plan"],["now","⏱ Now"],["routes","🚌 Routes"],["offpost","📡 Off-Post"]];

  return (
    <div style={{fontFamily:"'Rajdhani',sans-serif",background:C.bgBase,minHeight:"100vh",color:C.tan,maxWidth:480,margin:"0 auto"}}>
      <style>{CSS}</style>

      <div style={{background:`linear-gradient(180deg,${C.bgCard} 0%,${C.bgBase} 100%)`,borderBottom:`1px solid ${C.borderSub}`,padding:"18px 16px 14px"}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <div style={{width:48,height:48,background:`linear-gradient(135deg,${C.gold},${C.goldDark})`,borderRadius:10,display:"flex",alignItems:"center",justifyContent:"center",fontSize:24,boxShadow:`0 4px 20px rgba(255,184,28,.4)`}}>🚌</div>
          <div>
            <div style={{fontFamily:"'Rajdhani',sans-serif",fontSize:22,fontWeight:700,color:C.gold,letterSpacing:3,textTransform:"uppercase",lineHeight:1.1}}>Humphreys Transit</div>
            <div style={{fontSize:11,color:C.oliveMute,letterSpacing:2,textTransform:"uppercase"}}>Camp Humphreys · USAG Korea</div>
          </div>
        </div>

        <div style={{display:"flex",gap:3,margin:"14px 0 12px",height:4,borderRadius:2,overflow:"hidden"}}>
          {Object.values(ROUTES).map(r=>(
            <div key={r.id} style={{flex:1,background:r.color,borderRadius:2}}/>
          ))}
        </div>

        <div style={{display:"flex",gap:6}}>
          {TABS.map(([id,lbl])=>(
            <button key={id} className="tab" onClick={()=>{setTab(id);reset();}}
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
                  <div style={{fontSize:10,color:C.oliveMute,letterSpacing:1.5,textTransform:"uppercase",marginBottom:6}}>★ Favorites</div>
                  <div style={{display:"flex",gap:6,overflowX:"auto",paddingBottom:4}}>
                    {favorites.map((f,i)=>(
                      <div key={i} className="chip" style={{borderColor:C.gold+"66",color:C.khaki}}>
                        <span onClick={()=>applyFavorite(f)} style={{cursor:"pointer",display:"flex",alignItems:"center",gap:6}}>
                          <span style={{color:C.gold}}>★</span>
                          <span style={{fontWeight:600}}>{f.name}</span>
                          <span style={{color:C.oliveDim,fontSize:10}}>· {f.stop}</span>
                        </span>
                        <button className="chipx" onClick={()=>removeFavorite(i)} aria-label="Remove favorite">×</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {recent.length>0 && (
                <div>
                  <div style={{fontSize:10,color:C.oliveMute,letterSpacing:1.5,textTransform:"uppercase",marginBottom:6}}>↺ Recent</div>
                  <div style={{display:"flex",gap:6,overflowX:"auto",paddingBottom:4}}>
                    {recent.map((r,i)=>(
                      <div key={i} className="chip">
                        <span onClick={()=>applyRecent(r)} style={{cursor:"pointer",display:"flex",alignItems:"center",gap:4}}>
                          <span style={{color:C.tan}}>{r.fStop}</span>
                          <span style={{color:C.oliveDim}}>→</span>
                          <span style={{color:C.tan}}>{r.tStop}</span>
                        </span>
                        <button className="chipx" onClick={()=>removeRecent(i)} aria-label="Remove recent">×</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          <div style={{background:C.bgCard,border:`1px solid ${C.borderSub}`,borderRadius:14,padding:16,marginBottom:14}}>
            <div style={{fontSize:11,color:C.oliveMute,letterSpacing:1.5,textTransform:"uppercase",marginBottom:14}}>Type a stop name or building number</div>
            <div style={{marginBottom:10}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6,justifyContent:"space-between"}}>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <div style={{width:9,height:9,borderRadius:"50%",background:"#4dde88",boxShadow:"0 0 7px #4dde88aa"}}/>
                  <span style={{fontSize:10,color:"#4dde88",textTransform:"uppercase",letterSpacing:1.5}}>From</span>
                </div>
                {fStop && <button onClick={addFavorite} title="Save From as favorite" style={{background:"transparent",border:`1px solid ${C.gold}55`,color:C.gold,fontSize:10,padding:"2px 8px",borderRadius:10,cursor:"pointer",letterSpacing:1,textTransform:"uppercase",fontWeight:700}}>★ Save</button>}
              </div>
              <StopInput label="From" value={fLbl} onChange={(s,l)=>{setFS(s);setFL(l);reset();}}/>
            </div>
            <div style={{display:"flex",justifyContent:"center",margin:"4px 0"}}>
              <button onClick={swap} style={{background:C.bgSurface,border:`1px solid ${C.borderMain}`,borderRadius:"50%",width:32,height:32,cursor:"pointer",color:C.sage,fontSize:16,display:"flex",alignItems:"center",justifyContent:"center"}}>⇅</button>
            </div>
            <div style={{marginBottom:14}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                <div style={{width:9,height:9,borderRadius:2,background:C.gold,boxShadow:`0 0 7px ${C.gold}aa`}}/>
                <span style={{fontSize:10,color:C.gold,textTransform:"uppercase",letterSpacing:1.5}}>To</span>
              </div>
              <StopInput label="To" value={tLbl} onChange={(s,l)=>{setTS(s);setTL(l);reset();}}/>
            </div>

            {/* Time mode picker */}
            <div style={{borderTop:`1px solid ${C.borderDim}`,paddingTop:12,marginBottom:14}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                <span style={{fontSize:14}}>⏰</span>
                <span style={{fontSize:10,color:C.sage,textTransform:"uppercase",letterSpacing:1.5}}>When</span>
              </div>
              <div className="seg">
                {[["now","Leave now"],["depart","Depart at"],["arrive","Arrive by"]].map(([k,lbl])=>(
                  <button key={k} className={`segbtn ${tMode===k?"on":""}`} onClick={()=>{setTMode(k); reset();}}>{lbl}</button>
                ))}
              </div>
              {tMode !== "now" && (
                <div style={{marginTop:10}}>
                  <input type="time" className="timep" value={tTime}
                    onChange={e=>{setTTime(e.target.value); reset();}}/>
                </div>
              )}
            </div>

            <button className="btn" disabled={!fStop||!tStop} onClick={search}>Find Routes →</button>
          </div>

          <div style={{background:C.bgCard,border:`1px solid ${C.borderSub}`,borderRadius:10,padding:"10px 14px",marginBottom:14,display:"flex",gap:10}}>
            <span style={{fontSize:14}}>🏢</span>
            <div style={{fontSize:11,color:C.oliveDim,lineHeight:1.6}}>
              <span style={{color:C.tan,fontWeight:600}}>~15 building numbers mapped</span> (e.g. 6400 → Maude Hall, 5700 → PX). Full directory pending from DPW Bldg 6140.
            </div>
          </div>

          {searched && (
            <div className="si">
              {!results.trips.length ? (
                <div style={{background:C.bgCard,border:`1px solid ${C.borderSub}`,borderRadius:14,padding:28,textAlign:"center"}}>
                  <div style={{fontSize:36,marginBottom:10}}>🔍</div>
                  <div style={{fontSize:15,fontWeight:600,color:C.khaki,marginBottom:8}}>No Trips Available</div>
                  <div style={{fontSize:13,color:C.oliveDim,lineHeight:1.6}}>
                    {results.filtered.length > 0
                      ? `Possible routes are outside service hours at this time (${results.filtered.join(", ")}). Try a different time.`
                      : "No shared or 1-transfer path exists. Try selecting the Bus Terminal as a hub, or a nearby major stop."}
                  </div>
                </div>
              ) : (
                <>
                  <div style={{fontSize:11,color:C.oliveMute,letterSpacing:1.5,textTransform:"uppercase",marginBottom:12}}>
                    {results.trips.length} option{results.trips.length!==1?"s":""} found
                    {results.filtered.length>0 && <span style={{color:C.gold,marginLeft:8,textTransform:"none",letterSpacing:0}}>· {results.filtered.length} route{results.filtered.length!==1?"s":""} out of service</span>}
                  </div>
                  {results.trips.map((t,i)=><TripCard key={t.id} trip={t} rank={i}/>)}
                  <div style={{fontSize:11,color:C.oliveMute,textAlign:"center",marginTop:8,lineHeight:1.6}}>Wait times are averages (freq ÷ 2). Verify exact times at USAG Humphreys or MyArmyPost app.</div>
                </>
              )}
            </div>
          )}

          {!searched && (
            <div style={{background:C.bgCard,border:`1px solid ${C.borderSub}`,borderRadius:10,padding:"12px 14px",display:"flex",gap:10}}>
              <span style={{fontSize:16}}>ℹ️</span>
              <div style={{fontSize:11,color:C.oliveDim,lineHeight:1.6}}>
                Shuttles run Mon–Fri 0600–2200. Gold Route runs Mon–Sun 0900–2100. Out-of-service routes are filtered automatically. Confirm: DSN 755-0424.
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
              <span style={{color:C.gold}}>Gold dots</span> next to stop names = transfer points served by multiple routes.
            </div>
          </div>
          {Object.values(ROUTES).map(r=><RouteCard key={r.id} route={r}/>)}
        </div>
      )}

      {tab==="offpost" && <OffPostTab/>}
    </div>
  );
}
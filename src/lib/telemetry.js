// Anonymous usage events → the Worker's /api/e (Workers Analytics Engine).
//
// No cookies, no IDs, no coordinates, no Mapbox place names: an event is a
// name plus up to three short labels (a bus stop name, a result kind).
// Everything stays in our own Cloudflare account.
//
// Developer visits: opening the app once with ?dev=<DEV_MARK> marks this
// browser as the developer's (localStorage), and every event and API call
// from it is tagged "dev" so it can be left out of user numbers.
// ?dev=off clears the mark. The link is unlisted, not secret: anyone who
// used it would only hide their own visits.

export const DEV_MARK = "htp-builder";
const AUD_KEY = "htp.aud";

function lsGet(k) {
  try { return globalThis.localStorage?.getItem(k); } catch { return null; }
}
function lsSet(k, v) {
  try {
    if (v == null) globalThis.localStorage?.removeItem(k);
    else globalThis.localStorage?.setItem(k, v);
  } catch { /* private mode */ }
}

// Reads ?dev=… once at startup, stores the mark, and strips the parameter
// from the address bar so the link isn't shared by accident.
export function applyDevMark(loc = globalThis.location, hist = globalThis.history) {
  if (!loc) return;
  const url = new URL(loc.href);
  const v = url.searchParams.get("dev");
  if (v == null) return;
  if (v === DEV_MARK) lsSet(AUD_KEY, "dev");
  else if (v === "off") lsSet(AUD_KEY, null);
  url.searchParams.delete("dev");
  try { hist?.replaceState(hist.state, "", url.pathname + url.search + url.hash); } catch { /* ignore */ }
}

export function isDev() {
  return lsGet(AUD_KEY) === "dev";
}

// Header for our own /api/* calls, so Mapbox usage can be split by audience.
export function audienceHeaders() {
  return isDev() ? { "x-htp-aud": "dev" } : {};
}

// Visit kind for the "open" event, so reports can count new and returning
// devices without an ID. The only thing stored is the local date of the
// last open, and it never leaves the device; the event carries just the
// kind and a coarse gap bucket.
//   first  no earlier open on this device (or storage is unavailable)
//   day    first open today; gap = "1d" | "2-7d" | "8-30d" | "31d+"
//   again  opened earlier today
// Devices from before this was added have no date but do have the app's
// own humphreys.lang key; they count as "day" with gap "unknown" so the
// first week doesn't report every existing user as new.
const LAST_OPEN_KEY = "htp.lastOpen";
const LEGACY_KEY = "humphreys.lang";

function localDay(d) {
  const p = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function gapBucket(days) {
  if (days <= 1) return "1d";
  if (days <= 7) return "2-7d";
  if (days <= 30) return "8-30d";
  return "31d+";
}

// Pure read; call before anything writes humphreys.lang (a useState
// initializer), then noteVisit() once the event is sent.
export function readVisit(now = new Date()) {
  const today = localDay(now);
  const last = lsGet(LAST_OPEN_KEY);
  if (!last) return lsGet(LEGACY_KEY) != null
    ? { kind: "day", gap: "unknown", today }
    : { kind: "first", gap: "", today };
  if (last === today) return { kind: "again", gap: "", today };
  return { kind: "day", gap: gapBucket(Math.round((Date.parse(today) - Date.parse(last)) / 864e5)), today };
}

export function noteVisit(visit) {
  lsSet(LAST_OPEN_KEY, visit.today);
}

// "app" when launched from the home screen, else "browser".
export function displayMode() {
  try {
    if (globalThis.matchMedia?.("(display-mode: standalone)").matches) return "app";
    if (globalThis.navigator?.standalone) return "app"; // iOS Safari
  } catch { /* ignore */ }
  return "browser";
}

// Fire-and-forget. Never throws, never blocks the UI.
export function track(e, { lang = "", p1 = "", p2 = "", p3 = "" } = {}) {
  try {
    if (typeof window === "undefined" || typeof fetch === "undefined") return;
    fetch("/api/e", {
      method: "POST",
      keepalive: true,
      headers: { "content-type": "application/json", ...audienceHeaders() },
      body: JSON.stringify({ e, lang, p1, p2, p3 }),
    }).catch(() => {});
  } catch { /* analytics must never break the app */ }
}

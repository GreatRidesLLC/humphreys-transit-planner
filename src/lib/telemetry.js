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

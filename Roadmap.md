# Roadmap

Planned improvements grouped into phases by effort and impact. Update this file as phases complete or priorities shift.

## Distribution posture

**Status (2026-05-28):** PAO Director has not returned email outreach. Project proceeds on a standalone-PWA path until that changes. All design / copy choices that would change under MAPA integration are isolated and indexed in `docs/distribution-pivot.md`; the trademark / endorsement stance is recorded in `docs/legal-posture.md`. Roadmap phases below are labelled 5a (standalone-active, in progress), 5b (PAO-positive pivot — only if Director accepts MAPA), 5c (PAO-negative confirmation — long-term standalone).

## ✅ Shipped

- Swap button bug fix — `StopInput` now syncs local state with the parent `value` prop on every change, not just when empty
- Departure / arrival timestamps on every leg of every trip
- Depart-at / Arrive-by toggle with `<input type="time">` picker
- Service-hours filtering — routes out of service at the planned trip time are excluded from results, with a count shown ("X routes out of service")
- Estimated-vs-verified flag — `EST.` badge on any trip card whose bus legs include a route without `verified: true`. Tooltip explains the unverified status
- Smarter transfer selection — `findTrips` xfer loop now iterates every shared stop, scores total trip time per candidate, and picks the minimum (replaces the old `shared[0]` heuristic)
- Keyboard navigation in StopInput dropdown — ↑/↓ moves highlight, Enter selects, Escape closes; highlight auto-scrolls into view
- "Now" view (4th tab) — pick a stop, see the next departure on every route serving it. Gold from Bus Terminal uses verified `:00 :20 :40`; everywhere else shows `~freq ÷ 2 min` average. Out-of-service routes labeled. Auto-refreshes every minute
- Favorites & recent trips — `humphreys.favorites` and `humphreys.recent` in localStorage. Favorite chips populate just the From input; recent chips populate both From and To. `★ Save` button on the Plan form names the current From stop. `×` on each chip removes it. Recent is auto-pruned to 5, deduped by stop-pair
- Day-of-week picker — when Depart-at or Arrive-by is active, the Plan form shows a 7-day chip row (Today, Tmrw, DOW…) plus a `<input type="date">` for arbitrary future dates. The chosen day is passed to `findTrips` so Mon–Fri routes are correctly filtered on weekends and vice versa. Enables both planning ahead and weekend testing of weekday-only routes
- Korean language toggle (MVP) — `EN | 한국어` toggle in the header, persisted in `humphreys.lang` localStorage. Flat `STRINGS.en` / `STRINGS.ko` lookup keyed by string identifier (~80 strings). Noto Sans KR added alongside Rajdhani in the font stack so hangul renders correctly. Stop names and route names stay English by design. Korean strings are first-draft and need KATUSA / KSC QA before public release. Long descriptive paragraphs on the Off-Post tab (GPS infrastructure bullets, inter-garrison route descriptions) remain English — out of MVP scope
- Schedule scrape + PDF parse pipeline — `scripts/scrape_schedules.py` OCRs every per-stop PNG on the official Humphreys shuttle page (31 stops). `scripts/parse_route_pdfs.py` reads the route-level Gold/Brown/Pink PDFs (selectable text via `pdftotext -layout`). Output: `src/data/schedules.json` with per-stop, per-route, per-day timetables. `scripts/diff_schedules.py` reconciles against the `ROUTES` const and writes `scripts/diff_report.md`. MyArmyPost App has no public data feed; this is the closest authoritative source we found
- Schedule-aware wait time — `findTrips` now computes wait = `nextScheduledDeparture − userArrivalAtStop` instead of `freq ÷ 2`. For Gold/Brown/Pink the next departure comes from `schedules.json`; for other routes it falls back to a `:00`-anchor + `2 min/stop` heuristic, which still varies 0…freq instead of being a flat average
- Brown/Pink stops + freq + days/hours — replaced the placeholder 5-stop guess in each with the real 15- and 6-stop PDF data. Pink freq corrected 30 → 15. Both marked `verified: true` and Fri–Sat (Brown 1600–2200; Pink 1700–2300). `inService` handles the Fri–Sat day filter
- Blue/Green/Purple headway correction — OCR-confirmed 15-min on exclusive stops. ROUTES `freq` updated from 20/20/25 → 15
- Palette refresh ("tactical night + signal cyan") — dropped olive-as-chrome in favor of charcoal `#0a0e12` backgrounds with a cyan `#22D3EE` primary-action accent. Gold (now `#FFC83D`) is reserved for verified-PDF / Gold Route trust marks plus the logo / brand mark. Black Route's badge colour changed from whitish `#c0cfc0` to cool gunmetal `#8090a0` so it reads "dark" rather than washed-out. Olive-named keys in `C` retained as aliases for the new cool blue-grey text ramp to avoid touching every callsite. Every text/icon contrast pair still clears WCAG AA
- Building-number directory expansion — `scripts/fetch_osm_buildings.py` queries the Overpass API for every building inside the USAG Humphreys polygon (OSM way 245548245). 380 numbered buildings found; 17 with names matching a known bus stop were merged into `BUILDINGS` in `App.jsx` (15 → 32). Full dataset cached at `src/data/buildings_osm.json` for future use
- Bus-stop coordinates — `scripts/fetch_stop_coords.py` reads OSM `highway=bus_stop` nodes tagged `operator=USAG Humphreys`. 43 of 44 ROUTES stops matched to a tagged node (only `Family Housing Towers (15th Street)`, the newest Pink trial-route stop, is missing from OSM). Output: `src/data/stop_coords.json`
- Real walk time in `findTrips` — origin/destination walk legs use `haversine(building, stop)` from the OSM-sourced coords when the user picks a "Bldg N – Name" entry. Floored at 3 min for the "find the stop, board" buffer. Wait time accuracy improves directly because user-at-stop time is grounded in real distance instead of a flat 3-min mock
- Nearest stop from current location — "📍 Nearest" button next to the From input. On click, requests browser geolocation, finds the closest stop in `src/data/stop_coords.json`, and seeds the walk-leg haversine with the user's real lat/lon (not a building centroid). Permission only requested on click — never on page load. Falls back to alert on deny / timeout / no support
- Map view — fifth "📍 Map" tab. Leaflet + CARTO `dark_all` raster tiles for the tactical-night palette. Per-route polylines (straight lines between consecutive stops in `src/data/stop_coords.json`, coloured per `ROUTES[r].color`) plus circle markers at every stop, popup with route chips and "From / To" buttons that seed the Plan tab and switch. CSP updated to allow `https://*.basemaps.cartocdn.com` under `img-src`; `Permissions-Policy: geolocation=(self)` fixed (was `=()` which silently blocked the "📍 Nearest" button in production)
- Legal-posture pass + rename to "Humphreys Transit Planner" — app title, manifest, HTML `<title>`, EN + KO `appTitle` / `appSubtitle` renamed. Universal footer disclaimer rendered on every tab (EN + KO). Off-Post tab gets a larger warning banner. User-facing copy scrubbed for endorsement / affiliation language: `pdfVerified` / `verifiedScheduleHeader` reworded to "PDF-sourced", `waitDisclaimer` repointed from "USAG Humphreys / MyArmyPost app" to "Transportation Office (DSN 755-0424)", route notes and OFFPOST `schedule` strings rephrased "publicly posted PDF" instead of "official PDF". Decision record + scrub checklist in `docs/legal-posture.md`; PAO-positive revert index in `docs/distribution-pivot.md`. Asset audit confirmed no Army / USAG / DoD imagery in committed icons
- Favicon swap to brand mark — `public/favicon.svg` replaced with the same tactical-night "H" mark used by `public/icon.svg` (gold `#FFC83D` letterform on `#0a0e12` charcoal with cyan `#22D3EE` accent bar). Leftover template `public/icons.svg` removed

## Phase 4 — Data-gated features

All Phase 4 items shipped. Map / offline / licensing follow-ups have been folded into Phase 5a (offline tiles, real route polylines reframed as 5c polish) and 5b (tile licensing under USAG branding).

## Phase 5a — Standalone-active (in progress)

Work that ships regardless of PAO outcome and benefits both distribution paths.

### Push repo to hosted remote — ✅ shipped
Pushed to `github.com/Bennoah/humphreys-transit-planner`. Full-history `gitleaks detect --log-opts="--all"` scan completed pre-push (38 commits, 0 leaks). CI workflow (`.github/workflows/ci.yml`) wires gitleaks, `npm audit --audit-level=high`, eslint, build, and SBOM regen + artifact upload. Dependabot config (`.github/dependabot.yml`) covers weekly npm + github-actions updates. Remaining: branch protection on `main` (admin token), Dependabot patch auto-merge, OIDC federation (deferred until Cloudflare Pages target is wired).

### Deploy to Cloudflare Pages free tier
Default subdomain `*.pages.dev`. `public/_headers` already configured. Domain registration (DNSSEC, CAA, registrar lock — `SECURITY.md` deferral) waits until a name is chosen.

### Test framework + findTrips coverage — ✅ shipped
Pure routing logic extracted from `App.jsx` into `src/lib/routing.js` (`ROUTES`, `STOP_ROUTES`, `inService`, `serviceEndToday`, `nextScheduledDeparture`, `prevScheduledDeparture`, `findTrips`, geo helpers). Vitest wired via `npm test`. `src/lib/routing.test.js` covers: `inService` weekday/weekend/hours gating, `serviceEndToday`, route + stop index, GOLD PDF-sourced timetable at Bus Terminal, anchored heuristic for unverified routes, `findTrips` guards / direct / transfer / service-hours filter / overnight strand / arrive-by mode / clock-time ordering, walk-minute floor. CI build job now runs `npm test` after lint. Pre-commit hook still pending.

### User feedback channel
No way for users to report wrong stops, missed buses, or "this route also stops at X". MVP: footer link to email or a hosted form (Tally / Formspree). Lower-effort than GitHub issues since most users aren't on GitHub. KATUSA / KSC feedback especially valuable for Korean string QA already flagged in shipped Korean MVP — promote ahead of telemetry.

### Privacy-respecting telemetry
Currently zero signal on actual usage — roadmap priorities are guesses. Self-hosted Plausible or Umami → track route searches, stop usage, language split, tab activity. No PII, no third-party trackers (CSP already locks down `connect-src` and `script-src`). Required CSP update when added.

### Per-route schedule lookup for Blue / Black / Green / Orange / Purple
Mostly done: Gold/Brown/Pink consult `src/data/schedules.json` directly in `findTrips`. The remaining five routes still use the `:00`-anchor + 2-min/stop heuristic because the per-stop PNG schedules can't be reliably split per-route by tesseract (panels are colour-coded, not labelled with the route name in OCR'd text). Options to close the gap: (a) request per-route PDFs from the Transportation Office (DSN 755-0424) — bundle with the Black/Orange headway + Blue/Green/Purple service-hour ask, (b) use a per-panel image-crop pipeline (needs OpenCV / Pillow), or (c) manual transcription from the public shuttle page. Drop `goldDisclaimer` string once all eight routes have data.

### Black / Orange headway + Blue / Green / Purple service-hour bounds
Same Transportation Office ask as the per-route schedules above; combining them keeps it to one inquiry. ROUTES `freq` for Black (25) / Orange (30) is unverified; Blue / Green / Purple service-hour bounds still placeholder `0600–2200`.

### Family Housing Towers (15th St) stop coord
Lone gap in `src/data/stop_coords.json` (43 of 44 ROUTES stops have OSM coords). Newest Pink-route trial stop — hand-pin on satellite imagery.

### iOS-compatible PWA icons (PNG raster set)
PWA manifest currently uses `public/icon.svg` for all icon entries. Chrome / Firefox / Edge render SVG icons fine. iOS Safari ignores SVG manifest icons and falls back to a generic glyph on home-screen install. Adding `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, and `apple-touch-icon.png` (180×180) would close the gap. Blocked locally because `sharp` segfaults on this WSL2 kernel (bus error on library load). Options when revisiting: generate icons on a non-WSL machine, install `@resvg/resvg-js` and retry, or use ImageMagick / Inkscape via shell.

### Semantic landmark refactor
A11y pass added aria roles + states. Skipped: wrapping the header / nav / main / tab-panel regions in proper semantic elements (`<header>`, `<nav>`, `<main>`, `role="tabpanel"`). Requires touching the top-level layout in `App.jsx` and is best done as a separate commit to keep the diff reviewable.

### Offline map tile caching
CARTO tiles fetch at runtime. App still installs offline; the map shows a grey panel until network returns. A workbox `runtimeCaching` entry would cache visited tiles. Add when complaints arrive — low priority while user base is small.

### Loop directionality (low priority)
Many routes are loops; current code uses `Math.abs(ti - fi)` which assumes you can travel either direction. Correcting this requires authoritative direction data from the schedule PDFs, and the payoff is low (edge cases only). Park until someone reports a wrong-direction bug.

## Phase 5b — PAO-positive pivot (only triggered if Director accepts MAPA)

Work that only makes sense if the PAO Director responds positively and accepts MyArmyPost App integration. File / line index lives in `docs/distribution-pivot.md`; do not start any of these until PAO outcome is confirmed.

### Rename revert + disclaimer softening
"Humphreys Transit Planner" → "Humphreys Transit". Universal footer copy replaced with PAO-supplied attribution. Off-Post tab banner removed. "PDF-sourced" tooltip wording flipped back to "PDF-verified". One commit, all string changes. See `docs/distribution-pivot.md` for the file / line table.

### MAPA embed chrome (`?embed=1`)
Single conditional in `App.jsx`: read `URLSearchParams(window.location.search).get('embed')`, skip header + tabs row + universal footer when set. Lets MAPA WebView path go live without re-architecting.

### CSP `frame-ancestors` swap + `X-Frame-Options` removal
`public/_headers`: `frame-ancestors 'none'` → `frame-ancestors <MAPA origin>`. Remove `X-Frame-Options: DENY` (legacy header conflicts with `frame-ancestors`). Updates `SECURITY.md` "Trademark / endorsement posture" subsection in tandem.

### Map tile licensing review
CARTO `dark_all` is free for non-commercial use with attribution (now in the leaflet attribution control). If MAPA ships under USAG branding, the licence note needs an update — possibly a paid CARTO plan or switch to a self-hosted basemap.

### ATO / RMF / STIG paperwork
Triggered only when MAPA path goes live and the host system requires an Authority to Operate package. Tracked in `SECURITY.md` "Controls deferred to MAPA-positive branch". Could be weeks of paperwork; defer until truly needed.

### Brand verification with PAO
Tactical-night + signal-cyan palette shipped. PAO buy-in needed before MAPA chrome integration — confirm the look meets DoD brand regs once integration is on the table.

## Phase 5c — PAO-negative confirmation (long-term standalone)

If the Director declines, or the >90-day silence becomes definitive:

- Lock in standalone posture; remove "PAO-positive pivot" tasks from active tracking.
- Register a non-`.army.mil` domain (e.g. `humphreys-transit.app`); apply DNS hardening (DNSSEC, CAA, registrar lock).
- Promote the universal disclaimer footer into a standalone "About" page or section (currently inline-only).
- Real route polylines (Overpass `route=bus` query) become more worth-it for long-term polish — straight lines convey topology fine but a polished standalone PWA can justify the work.

## Known data gaps

- Black, Orange: 15-min headway unconfirmed — no stops served exclusively by either route in the per-stop image directory. Current `freq` of 25 / 30 is unverified
- Blue / Green / Purple: headway confirmed 15 min, but service-hour bounds still placeholder `0600–2200`
- Inter-garrison routes: PDFs need re-download (Incheon Airport schedule updated Feb 2026)
- Building directory: 32 mapped in `BUILDINGS` (high-confidence stop assignments). 380 known to exist on-post per OSM; remaining ~350 are blocked on stop coordinates for a "nearest stop" heuristic. Many of those have OSM `name` tags (e.g. "Zoeckler Fitness Center", "Heartbreak Ridge Tower") that could be hand-assigned to a stop, but doing so without coordinates risks systematic errors
- Stop coordinates: 43 of 44 ROUTES stops have OSM-sourced lat/lon in `src/data/stop_coords.json`. Family Housing Towers (15th Street) — the newest Pink-route stop — is the lone gap; needs hand-pinning on a satellite map
- Holiday / training-holiday schedule variations: Brown/Pink panels capture them; other routes still treat training holidays as ordinary weekdays
- New stops not yet in `BUILDINGS`: Downtown Plaza, Family Mini Mall / Gas Station, Family Housing Towers (15th Street) — building numbers unknown
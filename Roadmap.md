# Roadmap

Launch-focused. Target public release **~2026-08-26** (one month from 2026-07-26). Anything not on the Launch list is post-launch polish unless it becomes a blocker.

## Distribution posture

**Status (2026-06-19):** PAO Director Nagan approved standalone app on MAPA non-compete basis. Project proceeds on standalone-PWA path; MAPA pivot work is contingency only (do not start unless PAO re-opens the conversation). Trademark / endorsement stance recorded in `docs/legal-posture.md`; MAPA-pivot file index preserved in `docs/distribution-pivot.md`.

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
- Korean language toggle (MVP) — `EN | 한국어` toggle in the header, persisted in `humphreys.lang` localStorage. Flat `STRINGS.en` / `STRINGS.ko` lookup keyed by string identifier (~80 strings). Noto Sans KR added to the sans stack so hangul renders correctly (the stack is now Avenir Next → Nunito Sans → Noto Sans KR; Rajdhani retired 2026-08-23), and `<html lang>` follows the toggle. Stop names and route names stay English by design. Korean strings are first-draft and need KATUSA / KSC QA before public release. Long descriptive paragraphs on the Off-Post tab (GPS infrastructure bullets, inter-garrison route descriptions) remain English — out of MVP scope
- Schedule scrape + PDF parse pipeline — `scripts/scrape_schedules.py` OCRs every per-stop PNG on the official Humphreys shuttle page (31 stops). `scripts/parse_route_pdfs.py` reads the route-level Gold/Brown/Pink PDFs (selectable text via `pdftotext -layout`). Output: `src/data/schedules.json` with per-stop, per-route, per-day timetables. `scripts/diff_schedules.py` reconciles against the `ROUTES` const and writes `scripts/diff_report.md`. MyArmyPost App has no public data feed; this is the closest authoritative source we found
- Schedule-aware wait time — `findTrips` now computes wait = `nextScheduledDeparture − userArrivalAtStop` instead of `freq ÷ 2`. For Gold/Brown/Pink the next departure comes from `schedules.json`; for other routes it falls back to a `:00`-anchor + `2 min/stop` heuristic, which still varies 0…freq instead of being a flat average
- Brown/Pink stops + freq + days/hours — replaced the placeholder 5-stop guess in each with the real 15- and 6-stop PDF data. Pink freq corrected 30 → 15. Both marked `verified: true` and Fri–Sat (Brown initially lumped 1600–2200 Fri–Sat, later split to Fri 1900–2200 · Sat 1600–2200; Pink 1700–2300). `inService` handles the Fri–Sat day filter
- Blue/Green/Purple headway correction — OCR-confirmed 15-min on exclusive stops. ROUTES `freq` updated from 20/20/25 → 15
- Multi-window ROUTES `schedule` field + Green/Purple/Brown day/hour corrections — added optional `schedule:[{dow, from, to, freq?}]` on `ROUTES` for service windows that vary by day-of-week or cross midnight (`to > "24:00"` = overnight). `inService`, `serviceEndToday`, `anchoredHeuristic` prefer the new field; legacy `days` + `hours` remain as human-facing display strings. Corrections from newly obtained on-post posters (Exhibit #0022 + Green/Brown posters): **PURPLE** now Mon–Thu 19:00–22:45 · Fri 19:00–01:30 · Sat 09:00–01:30 · Sun 09:00–22:45 (was wrongly modeled as Mon–Fri 06:00–22:00); **GREEN** now Mon–Fri 07:00–22:00 @ 15-min + Sat–Sun 07:00–23:00 @ 30-min (weekend service was missing entirely); **BROWN** Fri window tightened from 16:00–22:00 to 19:00–22:00. Green + Purple flipped `verified: true`. Routes tab banner copy also corrected (old text claimed non-existent "gold dots" for transfer points — actual UI is cyan route-name labels)
- PURPLE per-stop timetable in `schedules.json` — Exhibit #0022 poster transcribed for all 10 Purple stops × 4 day-types. Overnight arrivals bucketed under the *arrival* day-of-week (Fri 23:45 dispatch reaching BDAACH at 00:12 Sat lives under BDAACH's SATURDAY key), matching how `searchSchedule` resolves day-of-week. Reproducible via `scripts/gen_purple_schedule.py` (Bus Terminal cadence + per-stop offsets in the script header). Fixes heuristic error at Brian D. Allgood Hospital (was off by up to 27 min — the loop endpoint)
- GOLD Mon–Fri + Sat + Sun per-stop timetables in `schedules.json` — Exhibit #0019 (2026-08-20 photo retake) transcribed for 10 confirmed stops × 3 day-types. Fixes a prior encoding bug where GOLD used `MONDAY-SATURDAY` key but `pickDayType` correctly narrows Saturday to the shorter `SATURDAY` list (which held only 3 stray times → broken Sat lookup). New encoding uses `MONDAY-FRIDAY` + `SATURDAY` + `SUNDAY` explicitly. `ROUTES.GOLD` gained a proper `schedule` field (Mon–Fri 09-2045 · Sat 09-2045 · Sun 09-1905) replacing the stale flat 0900–2100 window. Reproducible via `scripts/gen_gold_schedule.py`. Stop-name aliases added: new `STOP_ALIASES` map in `routing.js` + wired into `SEARCH_INDEX` in `App.jsx` so poster labels ("New PX", "Barrack 6800s", "Collier Gym", …) resolve to canonical names. 7 additional stops from the poster (CAC, USO, O-6 Housing, Family Housing Twr 1/2/3, Sentry Village PX) omitted pending name verification — see Known data gaps
- PURPLE re-shoot QA — all 9 photos of Exhibit #0022 (2026-08-20 retake) cross-checked against `gen_purple_schedule.py` output for Sun trips 1-20 + 41-56 and Sat trips 41-60. All 10 stop offsets, all dispatch times, and overnight bucketing (Sat 23:45 dispatch → BDAACH at 00:12 lives under SUNDAY key) confirmed accurate. No changes needed
- BROWN schedule bug fix (2026-08-20 photo retake QA) — original hand-transcription dropped the Fri 22:00 dispatch and the Sat 19:00 / 19:30 / 22:00 dispatches at every one of the 15 Brown stops (Fri went from 7 → 6 entries per stop; Sat went from 13 → 10). `scripts/gen_brown_schedule.py` now regenerates all BROWN entries from BT dispatches + per-stop offsets, matching `brown-route.jpg` exactly. `ROUTES.BROWN.schedule` window widened Fri 22:00 → 23:15 and Sat 22:00 → 23:15 to keep the last dispatch's ~73-min circuit in service instead of `inService` filtering it out
- GREEN Bus Terminal per-stop timetable — `scripts/gen_green_schedule.py` writes real BT dispatches from `green-route-1.jpg` (Mon–Fri 15-min :00 :15 :30 :45 · Sat/Sun 30-min :00 :30, 07:00 through 22:00 / 23:00). Only Bus Terminal covered; per-stop times for the other 19 Green stops still use the heuristic (posters do not publish per-stop times). Return-visit poster (`green-route-2.jpg`, 48-min-offset :03 :18 :33 :48 pattern) intentionally not merged in — including return-direction times at BT would tempt riders onto a wrong-direction bus given `findTrips` uses a linear stop-index model
- Palette refresh ("tactical night + signal cyan") — dropped olive-as-chrome in favor of charcoal `#0a0e12` backgrounds with a cyan `#22D3EE` primary-action accent. Gold (now `#FFC83D`) is reserved for verified-PDF / Gold Route trust marks plus the logo / brand mark. Black Route's badge colour changed from whitish `#c0cfc0` to cool gunmetal `#8090a0` so it reads "dark" rather than washed-out. Olive-named keys in `C` retained as aliases for the new cool blue-grey text ramp to avoid touching every callsite. Every text/icon contrast pair still clears WCAG AA. **Superseded 2026-08-23** by the shadcn/ui redesign — light-default zinc palette, flat borders, no cyan chrome; gold survives only as the PDF-sourced marker. See `docs/design-handoff-shadcn-redesign.md`
- Building-number directory expansion — `scripts/fetch_osm_buildings.py` queries the Overpass API for every building inside the USAG Humphreys polygon (OSM way 245548245). 380 numbered buildings found; 17 with names matching a known bus stop were merged into `BUILDINGS` in `App.jsx` (15 → 32). Full dataset cached at `src/data/buildings_osm.json` for future use
- Bus-stop coordinates — `scripts/fetch_stop_coords.py` reads OSM `highway=bus_stop` nodes tagged `operator=USAG Humphreys`. 43 of 44 ROUTES stops matched to a tagged node (only `Family Housing Towers (15th Street)`, the newest Pink trial-route stop, is missing from OSM). Output: `src/data/stop_coords.json`
- Real walk time in `findTrips` — origin/destination walk legs use `haversine(building, stop)` from the OSM-sourced coords when the user picks a "Bldg N – Name" entry. Floored at 3 min for the "find the stop, board" buffer. Wait time accuracy improves directly because user-at-stop time is grounded in real distance instead of a flat 3-min mock
- Nearest stop from current location — "📍 Nearest" button next to the From input. On click, requests browser geolocation, finds the closest stop in `src/data/stop_coords.json`, and seeds the walk-leg haversine with the user's real lat/lon (not a building centroid). Permission only requested on click — never on page load. Falls back to alert on deny / timeout / no support
- Map view — fifth "📍 Map" tab. Leaflet + CARTO `dark_all` raster tiles for the tactical-night palette. Per-route polylines (straight lines between consecutive stops in `src/data/stop_coords.json`, coloured per `ROUTES[r].color`) plus circle markers at every stop, popup with route chips and "From / To" buttons that seed the Plan tab and switch. CSP updated to allow `https://*.basemaps.cartocdn.com` under `img-src`; `Permissions-Policy: geolocation=(self)` fixed (was `=()` which silently blocked the "📍 Nearest" button in production). **Retired 2026-08-22** — pulled as half-baked (straight-line polylines convey nothing beyond topology, on-post tile licensing unresolved, no live bus positions). Implementation parked on branch `archive/map-tab` (see `PARKED.md` on that branch). Leaflet dep removed; CSP tightened to drop the CARTO origin; `Permissions-Policy: geolocation=(self)` retained for the Plan tab's "📍 Nearest" button
- Legal-posture pass + rename to "Humphreys Transit Planner" — app title, manifest, HTML `<title>`, EN + KO `appTitle` / `appSubtitle` renamed. Universal footer disclaimer rendered on every tab (EN + KO). Off-Post tab gets a larger warning banner. User-facing copy scrubbed for endorsement / affiliation language: `pdfVerified` / `verifiedScheduleHeader` reworded to "PDF-sourced", `waitDisclaimer` repointed from "USAG Humphreys / MyArmyPost app" to "Transportation Office (DSN 755-0424)", route notes and OFFPOST `schedule` strings rephrased "publicly posted PDF" instead of "official PDF". Decision record + scrub checklist in `docs/legal-posture.md`; PAO-positive revert index in `docs/distribution-pivot.md`. Asset audit confirmed no Army / USAG / DoD imagery in committed icons
- Favicon swap to brand mark — `public/favicon.svg` replaced with the same tactical-night "H" mark used by `public/icon.svg` (gold `#FFC83D` letterform on `#0a0e12` charcoal with cyan `#22D3EE` accent bar). Leftover template `public/icons.svg` removed
- Family Housing Towers (15th St) stop coord — hand-pinned to `36.9556, 127.0158` (SW terminus of 15th Street OSM way 1019688918). Closes the last stop-coord gap; `_meta.matched` in `src/data/stop_coords.json` now 44/44. Enables Pink-route walk-leg haversine + Nearest-stop coverage. Test coverage added in `src/lib/routing.test.js`
- Accurate `shuttleInfo` copy — old string only mentioned weekday routes + Gold, omitting Brown (Fri–Sat 1600–2200) and Pink (Fri–Sat 1700–2300). Korean version also had reversed range `일–월` (Sun–Mon) for Gold. New EN + KO strings list all four service buckets
- Semantic landmark refactor — top-level regions wrapped in `<header>`, `<nav>`, `<main>`, `role="tabpanel"` (shipped 2026-07-25)
- Repo pushed to hosted remote — `github.com/GreatRidesLLC/humphreys-transit-planner`; full-history gitleaks scan clean; CI wires gitleaks, `npm audit --audit-level=high`, eslint, build, SBOM regen; Dependabot weekly npm + github-actions
- Test framework + `findTrips` coverage — pure routing logic extracted to `src/lib/routing.js`; vitest wired via `npm test`; `src/lib/routing.test.js` covers `inService`, `serviceEndToday`, scheduled + heuristic departure, `findTrips` direct/transfer/service-hours/overnight/arrive-by/walk-floor. CI runs `npm test` after lint
- User feedback channel — Tally hosted form (https://tally.so/r/dWGWEN) linked from footer on every tab in both EN + KO (`feedbackLink` string). Opens in new tab (`target="_blank" rel="noopener noreferrer"`); no CSP change required (no iframe, no fetch). Form authored 2026-08-19 with 6 bilingual fields (EN + KO labels): Type of feedback (multi-choice, required), Route (short text), Stop (short text), Details (long text, required), Language (multi-choice, required), Email (optional). Title "Humphreys Transit Planner — Feedback / 피드백"; description carries the non-affiliation disclaimer; CAPTCHA + email-on-submit to project inbox enabled
- iOS PWA PNG icons — `public/icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `apple-touch-icon.png` (180×180) generated from `public/icon.svg` via `scripts/gen_icons.sh` (rsvg-convert / librsvg2-bin — `sharp` still segfaults on WSL2 kernel). Maskable variant uses a padded SVG (`public/icon-maskable.svg`) scaled to 60% inside a solid charcoal bg to survive all mask shapes. Manifest + `apple-touch-icon` `<link>` repointed to PNG; SVG kept as fallback. Workbox `globPatterns` extended to precache `*.png`
- Custom domain + DNS hardening (2026-08-21) — `humphreysbus.app` registered via Cloudflare Registrar (~$14/yr, WHOIS privacy on by default). Attached to the `humphreys-transit-planner` Workers project as an apex Custom Domain; CF-issued edge cert from Google Trust Services (`.app` TLD default). CF Edge Certificate Authority pinned to Google Trust Services to prevent silent CA rotation. DNSSEC enabled — DS pushed to the `.app` registry, resolver returns `ad` flag confirming validation. CAA records restrict issuance to `pki.goog` (matches pinned CA) and `letsencrypt.org` (backup) with `iodef mailto:emmanuel.bayere@gmail.com` for violation reports. Registrar transfer-lock on (CF Registrar default). `README.md`, `docs/deploy.md`, `docs/distribution-pivot.md`, `docs/legal-posture.md`, `SECURITY.md` updated to reflect the live URL and hardening posture
- Throttled post-trip feedback nudge (2026-08-22) — dismissible strip under Plan-tab results linking the Tally form; shows only after ≥3 successful plans, snoozes 21 days on click / 60 days on dismiss (`htp_planCount` / `htp_nudgeSnoozedUntil` in localStorage). Bilingual strings; no CSP change. CI also now runs on `dev` pushes + PRs (was `main`-only), making the dev branch-protection check real
- Static-first backend decision (2026-08-22) — Convex evaluated and rejected; app stays a fully static PWA. See `docs/adr/0001-static-first-no-backend.md`

## Launch — target ~2026-08-26

Ship-blockers only. Everything here must land (or be deliberately cut with a reason) before the public URL goes live.

### Deploy to Cloudflare Workers Static Assets (prod + preview)
Custom domain `humphreysbus.app` live on the `main` branch (see Shipped). `wrangler.jsonc` at repo root drives Workers Builds (see [[cf_workers_config]]). Wire:
- Production branch = `main` → `https://humphreysbus.app`
- Preview branch = `dev` → `dev.humphreys-transit-planner.<subdomain>.workers.dev`
- All other branches build previews on push, do not surface to end users
- Verify `public/_headers` applies on both envs; smoke-test CSP, geolocation permission-policy
- Add production URL to `README.md` + repo About

### Transportation Office data inquiry (single email)
One inquiry to DSN 755-0424 bundling three asks:
1. Black / Orange headway (currently unverified `freq` of 25 / 30)
2. Blue service-hour bounds (currently placeholder `0600–2200`). Green + Purple resolved via on-post posters (see Shipped)
3. Per-route PDFs for Blue / Black / Orange (Gold Exhibit #0019 + Green + Purple posters photographed on-site)

Send week 1. If no reply by week 3 → ship with current `EST.` badges (already handled by the estimated-vs-verified UI). Do not block launch on reply.

### Git workflow — prod-like with dev branch
Establish before the first Cloudflare deploy so preview URLs behave predictably:

```
main       ← production (Cloudflare Workers Builds prod)
  ↑ PR (release)
dev        ← integration / preview (Cloudflare Workers Builds preview)
  ↑ PR (feature)
feat/*     ← short-lived feature branches
```

- Feature branches off `dev`, PR into `dev`
- `dev` auto-deploys to a stable preview URL for smoke testing
- Release = PR `dev` → `main`, squash-merge, tag `vX.Y.Z`
- Hotfix = branch off `main`, PR → `main`, cherry-pick back to `dev`
- Branch protection: both `main` + `dev` require PR + CI green (both protected as of 2026-08-21)
- See [[feedback_branching]] — never commit to `main` directly

## Post-launch (v1.1+)

Nice-to-haves that improve the app but do not gate launch.

### Korean string QA (KATUSA / KSC)
First-draft translations flagged in shipped Korean MVP. Route + stop names stay English by design; long descriptive paragraphs on Off-Post remain English (out of MVP scope). Actively solicit a native reviewer via the launched feedback channel. Label Korean toggle as beta in v1 if reviewer not yet secured.

### Privacy-respecting telemetry
Currently zero signal on actual usage — priorities are guesses. Self-hosted Plausible or Umami → track route searches, stop usage, language split, tab activity. No PII, no third-party trackers (CSP already locks down `connect-src` and `script-src`). Required CSP update when added. High-value once real users show up.

### GPS / BusWhere outreach
Off-Post tab describes what real-time tracking would need. Actual outreach: Transportation (DSN 755-0424) about GPS trackers or BusWhere (deployed at Osan Air Base) as a faster path than custom hardware. Requires G6/S6 + DoD-approved backend — long lead time. Fire off inquiry post-launch; treat responses as bonus.

### Per-route schedule fallback for the remaining unverified routes
If Transportation Office does not supply per-route PDFs in the launch inquiry: (a) per-panel image-crop pipeline (needs OpenCV / Pillow) on the public per-stop PNGs, or (b) manual transcription. Gold weekday + Green + Purple resolved from on-post posters (Green BT only; per-stop pending). Blue / Black / Orange remain fully unverified. Drop `goldDisclaimer` string once all eight routes have real schedule data.

### Loop directionality
Many routes are loops; current code uses `Math.abs(ti - fi)` which assumes bidirectional travel. Correcting requires authoritative direction data from schedule PDFs; payoff is edge cases only. Park until a wrong-direction bug is reported.

### Standalone "About" page
Promote universal disclaimer footer into a standalone About page or section (currently inline-only in the footer).

### Google Play Store listing (via TWA)
Wrap the PWA as a Trusted Web Activity using Google's `bubblewrap` CLI, publish to Play Console. One-time $25 Play developer account. Update flow stays push-to-deploy for the app itself — the store binary is only rebuilt on version bumps. Trigger: post-launch traction data shows KATUSA / soldier / KSC users searching "Humphreys" in the Play Store and not finding the PWA install prompt. Watch-out: a Play listing sitting next to MAPA (`mil.aswf.garrison`) in store search may re-open the PAO non-compete conversation Nagan closed 2026-06-19 (see `docs/legal-posture.md`, [[nagan_mapa_coexistence]]); do not proceed without re-confirming standalone posture with PAO. Trademark exposure also higher on a public store listing than on a URL — endorsement-scrub already applied to user copy, but the store listing itself (title, short description, screenshots) needs the same pass before submission.

### Apple App Store — deferred indefinitely
Higher friction than Play (native wrapper required per Apple Guideline 4.2 — pure WebViews rejected; Capacitor / WKWebView + minimal native code needed), $99/yr Apple Developer account, 1–7 day review per update. iOS PWA install (Safari → Add to Home Screen → runs standalone with the shipped `apple-touch-icon`) already covers the core install path for iOS users. Revisit only if a specific iOS-heavy user cluster surfaces via feedback and Safari install is proven insufficient. Also inherits the trademark + MAPA non-compete watch-outs above.

## Contingency — MAPA re-open

Do NOT start unless PAO re-opens the MAPA-integration conversation. Nagan approved standalone on non-compete basis 2026-06-19 (see [[nagan_mapa_coexistence]]); this branch of work is preserved for optionality only. File / line index lives in `docs/distribution-pivot.md`.

- Rename revert + disclaimer softening (Humphreys Transit Planner → Humphreys Transit; footer copy per PAO attribution)
- MAPA embed chrome (`?embed=1` conditional in `App.jsx` skips header + tabs + footer)
- CSP `frame-ancestors` swap + `X-Frame-Options` removal
- Map tile licensing review (CARTO paid plan or self-hosted basemap under USAG branding)
- ATO / RMF / STIG paperwork
- Brand verification with PAO

## Known data gaps

- Black, Orange: 15-min headway unconfirmed — no stops served exclusively by either route in the per-stop image directory. Current `freq` of 25 / 30 is unverified
- Blue: headway confirmed 15 min, but service-hour bounds still placeholder `0600–2200`. Green + Purple resolved via on-post posters (see Shipped)
- Green per-stop timetables: only Bus Terminal has PDF-sourced times in `schedules.json` (`scripts/gen_green_schedule.py`). Other 19 Green stops still use the 2-min-per-stop heuristic. Requires a per-stop timetable photo (the Green route diagram posters photographed 2026-08-20 show only BT dispatches)
- Gold stop-name verification: Exhibit #0019 photos (2026-08-20 retake) include 7 stops whose canonical names / physical mapping remain unverified. Omitted from `gen_gold_schedule.py` pending walk-through or Transportation Office confirmation:
  - `CAC` (S117) — full name? "Central Access Control"?
  - `USO` (S103) — is this "USO Sentry Village" (OSM building #301)?
  - `Family Housing Twr 1/2/3` (S2083/S5072/S5103 outbound; S5061/S5070/? return) — how do these map to existing `Family Housing Towers (Tropic Lightning Ave)` / `(Taro Ave)` entries? Is Twr 3 new?
  - `O-6 Housing` (no visible ID) — canonical name?
  - `Sentry Village PX` (S451) — separate from existing `Sentry Village Burger King` and `Sentry Village Mini Mall` (which are also two distinct stops); confirm which physical shop
- Inter-garrison routes: PDFs need re-download (Incheon Airport schedule updated Feb 2026)
- Building directory: 32 mapped in `BUILDINGS` (high-confidence stop assignments). 380 known to exist on-post per OSM; remaining ~350 are blocked on stop coordinates for a "nearest stop" heuristic. Many of those have OSM `name` tags (e.g. "Zoeckler Fitness Center", "Heartbreak Ridge Tower") that could be hand-assigned to a stop, but doing so without coordinates risks systematic errors
- Stop coordinates: all 44 ROUTES stops have coords in `src/data/stop_coords.json` (43 OSM-sourced, 1 hand-pinned for the new Pink-route trial stop)
- Holiday / training-holiday schedule variations: Brown/Pink panels capture them; other routes still treat training holidays as ordinary weekdays
- New stops not yet in `BUILDINGS`: Downtown Plaza, Family Mini Mall / Gas Station, Family Housing Towers (15th Street) — building numbers unknown
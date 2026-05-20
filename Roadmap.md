# Roadmap

Planned improvements grouped into phases by effort and impact. Update this file as phases complete or priorities shift.

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
- Bus-stop coordinates — `scripts/fetch_stop_coords.py` reads OSM `highway=bus_stop` nodes tagged `operator=USAG Humphreys`. 43 of 44 ROUTES stops matched to a tagged node (only `Family Housing Towers (15th Street)`, the newest Pink trial-route stop, is missing from OSM). Output: `src/data/stop_coords.json`. Phase 4 dependency now satisfied

## Phase 4 — Data-gated features

Coordinate dependency satisfied by `src/data/stop_coords.json` (OSM-sourced). Build in this order:

### Nearest stop from current location
Browser geolocation API → haversine distance → auto-fill From with nearest stop. Permission UX matters (don't ask on first load).

### Map view
Base map (Leaflet or MapLibre), stop markers, route polylines, optional fit-to-route. Bigger lift than nearest stop. Map tile licensing question for on-post use needs answering before shipping publicly.

## Phase 5 — Deferred

### Loop directionality
Many routes are loops; current code uses `Math.abs(ti - fi)` which assumes you can travel either direction. Correcting this requires authoritative direction data from the schedule PDFs, and the payoff is low (edge cases only). Park until someone reports a wrong-direction bug.

### Brand verification with PAO
Tactical-night + signal-cyan palette shipped. Needs PAO buy-in before public release — confirm the new look doesn't run afoul of DoD brand regs alongside the existing "Humphreys" name + Army identity disclaimer in [[distribution-options]].

### Per-route schedule lookup for Blue / Black / Green / Orange / Purple
Mostly done: Gold/Brown/Pink consult `src/data/schedules.json` directly in `findTrips`. The remaining five routes still use the `:00`-anchor + 2-min/stop heuristic because the per-stop PNG schedules can't be reliably split per-route by tesseract (panels are colour-coded, not labelled with the route name in OCR'd text). Options to close the gap: (a) request per-route PDFs from the Transportation Office, (b) use a per-panel image-crop pipeline (needs OpenCV / Pillow), or (c) manual transcription from the official site. Drop `goldDisclaimer` string once all eight routes are verified.

### Test framework + findTrips coverage
No tests yet. `findTrips` is the heart of routing logic and refactor risk grows as schedule data lands. Add Vitest, write a fixture-driven suite covering: direct routes, transfer routes (validate the score-min transfer selection), service-hours filtering, day-of-week filtering, Gold verified-departure path, edge cases (same from/to stop, no path). Run on pre-commit and in CI once remote is set up.

### Privacy-respecting telemetry
Currently zero signal on actual usage — roadmap priorities are guesses. Self-hosted Plausible or Umami → track route searches, stop usage, language split, tab activity. No PII, no third-party trackers (CSP already locks down `connect-src` and `script-src`). Required CSP update when added. Informs Phase 4 prioritization (nearest stop vs map view).

### User feedback channel
No way for users to report wrong stops, missed buses, or "this route also stops at X". MVP: footer link to email or a hosted form (Tally / Formspree). Lower-effort than GitHub issues since most users aren't on GitHub. KATUSA / KSC feedback especially valuable for Korean string QA already flagged in shipped Korean MVP.

### Legal / branding verification
Uses "Humphreys" name + Army olive palette. DoD brand regs unknown — verify with PAO at the meeting (see [[distribution-options]]). Add explicit "Unofficial, not endorsed by USAG Humphreys" disclaimer in footer if PAO confirms standalone path. ATO/RMF paperwork only triggers if MAPA path is chosen.

### iOS-compatible PWA icons (PNG raster set)
PWA manifest currently uses `public/icon.svg` for all icon entries. Chrome / Firefox / Edge render SVG icons fine. iOS Safari ignores SVG manifest icons and falls back to a generic glyph on home-screen install. Adding `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, and `apple-touch-icon.png` (180×180) would close the gap. Blocked locally because `sharp` segfaults on this WSL2 kernel (bus error on library load). Options when revisiting: generate icons on a non-WSL machine, install `@resvg/resvg-js` and retry, or use ImageMagick/Inkscape via shell.

### Semantic landmark refactor
A11y pass added aria roles + states. Skipped: wrapping the header / nav / main / tab-panel regions in proper semantic elements (`<header>`, `<nav>`, `<main>`, `role="tabpanel"`). Requires touching the top-level layout in `App.jsx` and is best done as a separate commit to keep the diff reviewable.

## Known data gaps

- Black, Orange: 15-min headway unconfirmed — no stops served exclusively by either route in the per-stop image directory. Current `freq` of 25 / 30 is unverified
- Blue / Green / Purple: headway confirmed 15 min, but service-hour bounds still placeholder `0600–2200`
- Inter-garrison routes: PDFs need re-download (Incheon Airport schedule updated Feb 2026)
- Building directory: 32 mapped in `BUILDINGS` (high-confidence stop assignments). 380 known to exist on-post per OSM; remaining ~350 are blocked on stop coordinates for a "nearest stop" heuristic. Many of those have OSM `name` tags (e.g. "Zoeckler Fitness Center", "Heartbreak Ridge Tower") that could be hand-assigned to a stop, but doing so without coordinates risks systematic errors
- Stop coordinates: 43 of 44 ROUTES stops have OSM-sourced lat/lon in `src/data/stop_coords.json`. Family Housing Towers (15th Street) — the newest Pink-route stop — is the lone gap; needs hand-pinning on a satellite map
- Holiday / training-holiday schedule variations: Brown/Pink panels capture them; other routes still treat training holidays as ordinary weekdays
- New stops not yet in `BUILDINGS`: Downtown Plaza, Family Mini Mall / Gas Station, Family Housing Towers (15th Street) — building numbers unknown
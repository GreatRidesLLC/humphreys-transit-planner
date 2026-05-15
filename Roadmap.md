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

## Phase 4 — Data-gated features

Both blocked by the same dependency: lat/long coordinates for every bus stop. Source candidates:

- DPW GIS office (Bldg 6140) likely has them already in their installation GIS
- Otherwise, pin ~80 stops manually on a satellite map in an afternoon

Once coordinates exist, build in this order:

### Nearest stop from current location
Browser geolocation API → haversine distance → auto-fill From with nearest stop. Permission UX matters (don't ask on first load).

### Map view
Base map (Leaflet or MapLibre), stop markers, route polylines, optional fit-to-route. Bigger lift than nearest stop. Map tile licensing question for on-post use needs answering before shipping publicly.

## Phase 5 — Deferred

### Loop directionality
Many routes are loops; current code uses `Math.abs(ti - fi)` which assumes you can travel either direction. Correcting this requires authoritative direction data from the schedule PDFs, and the payoff is low (edge cases only). Park until someone reports a wrong-direction bug.

## Known data gaps

- Brown, Pink: stops estimated, no PDFs verified
- Blue, Black, Green, Orange, Purple: stops listed, frequencies estimated
- Inter-garrison routes: PDFs need re-download (Incheon Airport schedule updated Feb 2026)
- Building directory: ~15 mapped of unknown total
- Stop coordinates: none yet (blocks Phase 4)
- Holiday / training-holiday schedule variations: not represented anywhere
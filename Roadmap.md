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

## Phase 2 — Big standalone wins

### "Now" view (new tab)
Probably the highest-ROI single feature on the list. Add a 4th tab between Plan and Routes. UI: single stop selector → list of routes serving that stop → next expected departure time for each. For Gold from Bus Terminal, compute exact next departure from `:00 :20 :40`. Otherwise show `~X min` using `freq ÷ 2`. Auto-refresh every minute.

### Favorites & recent trips
Two localStorage arrays:

- `favorites: [{ name, stop, label }]` — user-named ("Home", "Work", "Gym")
- `recent: [{ fStop, tStop, fLbl, tLbl }]` — last 5 searches, auto-pruned, deduped

Render as chips above the From input on the Plan tab. Tap a chip to populate the form. Long-press (or a small menu) to remove.

## Phase 3 — Korean language toggle (own milestone)

MVP scope: translate UI chrome only (tabs, labels, buttons, errors). Leave stop names and route names in English — Korean speakers on base know "PX" and "Maude Hall" in English already. Roughly 60–80 strings.

Approach:

- Flat `{ en: {...}, ko: {...} }` lookup object, keyed by string identifier
- Add Noto Sans KR font alongside Rajdhani
- Header toggle: `EN | 한국어`
- Persist choice in localStorage

Get a KATUSA or KSC colleague to QA the translation; machine translation alone produces awkward phrasing in transit/military domain language.

**Strategic value:** No competing app does this. MyArmyPost is English-only. KATUSAs, KSC battalion staff, Korean civilians, and Korean spouses currently rely on printed paper schedules. This single feature turns the app from "another bus app" into "the only Korean-language Humphreys shuttle app."

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
# Humphreys Transit Planner

A mobile-first, community-built React app for planning shuttle trips around the U.S. Army installation in Pyeongtaek, South Korea. Not affiliated with, endorsed by, or operated by USAG Humphreys, the U.S. Army, or the Department of Defense — see `docs/legal-posture.md` for the full posture statement and disclaimer wording. Distribution path (standalone PWA vs MAPA integration) is pending PAO outreach; standalone is currently active.

## Stack

- React 18 + Vite
- No external state management — local component state only
- No CSS framework — inline styles via a shared color palette object (`C`) plus a small `<style>{CSS}</style>` block for shared rules (form elements, animations, scrollbar)
- Leaflet for the Map tab (raster tiles from CARTO `dark_all`; circleMarker only, no default Marker icons to avoid Vite-bundling traps)

## Audience

Soldiers, family members, civilian employees, and Korean nationals (KATUSAs, KSC battalion staff, Korean civilian employees, Korean spouses) living and working on Camp Humphreys. Mobile-first because most users are on phones standing at a stop.

## Aesthetic

Tactical night: charcoal-blue backgrounds, signal cyan (`#22D3EE`) for primary-action chrome (buttons, focus rings, active tab, "FASTEST" badge, "To" indicator), saffron gold (`#FFC83D`) reserved as a PDF-sourced-schedule / Gold-Route marker and the brand-mark logo. Earlier "olive on olive" identity was dropped after a bold repalette; olive-named keys in the `C` palette object still exist as aliases for the new cool blue-grey text ramp to avoid touching every callsite.

Two fonts:

- **Rajdhani** (display + UI) — military feel, tall caps
- **JetBrains Mono** (times, route badges) — distinguishes clock data from prose

Dark theme by default. No light mode planned.

## Data sources

8 on-post routes (Blue, Black, Green, Orange, Purple, Gold, Brown, Pink) plus 5 inter-garrison routes (Incheon Airport, Seoul/Dragon Hill, K-16, Daegu, Osan).

Data status (internal `verified` flag on `ROUTES`; gates whether `findTrips` reads `schedules.json` or falls back to heuristics — user-facing copy says "PDF-sourced" not "PDF-verified" regardless):

- **Gold Route**: `verified: true`; data transcribed from publicly posted 15 July 2023 PDF (`:00 :20 :40` departures from Bus Terminal). Full per-stop timetable in `src/data/schedules.json`.
- **Brown, Pink**: `verified: true`; stops + frequencies + days/hours transcribed from publicly posted 15 July 2023 PDFs (Brown 30-min Fri–Sat 1600–2200; Pink 15-min Fri–Sat 1700–2300, trial route).
- **Blue, Green, Purple**: 15-min headway confirmed via OCR of the per-stop schedule images (`scripts/scrape_schedules.py`). Service hours still listed as `0600–2200` placeholder.
- **Black, Orange**: 15-min headway unconfirmed — no stops served *exclusively* by either route in the per-stop image directory. ROUTES still carries the old estimates (25 / 30).
- **Inter-garrison routes**: not integrated into trip planner; shown as info only.

Building-number directory: 32 mapped (15 hand-curated + 17 OSM-sourced via `scripts/fetch_osm_buildings.py`). OSM has 380 numbered buildings inside the installation polygon; only those whose `name` tag unambiguously matches a known bus stop are merged into the `BUILDINGS` const. Raw OSM dataset lives in `src/data/buildings_osm.json`.

Bus-stop coordinates: 43 of 44 ROUTES stops have lat/lon in `src/data/stop_coords.json` (OSM `highway=bus_stop` nodes tagged `operator=USAG Humphreys`, fetched via `scripts/fetch_stop_coords.py`). Only the new Pink-route stop "Family Housing Towers (15th Street)" is missing.

## Conventions

- Stop names in proper case (`"Bus Terminal"`, `"Main Exchange (PX)"`)
- Times in 24h format (`HH:MM`)
- Walk times: see "Walk leg" below — only mock when no coords available for either side.
- Mock ride times: 2 min per stop (heuristic, not real)
- Wait times: `nextScheduledDeparture − userArrivalAtStop`. For Gold/Brown/Pink the scheduled departure comes from the PDF data in `src/data/schedules.json`; for other routes it falls back to a `:00`-anchor cycle heuristic (`+2 min/stop offset from the first stop`).
- Walk leg: `haversine(origin, stop)` divided by 5 km/h, floored at 3 min. Origin is the user's geolocation if the "📍 Nearest" button was used, else the picked building's OSM centroid (`src/data/buildings_osm.json`), else the 3-min mock. No geolocation request on page load — only on explicit button click.
- Service hours filtered automatically: routes out of service at the planned trip time are excluded from results

## Out of scope (for now)

- Real-time GPS tracking — requires bus hardware + DoD-approved backend (documented in Off-Post tab)
- Multi-day or multi-leg trip planning
- Account features / login

## Reference contacts (external; descriptive use only — not affiliation claims)

- USAG Humphreys Public Affairs Office: stakeholder for potential MAPA integration. Outreach pending; currently unresponsive (see `docs/legal-posture.md`).
- Transportation Office: DSN 755-0424 — public reference contact for shuttle schedule changes.
- DPW GIS / IGI&S: Bldg 6140 — public reference contact for building directory + stop coordinates.
- Public shuttle page: home.army.mil/humphreys — source of publicly posted route PDFs.

## When working on this codebase

- Prefer small, atomic commits per feature
- Keep the single-component structure until it actually hurts; do not pre-split into many files
- The `findTrips` function is the heart of routing logic — read it carefully before touching
- Wait/ride time heuristics will get replaced once real schedule PDFs arrive; do not over-engineer them now
- See `Roadmap.md` for the planned improvement queue (Phase 5a in progress, 5b only if PAO accepts MAPA, 5c if PAO declines long-term)
- Before adding or editing user-facing copy, check `docs/legal-posture.md` to keep the disclaimer / non-affiliation stance intact. The internal `verified: true` flag on `ROUTES` is a data switch — do not surface the word "verified" in user-facing strings; use "PDF-sourced"
- See `docs/distribution-pivot.md` if you need to know what flips on MAPA-positive

## Filename quirk

The conventions file is tracked in git as lowercase `claude.md`. The case-insensitive Windows / WSL filesystem also surfaces an uppercase `CLAUDE.md` that points at the same inode, but `git add CLAUDE.md` silently no-ops on Linux. Always edit `claude.md` (lowercase) and stage from that path.
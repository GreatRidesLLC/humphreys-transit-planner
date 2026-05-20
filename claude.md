# Humphreys Transit

A mobile-first React app for planning on-post bus trips at Camp Humphreys (USAG Korea), the largest U.S. military installation overseas.

## Stack

- React 18 + Vite
- No external state management — local component state only
- No CSS framework — inline styles via a shared color palette object (`C`) plus a small `<style>{CSS}</style>` block for shared rules (form elements, animations, scrollbar)

## Audience

Soldiers, family members, civilian employees, and Korean nationals (KATUSAs, KSC battalion staff, Korean civilian employees, Korean spouses) living and working on Camp Humphreys. Mobile-first because most users are on phones standing at a stop.

## Aesthetic

Tactical night: charcoal-blue backgrounds, signal cyan (`#22D3EE`) for primary-action chrome (buttons, focus rings, active tab, "FASTEST" badge, "To" indicator), saffron gold (`#FFC83D`) reserved as a verified-PDF / Gold-Route trust marker and the brand-mark logo. Earlier "olive on olive" identity was dropped after a bold repalette; olive-named keys in the `C` palette object still exist as aliases for the new cool blue-grey text ramp to avoid touching every callsite.

Two fonts:

- **Rajdhani** (display + UI) — military feel, tall caps
- **JetBrains Mono** (times, route badges) — distinguishes clock data from prose

Dark theme by default. No light mode planned.

## Data sources

8 on-post routes (Blue, Black, Green, Orange, Purple, Gold, Brown, Pink) plus 5 inter-garrison routes (Incheon Airport, Seoul/Dragon Hill, K-16, Daegu, Osan).

Verification status:

- **Gold Route**: verified from official 15 July 2023 PDF (`:00 :20 :40` departures from Bus Terminal). Full per-stop timetable in `src/data/schedules.json`.
- **Brown, Pink**: stops + frequencies + days/hours verified from official 15 July 2023 PDFs (Brown 30-min Fri–Sat 1600–2200; Pink 15-min Fri–Sat 1700–2300, trial route).
- **Blue, Green, Purple**: 15-min headway confirmed via OCR of the per-stop schedule images (`scripts/scrape_schedules.py`). Service hours still listed as `0600–2200` placeholder.
- **Black, Orange**: 15-min headway unconfirmed — no stops served *exclusively* by either route in the per-stop image directory. ROUTES still carries the old estimates (25 / 30).
- **Inter-garrison routes**: not integrated into trip planner; shown as info only.

Building-number directory: 32 mapped (15 hand-curated + 17 OSM-sourced via `scripts/fetch_osm_buildings.py`). OSM has 380 numbered buildings inside the installation polygon; only those whose `name` tag unambiguously matches a known bus stop are merged into the `BUILDINGS` const. Full per-building stop assignment is blocked on bus-stop lat/long (DPW GIS / IGI&S office, Bldg 6140); raw OSM dataset lives in `src/data/buildings_osm.json`.

## Conventions

- Stop names in proper case (`"Bus Terminal"`, `"Main Exchange (PX)"`)
- Times in 24h format (`HH:MM`)
- Mock walk times: 3 min per segment
- Mock ride times: 2 min per stop (heuristic, not real)
- Wait times: `nextScheduledDeparture − userArrivalAtStop`. For Gold/Brown/Pink the scheduled departure comes from the PDF data in `src/data/schedules.json`; for other routes it falls back to a `:00`-anchor cycle heuristic (`+2 min/stop offset from the first stop`).
- Service hours filtered automatically: routes out of service at the planned trip time are excluded from results

## Out of scope (for now)

- Real-time GPS tracking — requires bus hardware + DoD-approved backend (documented in Off-Post tab)
- Multi-day or multi-leg trip planning
- Account features / login

## Reference contacts

- USAG Humphreys Public Affairs Office: Manages MyArmyPost App (MAPA)
- Transportation Office: DSN 755-0424
- DPW GIS / IGI&S: Bldg 6140
- USAG Humphreys website: home.army.mil/humphreys

## When working on this codebase

- Prefer small, atomic commits per feature
- Keep the single-component structure until it actually hurts; do not pre-split into many files
- The `findTrips` function is the heart of routing logic — read it carefully before touching
- Wait/ride time heuristics will get replaced once real schedule PDFs arrive; do not over-engineer them now
- See `Roadmap.md` for the planned improvement queue and rationale
# Humphreys Transit Planner

A mobile-first, community-built React app for planning shuttle trips around the U.S. Army installation in Pyeongtaek, South Korea. Not affiliated with, endorsed by, or operated by USAG Humphreys, the U.S. Army, or the Department of Defense — see `docs/legal-posture.md` for the full posture statement and disclaimer wording. Distribution path (standalone PWA vs MAPA integration) is pending PAO outreach; standalone is currently active.

## Stack

- React 19 + Vite
- No backend — fully static PWA; all data is build-time JSON. Convex was evaluated and rejected 2026-08-22; if a server-side need ever arises, add a route to the existing Cloudflare Worker (see `docs/adr/0001-static-first-no-backend.md`)
- No external state management — local component state only
- Tailwind v4 (`@tailwindcss/vite`, no config file) + shadcn/ui registry components — style `radix-vega`, base colour zinc, medium radius, CSS variables on. All design tokens live in `src/index.css`: shadcn's names on `:root` / `.dark`, plus handoff-only tokens (`--body`, `--faint`, `--border-strong`, `--divider`, `--link`, `--warn-*`, `--pdf-*`, `--origin-dot`, `--seg-active-*`) exposed through `@theme inline` so they work as utilities. `@/` aliases `./src` (vite `resolve.alias` + `jsconfig.json`)
- `src/components/ui/*.jsx` is generated output — re-add with `bunx shadcn@latest add <name>`, never hand-edit; call sites pass `className` overrides and `cn()` from `@/lib/utils` instead. `eslint.config.js` exempts that directory. Route colours stay data (`ROUTES[..].color`, `ROUTE_BADGE`) and are the only inline `style=` colours allowed
- Light theme is the default; dark is a token swap applied by toggling `dark` on `<html>`, driven by `humphreys.theme` (`light` | `dark` | `system`, `system` resolved via `matchMedia`) and switchable from the header. Every screen reads tokens through Tailwind utilities — there is no palette object left in `src/App.jsx`, and inline `style=` is reserved for route colours
- Departure times: `verified` is route-level but a transcribed per-stop timetable only exists for the stops the PDF covered, so read `source` from `nextDeparture()` / `departureSource()` (`"pdf"` | `"heuristic"`) to decide between `14:30` and `~14:30`. Headway for a moment in time comes from `freqAt()`, not `r.freq`
- No map library. An earlier Leaflet-based Map tab (CARTO `dark_all` tiles + straight-line route polylines) was retired 2026-08-22 as half-baked; implementation parked on branch `archive/map-tab` for future revival if a coherent map story (real polylines, live positions, or an on-post basemap) materializes

## Audience

Soldiers, family members, civilian employees, and Korean nationals (KATUSAs, KSC battalion staff, Korean civilian employees, Korean spouses) living and working on Camp Humphreys. Mobile-first because most users are on phones standing at a stop.

## Aesthetic

**Saffron Signal** (approved 2026-08-23): warm stone neutrals on shadcn structure — flat 1px borders, subtle shadows, no glows, no colored card rails, and **no accent colour anywhere in chrome**. Light is `#faf9f7` page / `#ffffff` card / `#1c1917` ink; dark is `#0c0b0a` / `#151311` / `#f5f3ef`. Because there is no accent hue, links are foreground-weight text with an underline (`--link` is `#44403c`, not a colour), and the active tab is a raised card surface with no underline.

Saffron `#FFC83D` survives in exactly one place: the brand mark. `src/components/brand-mark.jsx` exports `BrandMark({size})` — a saffron tile with a charcoal bus, 28px in the header, with an optical cut at ≤16px that drops the roof strip so nothing lands under a pixel. Nothing in the interface may reuse that gold; putting it on a badge or a dot would read as the Gold Route. App icons are generated from `public/icon.svg` (and `public/icons/icon-maskable.svg`, which is full-bleed for the maskable safe zone) with `rsvg-convert -w N -h N SRC -o OUT` into `public/icons/`; the mark itself is the source of truth, so regenerate rather than editing a PNG.

Spec and screens: `docs/design-handoff-shadcn-redesign.md`.

Route colours are the approved set in `src/lib/palette.js` (2026-08-23), picked for colour-vision-deficiency separation as much as contrast — the worst pair distance under deuteranopia went 3.10 → 9.76 ΔE, under protanopia 2.32 → 10.10, retiring an Orange/Brown pair that read as one colour. `ROUTE_BADGE.fg` is the badge ink and every pair clears AA; `src/lib/palette.test.js` fails the build if a value regresses, so re-run it rather than hand-tuning. Saffron gold is no longer a trust marker: the PDF-sourced badge is a neutral outline chip, and gold is now just the Gold Route's colour.

Type stack (`--font-sans` / `--font-mono` in `src/index.css`, faces in `public/fonts/fonts.css`):

- **Avenir Next** (display + UI) where it is installed — it ships with macOS and iOS, which is most of this audience. Declared with `local()` only. **It is a licensed Monotype face: never download, vendor, or serve an Avenir file from this repo.** We have no redistribution licence
- **Nunito Sans** (OFL, self-hosted, latin subset from `@fontsource/nunito-sans`) — the web fallback everywhere Avenir Next is absent
- **Noto Sans KR** (self-hosted) for Korean, last in the sans stack
- **Geist Mono** (times, route badges) — distinguishes clock data from prose; JetBrains Mono remains as the fallback face

Because the Nunito Sans faces carry a latin `unicode-range`, the glyph icons (★ → ▾ ⇅ ↺) resolve from Avenir Next on Apple devices and from Noto Sans KR / the system sans elsewhere.

Light theme by default; dark ships as a token swap. Rajdhani and the Geist sans faces are retired.

## Data sources

8 on-post routes (Blue, Black, Green, Orange, Purple, Gold, Brown, Pink) plus 5 inter-garrison routes (Incheon Airport, Seoul/Dragon Hill, K-16, Daegu, Osan).

Data status (internal `verified` flag on `ROUTES`; gates whether `findTrips` reads `schedules.json` or falls back to heuristics — user-facing copy says "PDF-sourced" not "PDF-verified" regardless):

- **Gold Route**: `verified: true`; weekend data transcribed from publicly posted 15 July 2023 PDF (`:00 :20 :40` uniform 20-min from Bus Terminal, in `src/data/schedules.json`). Mon–Fri cadence per newer Exhibit #0019 poster actually varies (30-min midday, 15-min ~16:00–20:00) — weekday per-stop transcription still pending.
- **Green, Purple**: `verified: true`. Multi-window `schedule` field on `ROUTES` (see `src/lib/routing.js`) drives per-day-of-week service hours + freq; supports overnight overflow (`to > "24:00"`). Purple full per-stop timetable in `src/data/schedules.json` (10 stops × 4 day-types) generated by `scripts/gen_purple_schedule.py` from Exhibit #0022 poster. Green day/hours from posters but per-stop timetable still uses heuristic (transcription pending).
- **Brown**: `verified: true`; stops + frequencies + per-day hours transcribed from publicly posted 15 July 2023 PDF (30-min Fri 1900–2200 · Sat/Training Holiday 1600–2200; trial-run route).
- **Pink**: `verified: true`; stops + frequencies + days/hours transcribed from publicly posted 15 July 2023 PDF (15-min Fri–Sat 1700–2300, trial route).
- **Blue**: 15-min headway confirmed via OCR of the per-stop schedule images (`scripts/scrape_schedules.py`). Service hours still listed as `0600–2200` placeholder.
- **Black, Orange**: 15-min headway unconfirmed — no stops served *exclusively* by either route in the per-stop image directory. ROUTES still carries the old estimates (25 / 30).
- **Inter-garrison routes**: not integrated into trip planner; shown as info only.

Building-number directory: 32 mapped (15 hand-curated + 17 OSM-sourced via `scripts/fetch_osm_buildings.py`). OSM has 380 numbered buildings inside the installation polygon; only those whose `name` tag unambiguously matches a known bus stop are merged into the `BUILDINGS` const. Raw OSM dataset lives in `src/data/buildings_osm.json`.

Bus-stop coordinates: 44 of 44 ROUTES stops have lat/lon in `src/data/stop_coords.json` (OSM `highway=bus_stop` nodes tagged `operator=USAG Humphreys`, fetched via `scripts/fetch_stop_coords.py`). The one stop OSM had no node for — the Pink trial-route "Family Housing Towers (15th Street)" — is hand-pinned to `36.9556, 127.0158` (SW terminus of 15th Street, OSM way 1019688918).

## Conventions

- Stop names in proper case (`"Bus Terminal"`, `"Main Exchange (PX)"`)
- Times in 24h format (`HH:MM`)
- Walk times: see "Walk leg" below — only mock when no coords available for either side.
- Mock ride times: 2 min per stop (heuristic, not real)
- Wait times: `nextScheduledDeparture − userArrivalAtStop`. `nextDeparture()` returns `{ time, source }` where source is `"pdf"` (a transcribed per-stop timetable in `src/data/schedules.json`) or `"heuristic"` (the `:00`-anchor cycle, `+2 min/stop` from the first stop, at the freq active for the current window). Provenance is **per stop, not per route** — Green is `verified: true` but only Bus Terminal has real times — so never branch on `r.verified` to decide how precise a time is; read `source`, or `departureSource(R, stop)`.
- Walk leg: `haversine(origin, stop)` divided by 5 km/h, floored at 3 min. Origin is the user's geolocation if the "Nearest stop" button was used, else the picked building's OSM centroid (`src/data/buildings_osm.json`), else the 3-min mock. No geolocation request on page load — only on explicit button click.
- Service hours filtered automatically: routes out of service at the planned trip time are excluded from results
- Headway for a moment in time is `freqAt(route, when)`, never `route.freq` — Green is 15 min on weekdays and 30 at the weekend
- Any heuristic departure renders with the `~` prefix plus an "est." tag; only `source: "pdf"` times print bare
- All 11px informational text uses `text-muted-foreground`. `text-faint` is reserved for placeholders and non-text glyphs (chevrons) — it is a step lighter and only clears AA on the card surface

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
- `src/components/ui/` is generated shadcn output. Re-add with `bunx shadcn@latest add <name>`; never hand-edit it. Style the call site with `className` + `cn()` instead — and remember `tailwind-merge` only dedupes classes that share a variant prefix, so an override must repeat the generated class's modifiers to win
- Route colours are data, not theme: `ROUTES[..].color` and `ROUTE_BADGE` (whose ink is contrast-checked — Black, Purple and Pink carry dark text because white failed AA). They are the only inline `style=` colours in the app; everything else goes through Tailwind tokens
- Every new user-facing string needs both locales. Render the screen in `ko` before calling it done — units and separators are the usual leak
- See `docs/distribution-pivot.md` if you need to know what flips on MAPA-positive

## Filename quirk

The conventions file is tracked in git as lowercase `claude.md`. The case-insensitive Windows / WSL filesystem also surfaces an uppercase `CLAUDE.md` that points at the same inode, but `git add CLAUDE.md` silently no-ops on Linux. Always edit `claude.md` (lowercase) and stage from that path.
# Map tab — retirement and revival paths

Status: **Retired.** Pulled from `dev` in PR #48 (2026-08-22), parked on branch `archive/map-tab` (commit `ec15aa8`, resume notes in that branch's `PARKED.md`). Deliberately **not** revived during the shadcn/ui redesign (2026-08-23).

The tab looked like a route map and was not one. Its polylines were straight lines drawn stop-to-stop from `stop_coords.json`, so they conveyed topology and nothing about where a bus actually goes — a rider following one would walk through buildings. The basemap was CARTO `dark_all`, a third-party image host that forced an `img-src` exception; that exception has since been removed and the CSP is back to `img-src 'self' data:`, and licensing for rendering the installation from a commercial tile host was never resolved. Underneath both problems is a bigger one: a map invites the question "where is my bus right now", which needs GPS hardware on the buses plus a DoD-approved backend to receive it — and `docs/adr/0001-static-first-no-backend.md` rules out a backend platform. A map that answers none of those questions is chrome.

## What the archived branch contains

Everything on `dev` at `7424d62` plus `PARKED.md`. The map surface, in `src/App.jsx` on that branch:

- `leaflet@^1.9.4` dependency, `import L from "leaflet"` + `leaflet/dist/leaflet.css`
- `MapTab({ onPickStop, userCoords })` — the whole tab, imperative Leaflet inside a `useEffect`
- CARTO `dark_all` raster tiles (`https://{s}.basemaps.cartocdn.com/...`), OSM + CARTO attribution, centred `[36.967, 127.033]` at zoom 14, `preferCanvas: true`
- Per-route `L.polyline` from `STOP_COORDS`, coloured `ROUTES[r].color`, weight 3 / opacity 0.65
- `L.circleMarker` per stop (radius 7) — chosen over `L.Marker` to sidestep Leaflet's PNG-icon bundling traps under Vite — with a popup of route chips
- Secondary POI pins from `buildings_osm.json`, filtered by `POI_AMENITIES`, rendered as `L.divIcon` emoji
- `pickStopFromMap(stopName, slot)` → seeds the Plan tab's From/To and switches tab
- i18n `tabMap` / `mapHint` in EN + KO, and a `TABS` entry making Map the fifth tab

`stop_coords.json` and `buildings_osm.json` are **not** map-only — `src/lib/routing.js` uses them for walk-leg haversine. They stayed on `dev`.

## Revival path A — static-only, no stipulations

Everything here ships under the current ADR and CSP with zero runtime third-party calls.

- **(a) Real geometry, baked at build time.** A `scripts/` step that resolves each route's stop sequence to road geometry — OSRM or OpenRouteService called *once, at author time*, or hand-traced from the OSM ways already inside the installation polygon (`buildings_osm.json` carries the bbox) — and commits per-route GeoJSON. Runtime then reads committed JSON like every other dataset. This alone fixes the "lines through buildings" problem.
- **(b) A basemap without a tile host.** Two licence-clean options. Pre-render a static tile set for the installation bbox at build time and self-host it under `public/tiles/` (OSM ODbL, attribution required, adds weight to the precache); *or* draw no basemap at all — a schematic transit diagram of GeoJSON lines and stop dots on a neutral canvas. The diagram is cheapest, fully licence-clean, and arguably the more honest artefact for a shuttle network.
- **(c) "Where the bus should be."** Interpolate a scheduled position along the polyline from `schedules.json` (or the `:00`-anchor heuristic) and label it unambiguously as *scheduled*, never *live* — the same `~`/est. discipline the Now tab and results already use for heuristic departures.
- **(d) Port to the current design.** shadcn `Card`, design tokens, `.dark`-aware Leaflet CSS overrides; re-add a CSP `img-src` exception **only** if (b)-tiles is chosen, and not at all for the schematic.
- **(e) Restore `tabMap` / `mapHint` in both locales** and re-add the fifth `TabsTrigger`. Note the old strings carry emoji (`📍 Map`), which the redesign removed from tab labels — retitle to plain text.

The Pink-route stop `Family Housing Towers (15th Street)` was still missing coordinates when the tab was pulled. **That gap is closed** — it was hand-pinned to `36.9556, 127.0158` and `stop_coords.json` is now 44/44. No blocker there.

## Revival path B — needs an outcome we do not control

- **Live positions.** Depends on the GPS / BusWhere outreach (see `Roadmap.md`). If it lands, ADR-0001 says the escape hatch is a route on the *existing* Cloudflare Worker, not a new backend platform — and any feed would still need a DoD-acceptable path off the buses.
- **On-post basemap.** DPW GIS / IGI&S (Bldg 6140) is the public reference contact for installation geodata. An authoritative on-post basemap would moot (b) entirely, but it is a request, not a plan.
- **Distribution.** If the PAO/MAPA conversation reopens (`docs/distribution-pivot.md`), a map may belong in MAPA rather than here. Worth settling before building one twice.

## Checklist

- [ ] Decide (b): schematic diagram vs self-hosted tiles — *small, decision only, blocks the rest*
- [ ] Build-time route geometry script + committed GeoJSON — *large*
- [ ] Render layer on the new design system (Card, tokens, dark) — *medium*
- [ ] Scheduled-position interpolation, labelled as scheduled — *medium*
- [ ] Restore `tabMap` / `mapHint` (both locales, no emoji) + fifth tab — *small*
- [ ] CSP / attribution review, only if self-hosting tiles — *small*
- [ ] Re-check bundle budget: Leaflet is ~42 kB gzip and the main chunk is already ~136 kB — *small, but lazy-load the tab*

No dates. Revival is not scheduled; this file exists so the next person does not rediscover the same three dead ends.

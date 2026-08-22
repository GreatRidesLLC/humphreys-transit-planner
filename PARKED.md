# PARKED — Map tab

This branch (`archive/map-tab`) preserves the Map tab implementation
that was removed from `dev` on 2026-08-22. Kept for future revival if
the map story ever gets a coherent design (real bus polylines, real-time
positions, or an on-post basemap that clears IP/licensing).

Why it was pulled: half-baked. Straight-line polygons between stops
convey topology but nothing else; CARTO `dark_all` raster tiles are OK
for now but license posture for on-post use is unresolved; no way to
show live buses until GPS/BusWhere lands. The tab was more of a
placeholder than a feature.

## What lives on this branch

Everything in `dev` at commit `7424d62`, plus this file. Specifically
the Map tab surface area you will want to restore or rewrite:

- `src/App.jsx`
  - Lines 2–3: leaflet imports (`import L from "leaflet"` + CSS)
  - Line 95 / 170: i18n keys `tabMap` (EN + KO)
  - Lines 695–876: `// ─── Map Tab ───` section
    - `el()` DOM helper (line 718) — used only by MapTab
    - `MapTab({ onPickStop, userCoords })` component (line 725)
      - CARTO `dark_all` raster tile source
      - `circleMarker` per stop (no default Marker icons → sidesteps
        Vite bundling traps for leaflet's PNG icons)
      - Straight-line route polylines (`L.polyline`) coloured by route
      - POI pins sourced from `src/data/buildings_osm.json`
      - Click-a-stop popup with "Set as origin/destination" chips that
        call back into `onPickStop(stopName, "from"|"to")`
  - Line 1042: `TABS` array entry `["map", t.tabMap]`
  - Lines 1044+: `pickStopFromMap(stopName, slot)` handler
  - Line 1263: `{tab==="map" && <MapTab .../>}` render block
- `package.json` — `leaflet` dep
- `src/data/stop_coords.json` + `src/data/buildings_osm.json` —
  used both by MapTab AND by `src/lib/routing.js` for walk-leg
  distance calculations. These were NOT removed from `dev`; they stay
  in the trip-planner path. Do not treat them as map-tab-only.

## To resume work in the future

1. `git checkout archive/map-tab -- src/App.jsx package.json`
   (or cherry-pick the parked map code onto a fresh feature branch
   from current `dev`).
2. Reinstall leaflet: `npm install leaflet@^1.9.4` (or newer).
3. Restore the `tab==="map"` render block, `pickStopFromMap` handler,
   and the `TABS` array entry.
4. Before shipping, address the reasons it was pulled — see the
   Roadmap.md "Real route polylines" and "GPS / BusWhere outreach"
   entries.

## Not to be merged

This branch is a bookmark, not a work-in-progress. Do not open a PR
from it. If someone wants to revive the tab, they should branch off
current `dev`, cherry-pick or hand-port the parked code onto that
base, and open a PR from the new branch.

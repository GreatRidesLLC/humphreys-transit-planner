# Walk-through TODO — Gold Route stop verification

Purpose: canonical names + physical mapping for 7 stops on Exhibit #0019
(Gold Route) that were photographed 2026-08-20 but omitted from
`schedules.json` pending on-ground confirmation. Once resolved, add to
`STOP_OFFSETS` in `scripts/gen_gold_schedule.py`, re-run, and stage
into ROUTES.GOLD.stops (with any needed `STOP_ALIASES` entries).

## Route to walk

Any Gold Route bus loop from Bus Terminal. Full circuit = ~45 min
Sat/Sun, ~45–75 min Mon–Fri. Take Sat mid-morning for clearest signage
+ full-loop coverage. Bring phone for photos of stop-signs / building
labels.

## Stops to verify

| # | Poster label | Bus stop ID (visible on sign) | Confirm |
|---|---|---|---|
| 1 | **CAC** | S117 | What does "CAC" stand for on the physical stop sign? Central Access Control (main gate ID check)? Common Access Card office? Canonical name for use in app dropdown. |
| 2 | **USO** | S103 | Is the stop labelled "USO" the one adjacent to OSM building #301 "USO Sentry Village"? If yes, canonical = `USO Sentry Village`. If different physical spot, capture name. |
| 3 | **Family Housing Twr 1** | S2083 (outbound), S5061 (return) | Which physical building? Existing ROUTES has `Family Housing Towers (Tropic Lightning Ave)` + `Family Housing Towers (Taro Ave)`. Which of these two (if either) is Twr 1? |
| 4 | **Family Housing Twr 2** | S5072 (outbound), S5070 (return) | Same question — Tropic Lightning, Taro, or neither? |
| 5 | **Family Housing Twr 3** | S5103 (outbound), ? (return) | New stop, or existing? If new, on which street? Not currently in ROUTES. |
| 6 | **O-6 Housing** | (no visible ID in photo) | Full name? Where is it? Officer housing for O-6 rank (Colonel / Navy Captain). Canonical name for dropdown. |
| 7 | **Sentry Village PX** | S451 | Different from existing `Sentry Village Burger King` AND `Sentry Village Mini Mall` (both are already separate stops per prior note). Is `Sentry Village PX` a third distinct shop / stop? If yes, capture the physical name over the door. |

## What to bring back per stop

- **Stop-sign photo** (whole sign, readable)
- **Bus stop ID** (Sxxx / Pxxxx code on the sign — the small alphanumeric)
- **Nearest building name / number** if visible
- **Lat/lon** from phone if easy (drop a pin)
- **Which side of the street** relative to route direction (helps disambiguate outbound vs return-loop platforms sharing a name)

## Tools

Two aids in this repo:
- `scripts/walkthrough/index.html` — mobile capture form; pre-loaded with
  the 7 stops + Sat-photo offsets. Autosaves to browser `localStorage`,
  exports `gold-walkthrough-YYYY-MM-DD.json`. Open directly in the phone
  browser (needs to be served over HTTP for GPS — `python3 -m http.server`
  from `scripts/walkthrough/` then hit `http://<laptop-ip>:8000` from
  the phone on the same wifi).
- `docs/walkthrough-checklist.md` — printable paper backup if the phone
  can't come along.

## When done

1. Open `scripts/walkthrough/index.html`, fill it out, click **Export JSON**.
2. Run:
   ```
   python3 scripts/apply_walkthrough.py gold-walkthrough-YYYY-MM-DD.json --dry-run
   python3 scripts/apply_walkthrough.py gold-walkthrough-YYYY-MM-DD.json
   ```
   Patches `STOP_OFFSETS` in `scripts/gen_gold_schedule.py` and merges
   `src/data/stop_coords.json`; prints the `routing.js` blocks to paste.
3. Hand-edit `src/lib/routing.js` — insert new canonical names into
   `ROUTES.GOLD.stops` (in outbound-offset order) and add `STOP_ALIASES`
   entries.
4. `python3 scripts/gen_gold_schedule.py && npm test`
5. `Roadmap.md` — delete the Gold stop-name verification entry.

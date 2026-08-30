# Gold Route walkthrough — paper backup

Print this if phone battery is a risk. One row per stop; scribble in the
right column and transcribe into `scripts/walkthrough/index.html` later.

**Bring:** phone (photos + GPS), pen, this sheet, water, cash for Burger King.
**When:** Saturday mid-morning (clearest signage, full loop coverage in ~45 min).
**Where to board:** Bus Terminal (P1780), any Gold bus. Ride the full circuit.

---

## Stops to verify (poster order, outbound)

| # | Poster label | Bus stop ID | Offset (min from BT) |
|---|---|---|---|
| 1 | CAC | S117 | +3 |
| 2 | USO | S103 (out) / S376 (ret) | +4 / +37 |
| 3 | Family Housing Twr 1 | S2083 (out) / S5061 (ret) | +8 / +32 |
| 4 | Family Housing Twr 2 | S5072 (out) / S5070 (ret) | +9 / +31 |
| 5 | Family Housing Twr 3 | S5103 (out) / S5105 (ret) | +10 / +27 |
| 6 | O-6 Housing | (no visible ID out) / row 22 ret | +13 / +26 |
| 7 | Sentry Village PX | S451 | +38 |

Offsets pre-extracted from Exhibit #0019 Sat photo (`gold-table-2.jpg`).

---

## Per-stop capture template

Photocopy the block below 7× (or 14× if outbound and return-loop platforms
are physically separate).

```
─────────────────────────────────────────────────────────
STOP #____   Poster label: _______________________________

Outbound platform (bus stop ID: __________)
  Canonical name (as it should read in the app):
    _____________________________________________________
  Aliases (any names locals actually use):
    _____________________________________________________
  Nearest building / number / landmark:
    _____________________________________________________
  Side of street (relative to bus direction):  L / R / other
  GPS (from phone map pin):
    lat: ______________   lon: ______________
  Notes / weirdness:
    _____________________________________________________

Same physical stop as return-loop platform?    YES / NO
  (YES → skip return block. NO → fill it out.)

Return-loop platform (bus stop ID: __________)
  Canonical name: _____________________________________
  Aliases: ____________________________________________
  Landmark: ___________________________________________
  Side of street: L / R / other
  GPS lat: ______________   lon: ______________
  Notes: ______________________________________________

Photo taken?  [ ] stop sign  [ ] building  [ ] both platforms
─────────────────────────────────────────────────────────
```

---

## What each question is trying to settle

- **CAC**: does the physical sign say "Central Access Control" (main gate
  ID check) or "Common Access Card" (badge office)? Determines whether
  users searching either term should land here.
- **USO**: is it OSM building #301 "USO Sentry Village"? Is the return-loop
  platform ("Opposite USO", S376) physically the same stop or across the road?
- **FH Twr 1/2/3**: which of these correspond to the existing canonical
  names `Family Housing Towers (Tropic Lightning Ave)` and
  `Family Housing Towers (Taro Ave)`? Twr 3 (S5103) is likely a new stop —
  which street?
- **O-6 Housing**: full building name over the door? Location (which
  block)? "O-6" is the officer pay grade (Colonel / Navy Captain).
- **Sentry Village PX**: distinct from Sentry Village Burger King AND
  Mini Mall (both already separate stops)? Name over the door?

---

## After you get back

1. Open `scripts/walkthrough/index.html` on any device (phone, laptop).
2. Transcribe your paper answers into the form (autosaves to browser).
3. Click **Export JSON** → save `gold-walkthrough-YYYY-MM-DD.json`.
4. Run:
   ```
   python3 scripts/apply_walkthrough.py gold-walkthrough-YYYY-MM-DD.json --dry-run
   python3 scripts/apply_walkthrough.py gold-walkthrough-YYYY-MM-DD.json
   ```
5. Follow the printed hints to hand-edit `src/lib/routing.js`.
6. `python3 scripts/gen_gold_schedule.py && npm test`
7. Update `Roadmap.md` (delete the Gold stop-name verification entry).

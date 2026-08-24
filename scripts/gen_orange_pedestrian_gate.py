"""Add ORANGE.<DAYTYPE> arrival times at Pedestrian Gate to schedules.json.

Source: on-post Pedestrian Gate poster, ORANGE ROUTE, updated 15 July 2023
(photographed 2026-08-24, Photos-extra/orange-route.jpg).

Poster shows arrival-at-Pedestrian-Gate times. Arrival day drives the bucket:
a Fri 23:45 dispatch that reaches PG on Sat 00:00 belongs under Saturday.

Windows (per photo, all 15-min :00 :15 :30 :45):
  Mon-Thu: 19:00-22:45                 → MONDAY-THURSDAY (16 times)
  Fri:     19:00 -> Sat 01:45          → FRIDAY 19-23 (20 times) + SATURDAY 00-01:45 (7 times)
  Sat:     09:00 -> Sun 01:45          → SATURDAY 09-23 (60 times) + SUNDAY 00-01:45 (7 times)
  Sun:     09:00-22:45                 → SUNDAY 09-22 (56 times)

TH-before-non-duty rides Sat schedule; TH-before-duty rides Sun. Encoded as
SATURDAY / TRAINING HOLIDAY and SUNDAY buckets separately isn't needed here
since ORANGE doesn't have distinct TH posters — pickDayType resolves it via
route-level schedule windows in routing.js.
"""

import json

SRC = "/mnt/d/claude-projects/humphreys-transit/src/data/schedules.json"
STOP = "Pedestrian Gate"

def fmt(m):
    return f"{m // 60:02d}:{m % 60:02d}"

# Mon-Thu: 19:00-22:45
mon_thu = [fmt(h * 60 + m) for h in range(19, 23) for m in (0, 15, 30, 45)]

# Fri dispatch 19:00 -> Sat 01:45. Split by arrival day.
fri, sat_early_from_fri = [], []
for h in range(19, 26):  # 19..25 (25 = next-day 01)
    for m in (0, 15, 30, 45):
        total = h * 60 + m
        if total > 25 * 60 + 45:  # cap at 01:45
            continue
        bucket = fri if total < 24 * 60 else sat_early_from_fri
        bucket.append(fmt(total % 1440))

# Sat dispatch 09:00 -> Sun 01:45.
sat_full, sun_early_from_sat = [], []
for h in range(9, 26):
    for m in (0, 15, 30, 45):
        total = h * 60 + m
        if total > 25 * 60 + 45:
            continue
        bucket = sat_full if total < 24 * 60 else sun_early_from_sat
        bucket.append(fmt(total % 1440))

# Sun 09:00-22:45
sun_full = [fmt(h * 60 + m) for h in range(9, 23) for m in (0, 15, 30, 45)]

# Merge overnight-arrivals into the correct day bucket
saturday = sorted(sat_early_from_fri + sat_full)
sunday = sorted(sun_early_from_sat + sun_full)

with open(SRC) as f:
    data = json.load(f)

entry = data["stops"][STOP]
entry.setdefault("by_route_pdf", {})
entry["by_route_pdf"]["ORANGE"] = {
    "MONDAY-THURSDAY": mon_thu,
    "FRIDAY": fri,
    "SATURDAY": saturday,
    "SUNDAY": sunday,
}
if "ORANGE" not in entry.get("routes_named", []):
    entry.setdefault("routes_named", []).append("ORANGE")

data.setdefault("_meta", {}).setdefault("pdf_sources", {})["ORANGE"] = (
    "Orange Route Pedestrian Gate poster (updated 15 July 2023; photographed 2026-08-24, "
    "Photos-extra/orange-route.jpg). 15-min headway. Evenings + weekends; Fri/Sat run past "
    "midnight to 01:45. Other stops still use anchored heuristic."
)

with open(SRC, "w") as f:
    json.dump(data, f, indent=2, ensure_ascii=False)
    f.write("\n")

for k, v in entry["by_route_pdf"]["ORANGE"].items():
    print(f"  ORANGE {k}: {len(v)} times ({v[0]}..{v[-1]})")

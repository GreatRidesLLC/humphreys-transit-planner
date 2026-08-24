"""Generate BLUE by_route_pdf entries for schedules.json.

Source: on-post Pedestrian Gate poster, BLUE ROUTE, effective 23 Mar 2026
(photographed 2026-08-24, Photos-extra/blue-route-tables.jpg + blue-table-1.jpg
+ blue-table-2.jpg).

Blue runs a single 20-stop outbound loop (Pedestrian Gate → Central Issue
Facility, via a small SOCKOR HQ / 2ID / CIF sub-loop) then returns to
Pedestrian Gate along the reverse spine. Total round trip = 66 min.

Dispatches from Pedestrian Gate every 15 min, Mon-Fri, from 08:00 through
18:45 → 44 dispatches per weekday. Per-stop offsets from the Bus Terminal
matrix on the poster are constant across all 44 columns.

Two-visit stops (rows 6-17 in the poster's outbound + return legs) get both
times in the arrivals list; the routing code just wants next-after-now, so
consolidating both visits into one sorted list is correct.
"""

import json

SRC = "/mnt/d/claude-projects/humphreys-transit/src/data/schedules.json"

# Offsets in minutes from Pedestrian Gate dispatch.
# Two-visit stops carry [outbound, return].
STOP_OFFSETS = {
    "Pedestrian Gate":                       [0, 66],
    "Provider Grill DFAC":                   [3, 65],
    "SLQs (12200s Block)":                   [5, 64],
    "Eighth Army HQ":                        [7, 62],
    "Corps of Engineers":                    [9, 60],
    "TMP / Driver's Licensing":              [13, 57],
    "Airfield Operations":                   [14, 55],
    "Talon Cafe DFAC":                       [15, 53],
    "Barracks (6000s Block)":                [17, 52],
    "Pacific Victors Chapel":                [19, 50],
    "Spartan DFAC":                          [20, 48],
    "LTG Maude Hall (9th St)":               [22, 46],
    "Commissary":                            [24, 44],
    "Main Post Office":                      [25, 43],
    "Main Exchange (PX)":                    [27, 42],
    "Pittman DFAC":                          [29, 40],
    "Sitman Fitness Center":                 [31, 38],
    "2ID Sustainment":                       [33],
    "SOCKOR HQ":                             [34],
    "Central Issue Facility":                [36],
}

# BT dispatches (08:00 through 18:45, every 15 min) → minutes-of-day
DISPATCHES = [h * 60 + m for h in range(8, 19) for m in (0, 15, 30, 45)]

def fmt(m):
    return f"{m // 60:02d}:{m % 60:02d}"

def stop_times(offsets):
    times = set()
    for d in DISPATCHES:
        for off in offsets:
            times.add(fmt(d + off))
    return sorted(times)

with open(SRC) as f:
    data = json.load(f)

stops = data["stops"]
for name, offsets in STOP_OFFSETS.items():
    entry = stops.setdefault(name, {
        "times": [], "routes_named": [], "minutes_pattern": [], "by_route_pdf": {}
    })
    entry.setdefault("by_route_pdf", {})
    entry["by_route_pdf"]["BLUE"] = {"MONDAY-FRIDAY": stop_times(offsets)}
    if "BLUE" not in entry.get("routes_named", []):
        entry.setdefault("routes_named", []).append("BLUE")

data.setdefault("_meta", {}).setdefault("pdf_sources", {})["BLUE"] = (
    "Blue Route Bus Stops and Timetables (Pedestrian Gate poster, effective "
    "23 Mar 2026; photographed 2026-08-24, Photos-extra/blue-table-1.jpg + "
    "blue-route-tables.jpg). Mon-Fri only, 15-min headway, 08:00-18:45 "
    "dispatch, 66-min loop, last arrival ~19:51."
)

with open(SRC, "w") as f:
    json.dump(data, f, indent=2, ensure_ascii=False)
    f.write("\n")

for name in STOP_OFFSETS:
    count = len(stops[name]["by_route_pdf"]["BLUE"]["MONDAY-FRIDAY"])
    print(f"  BLUE {name}: {count} times")

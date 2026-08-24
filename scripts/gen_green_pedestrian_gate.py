"""Add GREEN.<DAYTYPE> arrival times at Pedestrian Gate to schedules.json.

Source: on-post Pedestrian Gate poster, GREEN ROUTE, updated 15 July 2023
(photographed 2026-08-24, Photos-extra/green-route.jpg).

Poster shows arrival-at-Pedestrian-Gate times, not BT dispatches.

Mon-Fri (07:00-22:59):
  07:54; 08:09/24/39/54; 09-22 :09 :24 :39 :54  → 61 times
Sat-Sun (08:00-23:59):
  08-23 :24 :54                                  → 32 times
"""

import json

SRC = "/mnt/d/claude-projects/humphreys-transit/src/data/schedules.json"
STOP = "Pedestrian Gate"

def fmt(m):
    return f"{m // 60:02d}:{m % 60:02d}"

weekday = [fmt(7 * 60 + 54)]
for h in range(8, 23):
    for m in (9, 24, 39, 54):
        weekday.append(fmt(h * 60 + m))

weekend = []
for h in range(8, 24):
    for m in (24, 54):
        weekend.append(fmt(h * 60 + m))

with open(SRC) as f:
    data = json.load(f)

entry = data["stops"][STOP]
entry.setdefault("by_route_pdf", {})
entry["by_route_pdf"]["GREEN"] = {
    "MONDAY-FRIDAY": weekday,
    "SATURDAY": weekend,
    "SUNDAY": weekend,
}
if "GREEN" not in entry.get("routes_named", []):
    entry.setdefault("routes_named", []).append("GREEN")

data.setdefault("_meta", {}).setdefault("pdf_sources", {})["GREEN"] = (
    "Green Route Bus Stops and Timetables (Pedestrian Gate poster, updated 15 July 2023; "
    "photographed 2026-08-24, Photos-extra/green-route.jpg). Weekday 15-min :09/:24/:39/:54, "
    "weekend 30-min :24/:54. Other stops still use anchored heuristic."
)

with open(SRC, "w") as f:
    json.dump(data, f, indent=2, ensure_ascii=False)
    f.write("\n")

print(f"GREEN Pedestrian Gate: {len(weekday)} weekday, {len(weekend)} weekend")

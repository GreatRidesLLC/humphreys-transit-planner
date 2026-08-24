"""Add BLACK.MONDAY-FRIDAY arrival times at Pedestrian Gate to schedules.json.

Source: on-post Pedestrian Gate poster, BLACK ROUTE, updated 15 July 2023
(photographed 2026-08-24, Photos-extra/black-route.jpg).

Mon-Fri split shift: morning 06:00-08:45 + afternoon 15:00-18:45,
both windows every 15 min :00 :15 :30 :45. Midday 09-14 not served.
"""

import json

SRC = "/mnt/d/claude-projects/humphreys-transit/src/data/schedules.json"
STOP = "Pedestrian Gate"

def fmt(m):
    return f"{m // 60:02d}:{m % 60:02d}"

times = []
for h in list(range(6, 9)) + list(range(15, 19)):
    for m in (0, 15, 30, 45):
        times.append(fmt(h * 60 + m))

with open(SRC) as f:
    data = json.load(f)

entry = data["stops"][STOP]
entry.setdefault("by_route_pdf", {})
entry["by_route_pdf"]["BLACK"] = {"MONDAY-FRIDAY": times}
if "BLACK" not in entry.get("routes_named", []):
    entry.setdefault("routes_named", []).append("BLACK")

data.setdefault("_meta", {}).setdefault("pdf_sources", {})["BLACK"] = (
    "Black Route Pedestrian Gate poster (updated 15 July 2023; photographed 2026-08-24, "
    "Photos-extra/black-route.jpg). Mon-Fri split shift: 06:00-08:45 + 15:00-18:45, "
    "15-min headway. Other stops still use anchored heuristic."
)

with open(SRC, "w") as f:
    json.dump(data, f, indent=2, ensure_ascii=False)
    f.write("\n")

print(f"BLACK Pedestrian Gate: {len(times)} times")

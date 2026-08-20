"""Generate GREEN by_route_pdf entries for schedules.json.

Photo source: `scripts/cache/Photos-retake/green-route-1.jpg` (Green Route
"BUS TERMINAL — DEPARTURE TIMES" poster, updated 15 July 2023).
Two posters exist: `green-route-1.jpg` shows outbound dispatches at BT
(:00 :15 :30 :45 Mon–Fri, :00 :30 Sat–Sun); `green-route-2.jpg` shows
return-visits (:03 :18 :33 :48 / :18 :48), 48 min after the outbound.
Only outbound is added — passengers boarding at BT for onward travel
board the next OUTBOUND; return-visits over-report departures.

Only Bus Terminal is transcribed. Per-stop timetables for the other 19
Green stops still use the heuristic in `routing.js` (tracked in
Roadmap.md Known data gaps).
"""

import json

SRC = "/mnt/d/claude-projects/humphreys-transit/src/data/schedules.json"

def bt_times_mon_fri():
    out = []
    # 07:00 through 22:00 inclusive, every 15 min.
    for m in range(7 * 60, 22 * 60 + 1, 15):
        out.append(f"{m // 60:02d}:{m % 60:02d}")
    return out

def bt_times_sat_sun():
    out = []
    # 07:00 through 23:00 inclusive, every 30 min.
    for m in range(7 * 60, 23 * 60 + 1, 30):
        out.append(f"{m // 60:02d}:{m % 60:02d}")
    return out

GREEN_BT = {
    "MONDAY-FRIDAY":   bt_times_mon_fri(),
    "SATURDAY":        bt_times_sat_sun(),
    "SUNDAY":          bt_times_sat_sun(),
}

with open(SRC) as f:
    data = json.load(f)

# Sanity: 15-min from 07:00 to 22:00 inclusive = 61 entries.
assert len(GREEN_BT["MONDAY-FRIDAY"]) == 61, len(GREEN_BT["MONDAY-FRIDAY"])
# 30-min from 07:00 to 23:00 inclusive = 33 entries.
assert len(GREEN_BT["SATURDAY"]) == 33, len(GREEN_BT["SATURDAY"])

stops = data["stops"]
entry = stops.setdefault("Bus Terminal", {"times": [], "routes_named": [], "minutes_pattern": [], "by_route_pdf": {}})
entry.setdefault("by_route_pdf", {})
if "GREEN" not in entry.get("routes_named", []):
    entry.setdefault("routes_named", []).append("GREEN")
entry["by_route_pdf"]["GREEN"] = GREEN_BT

data.setdefault("_meta", {}).setdefault("pdf_sources", {})["GREEN"] = (
    "Green Route BUS TERMINAL Departure Times poster (photographed 2026-08-20, "
    "green-route-1.jpg; BT dispatch only, per-stop times pending)"
)

with open(SRC, "w") as f:
    json.dump(data, f, indent=2, ensure_ascii=False)
    f.write("\n")

print(f"Updated Bus Terminal with GREEN entries: "
      f"{ {k: len(v) for k, v in GREEN_BT.items()} }")

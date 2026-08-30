"""Generate GOLD by_route_pdf entries for schedules.json.

Data model: each stop's `by_route_pdf.GOLD.<DAYTYPE>` lists real-clock
arrival times on that day of the week. Photo source: Exhibit #0019
(Gold Route Bus Stops and Timetables, poster photographed 2026-08-20 —
files `scripts/cache/Photos-retake/gold-table-{1..4}.jpg`).

Bus Terminal dispatches per day-type (from photo headers):
  Mon–Fri (table 4): 09:00–15:30 every 30 min (14) + 16:00–20:00 every 15 min (17) = 31
  Sat     (table 2): 09:00–20:00 every 20 min (34)
  Sun     (table 1): 09:00–18:20 every 20 min (29)

Per-stop offsets in minutes from BT dispatch, taken from Sat photo trip 1
column (offsets are route-geometry constants, stable across day-types).
Two-visit stops (outbound + return-loop) carry both offsets.

Only 10 stops with confirmed canonical names go in. Photo also shows
CAC (S117), USO (S103), Family Housing Twr 1/2/3, O-6 Housing, and
Sentry Village PX — omitted until canonical mapping is verified
(tracked in Roadmap.md).
"""

import json

SRC = "/mnt/d/claude-projects/humphreys-transit/src/data/schedules.json"

# Offsets from BT dispatch, in minutes. [outbound, return-loop].
# BT itself is departure-only ([0]) — arrivals at offset 45 are trip end,
# not boardable for onward travel; adding them would over-report departures.
STOP_OFFSETS = {
    "Bus Terminal":                       [0],
    "Barracks (700s Block)":              [1, 40],
    "Morning Calm Center":                [2, 39],
    "Freedom Chapel":                     [5, 35],
    "Collier Fitness Center":             [6, 33],
    "Main Post Office":                   [13, 24],
    "Main Exchange (PX)":                 [14, 23],
    "Balboni Sports Field (Marne Ave)":   [15, 22],
    "Barracks (6800s Block)":             [17, 21],
    "River Bend Golf Course":             [18, 19],
    "Maude Hall (ID Cards)":              [3],
    "Sentry Village Shoppette":           [38],
}

def hm(mins):
    return f"{mins // 60:02d}:{mins % 60:02d}"

def dispatches_mon_fri():
    out = []
    m = 9 * 60
    while m <= 15 * 60 + 30:  # 09:00 .. 15:30 step 30
        out.append(m); m += 30
    m = 16 * 60
    while m <= 20 * 60:       # 16:00 .. 20:00 step 15
        out.append(m); m += 15
    return out

def dispatches_uniform(start_h, start_m, end_h, end_m, step):
    out = []
    m = start_h * 60 + start_m
    end = end_h * 60 + end_m
    while m <= end:
        out.append(m); m += step
    return out

DISPATCHES = {
    "MONDAY-FRIDAY": dispatches_mon_fri(),                        # 31
    "SATURDAY":      dispatches_uniform(9, 0, 20, 0, 20),         # 34
    "SUNDAY":        dispatches_uniform(9, 0, 18, 20, 20),        # 29
}

def gen_stop_schedule(offsets):
    """Returns { DAYKEY: sorted list of HH:MM }."""
    result = {}
    for day, disps in DISPATCHES.items():
        times = sorted({(bt + off) % 1440 for bt in disps for off in offsets})
        result[day] = [hm(t) for t in times]
    return result

with open(SRC) as f:
    data = json.load(f)

# Sanity check dispatch counts against photo headers.
assert len(DISPATCHES["MONDAY-FRIDAY"]) == 31, len(DISPATCHES["MONDAY-FRIDAY"])
assert len(DISPATCHES["SATURDAY"]) == 34, len(DISPATCHES["SATURDAY"])
assert len(DISPATCHES["SUNDAY"]) == 29, len(DISPATCHES["SUNDAY"])

stops = data["stops"]
touched = []
for name, offsets in STOP_OFFSETS.items():
    entry = stops.setdefault(name, {"times": [], "routes_named": [], "minutes_pattern": [], "by_route_pdf": {}})
    entry.setdefault("by_route_pdf", {})
    if "GOLD" not in entry.get("routes_named", []):
        entry.setdefault("routes_named", []).append("GOLD")
    entry["by_route_pdf"]["GOLD"] = gen_stop_schedule(offsets)
    touched.append(name)

data.setdefault("_meta", {}).setdefault("pdf_sources", {})["GOLD"] = (
    "Gold Route Bus Stops and Timetables (Exhibit #0019, on-post poster; "
    "photographed 2026-08-20, gold-table-1..4.jpg)"
)

with open(SRC, "w") as f:
    json.dump(data, f, indent=2, ensure_ascii=False)
    f.write("\n")

print(f"Updated {len(touched)} stops with GOLD entries:")
for n in touched:
    counts = {k: len(v) for k, v in stops[n]["by_route_pdf"]["GOLD"].items()}
    print(f"  {n}: {counts}")

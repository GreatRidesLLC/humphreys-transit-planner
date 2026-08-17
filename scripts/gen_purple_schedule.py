"""Generate PURPLE by_route_pdf entries for schedules.json.

Data model: each stop's `by_route_pdf.PURPLE.<DAYTYPE>` lists real-clock
arrival times on that day of the week. A bus BT-dispatched Fri 23:45 that
reaches BDAACH at 00:12 Sat belongs under BDAACH's SATURDAY bucket.

Service schedule (from posters, Exhibit #0022) — Bus Terminal dispatches:
  Mon–Thu: 19:00–22:45 every 15 min (16)
  Fri:     19:00–01:30 (next day) every 15 min (27)
  Sat:     09:00–01:30 (next day) every 15 min (67)
  Sun:     09:00–22:45 every 15 min (56)
"""

import json

SRC = "/mnt/d/claude-projects/humphreys-transit/src/data/schedules.json"

# Offsets in minutes from Bus Terminal dispatch. Two-visit stops carry both.
STOP_OFFSETS = {
    "Bus Terminal":                       [0],
    "Collier Fitness Center":             [3],
    "Turner Fitness Center":              [5, 22],
    "TMP / Driver's Licensing":           [7, 20],
    "Spartan DFAC":                       [9, 18],
    "Sitman Fitness Center":              [12],
    "Barracks (6800s & 6900s Block)":     [13],
    "Balboni Sports Field (5th St)":      [15],
    "Pittman DFAC":                       [16],
    "Brian D. Allgood Hospital":          [27],
}

# service_dow → BT dispatch times in minutes-from-that-day's-midnight
def cadence(start_hm, count, step=15):
    h, m = map(int, start_hm.split(":"))
    return [h * 60 + m + i * step for i in range(count)]

SERVICE_DAYS = {
    1: cadence("19:00", 16),  # Mon
    2: cadence("19:00", 16),  # Tue
    3: cadence("19:00", 16),  # Wed
    4: cadence("19:00", 16),  # Thu
    5: cadence("19:00", 27),  # Fri (overnight into Sat 01:30)
    6: cadence("09:00", 67),  # Sat (overnight into Sun 01:30)
    0: cadence("09:00", 56),  # Sun
}

# Available day-type keys from routing.js DAY_TYPE_DOWS. pickDayType picks
# the narrowest matching key, so Mon–Thu correctly resolves to
# "MONDAY-THURSDAY" not "MONDAY-SATURDAY" (the latter is unused here).
DOW_TO_KEY = {
    0: "SUNDAY",
    1: "MONDAY-THURSDAY",
    2: "MONDAY-THURSDAY",
    3: "MONDAY-THURSDAY",
    4: "MONDAY-THURSDAY",
    5: "FRIDAY",
    6: "SATURDAY",
}

def fmt(min_of_day):
    return f"{min_of_day // 60:02d}:{min_of_day % 60:02d}"

def gen_stop_schedule(offsets):
    """Returns { DAYKEY: sorted list of HH:MM } for one stop."""
    buckets = {}  # DAYKEY -> set(HH:MM)
    for service_dow, bt_disps in SERVICE_DAYS.items():
        for bt in bt_disps:
            for off in offsets:
                arrival = bt + off
                arrival_dow = service_dow if arrival < 1440 else (service_dow + 1) % 7
                hhmm = fmt(arrival % 1440)
                key = DOW_TO_KEY[arrival_dow]
                buckets.setdefault(key, set()).add(hhmm)
    return {k: sorted(v) for k, v in buckets.items()}

with open(SRC) as f:
    data = json.load(f)

stops = data["stops"]
touched = []
for name, offsets in STOP_OFFSETS.items():
    entry = stops.setdefault(name, {"times": [], "routes_named": [], "minutes_pattern": [], "by_route_pdf": {}})
    entry.setdefault("by_route_pdf", {})
    if "PURPLE" not in entry.get("routes_named", []):
        entry.setdefault("routes_named", []).append("PURPLE")
    entry["by_route_pdf"]["PURPLE"] = gen_stop_schedule(offsets)
    touched.append(name)

data.setdefault("_meta", {}).setdefault("pdf_sources", {})["PURPLE"] = (
    "Purple Route Bus Stops and Timetables (Exhibit #0022, on-post poster)"
)

with open(SRC, "w") as f:
    json.dump(data, f, indent=2, ensure_ascii=False)
    f.write("\n")

print(f"Updated {len(touched)} stops with PURPLE entries:")
for n in touched:
    counts = {k: len(v) for k, v in stops[n]["by_route_pdf"]["PURPLE"].items()}
    print(f"  {n}: {counts}")

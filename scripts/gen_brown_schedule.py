"""Generate BROWN by_route_pdf entries for schedules.json.

Photo source: `scripts/cache/Photos-retake/brown-route.jpg` (Brown Route
"BUS TERMINAL — DEPARTURE TIMES" poster, updated 15 July 2023, trial run).

Rebuilds all BROWN stop entries from BT dispatches + per-stop offsets.
Overwrites existing entries which were hand-transcribed and missing the
Fri 22:00 dispatch's derived times, plus Sat 19:00 / 19:30 / 22:00
dispatches' derived times, at every stop.

Per-stop offsets were verified against the existing schedules.json
first-entry values (offset from Fri 19:00 dispatch); poster does not
publish per-stop times, only BT dispatches.
"""

import json

SRC = "/mnt/d/claude-projects/humphreys-transit/src/data/schedules.json"

STOP_OFFSETS = {
    "Bus Terminal":                                    0,
    "Pedestrian Gate":                                 7,
    "Provider Grill DFAC":                            10,
    "SLQs (12200s Block)":                            12,
    "Eighth Army":                                    14,
    "Pacific Victors Chapel":                         20,
    "Downtown Plaza":                                 24,
    "Balboni Sports Field (Marne Ave)":               26,
    "Balboni Sports Field (5th St)":                  28,
    "Pittman DFAC":                                   60,
    "Spartan DFAC":                                   63,
    "TMP / Driver's Licensing":                       65,
    "Airfield Operations":                            68,
    "Family Housing Towers (Tropic Lightning Ave)":   71,
    "Collier Fitness Center":                         73,
}

def dispatches_fri():
    # Poster Friday: 19:00 30, 20:00 30, 21:00 30, 22:00 (last :00 only)
    out = []
    for h in (19, 20, 21):
        out.extend([h * 60, h * 60 + 30])
    out.append(22 * 60)
    return out

def dispatches_sat():
    # Poster Sat/TH: 16:00 30, 17:00 30, ..., 21:00 30, 22:00 (last :00 only)
    out = []
    for h in range(16, 22):
        out.extend([h * 60, h * 60 + 30])
    out.append(22 * 60)
    return out

DISPATCHES = {
    "FRIDAY":                       dispatches_fri(),
    "SATURDAY / TRAINING HOLIDAY":  dispatches_sat(),
}

def hm(mins):
    return f"{mins // 60:02d}:{mins % 60:02d}"

def gen_stop_schedule(offset):
    return {
        day: [hm((bt + offset) % 1440) for bt in disps]
        for day, disps in DISPATCHES.items()
    }

with open(SRC) as f:
    data = json.load(f)

assert len(DISPATCHES["FRIDAY"]) == 7, len(DISPATCHES["FRIDAY"])
assert len(DISPATCHES["SATURDAY / TRAINING HOLIDAY"]) == 13, len(DISPATCHES["SATURDAY / TRAINING HOLIDAY"])

stops = data["stops"]
touched = []
for name, offset in STOP_OFFSETS.items():
    entry = stops.setdefault(name, {"times": [], "routes_named": [], "minutes_pattern": [], "by_route_pdf": {}})
    entry.setdefault("by_route_pdf", {})
    if "BROWN" not in entry.get("routes_named", []):
        entry.setdefault("routes_named", []).append("BROWN")
    entry["by_route_pdf"]["BROWN"] = gen_stop_schedule(offset)
    touched.append(name)

data.setdefault("_meta", {}).setdefault("pdf_sources", {})["BROWN"] = (
    "Brown Route BUS TERMINAL Departure Times poster (photographed 2026-08-20, "
    "brown-route.jpg; trial run route)"
)

with open(SRC, "w") as f:
    json.dump(data, f, indent=2, ensure_ascii=False)
    f.write("\n")

print(f"Regenerated {len(touched)} stops with BROWN entries:")
for n in touched:
    counts = {k: len(v) for k, v in stops[n]["by_route_pdf"]["BROWN"].items()}
    print(f"  {n}: {counts}")

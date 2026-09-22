#!/usr/bin/env python3
"""Phase 1 Mapbox walk-probe (Roadmap.md `On-post walking directions`).

Calls the Mapbox Directions API `mapbox/walking` profile for a small set of
diagnostic stop pairs, writes per-pair GeoJSON files for satellite-basemap
visual verification in geojson.io, and prints a distance/ratio/duration
table for the Phase 1 gate.

Runs read-only against Mapbox. No src/data files are modified.

Env: MAPBOX_TOKEN (required). `source .env.mapbox` before running.
Output: scripts/mapbox_probe_output/<pair-slug>.geojson (gitignored).
"""

import json
import math
import os
import sys
from datetime import date
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

REPO = Path(__file__).resolve().parent.parent
COORDS = json.loads((REPO / "src/data/stop_coords.json").read_text())["stops"]
OUT_DIR = REPO / "scripts/mapbox_probe_output"
OUT_DIR.mkdir(exist_ok=True)

# The three Phase 1 gate pairs from Roadmap.md:
#   - Downtown Plaza -> Family Housing 5050s: 2.5x haversine outlier from the
#     2026-09-21 7-pair diagnostic; satellite pass must show a real path.
#   - Pedestrian Gate -> Bus Terminal: second flagged pair from the same run.
#   - Bus Terminal -> Main Exchange (PX): ground-truth walk pair (~46 min
#     Mapbox estimate); user clocks this on foot for the >30% reject test.
PAIRS = [
    ("Downtown Plaza", "Family Housing Towers (5050s Block)"),
    ("Pedestrian Gate", "Bus Terminal"),
    ("Bus Terminal", "Main Exchange (PX)"),
]

TOKEN = os.environ.get("MAPBOX_TOKEN")
if not TOKEN:
    sys.exit("MAPBOX_TOKEN not set — `source .env.mapbox` before running.")


def haversine_m(lat1, lon1, lat2, lon2):
    R = 6371000
    to_rad = math.radians
    d_lat = to_rad(lat2 - lat1)
    d_lon = to_rad(lon2 - lon1)
    a = math.sin(d_lat / 2) ** 2 + math.cos(to_rad(lat1)) * math.cos(to_rad(lat2)) * math.sin(d_lon / 2) ** 2
    return 2 * R * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def directions(a, b):
    url = (
        "https://api.mapbox.com/directions/v5/mapbox/walking/"
        f"{a['lon']},{a['lat']};{b['lon']},{b['lat']}"
        f"?geometries=geojson&overview=full&steps=false&access_token={TOKEN}"
    )
    req = Request(url, headers={"User-Agent": "humphreys-transit/phase1-probe"})
    try:
        with urlopen(req, timeout=30) as r:
            return json.loads(r.read())
    except HTTPError as e:
        sys.exit(f"Mapbox HTTP {e.code}: {e.read().decode('utf-8', 'replace')[:200]}")
    except URLError as e:
        sys.exit(f"Mapbox network error: {e.reason}")


def slug(name):
    return (
        name.lower()
        .replace(" ", "-")
        .replace("(", "")
        .replace(")", "")
        .replace("'", "")
    )


def feature_collection(a_name, b_name, a, b, route, hav):
    return {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "geometry": route["geometry"],
                "properties": {
                    "name": f"mapbox walking: {a_name} → {b_name}",
                    "distance_m": route["distance"],
                    "duration_s": route["duration"],
                    "duration_min": round(route["duration"] / 60, 1),
                    "stroke": "#e11d48",
                    "stroke-width": 4,
                    "stroke-opacity": 0.9,
                },
            },
            {
                "type": "Feature",
                "geometry": {
                    "type": "LineString",
                    "coordinates": [[a["lon"], a["lat"]], [b["lon"], b["lat"]]],
                },
                "properties": {
                    "name": f"haversine straight-line: {a_name} → {b_name}",
                    "distance_m": round(hav),
                    "stroke": "#3b82f6",
                    "stroke-width": 2,
                    "stroke-opacity": 0.6,
                },
            },
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [a["lon"], a["lat"]]},
                "properties": {"name": a_name, "marker-color": "#16a34a", "marker-symbol": "a"},
            },
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [b["lon"], b["lat"]]},
                "properties": {"name": b_name, "marker-color": "#dc2626", "marker-symbol": "b"},
            },
        ],
    }


def main():
    print(f"Mapbox walk probe  ·  generated {date.today().isoformat()}\n")
    header = f"{'PAIR':<70} {'mapbox_m':>10} {'hav_m':>8} {'ratio':>6} {'minutes':>8}"
    print(header)
    print("-" * len(header))
    for a_name, b_name in PAIRS:
        a = COORDS.get(a_name)
        b = COORDS.get(b_name)
        if not a or not b:
            print(f"SKIP {a_name!r} or {b_name!r} — missing from stop_coords.json")
            continue
        resp = directions(a, b)
        if not resp.get("routes"):
            print(f"NO ROUTE  {a_name} -> {b_name}  ({resp.get('message', 'unknown')})")
            continue
        route = resp["routes"][0]
        hav = haversine_m(a["lat"], a["lon"], b["lat"], b["lon"])
        ratio = route["distance"] / hav if hav > 0 else float("inf")
        minutes = round(route["duration"] / 60, 1)
        pair_label = f"{a_name} -> {b_name}"
        print(f"{pair_label:<70} {route['distance']:>10.0f} {hav:>8.0f} {ratio:>6.2f} {minutes:>8}")

        out = OUT_DIR / f"{slug(a_name)}__to__{slug(b_name)}.geojson"
        out.write_text(json.dumps(feature_collection(a_name, b_name, a, b, route, hav), indent=2))

    print(f"\nGeoJSON written to {OUT_DIR.relative_to(REPO)}/")
    print("Verify: open https://geojson.io/, drop each .geojson in, switch basemap → Satellite.")
    print("Reject if the red polyline ghosts through buildings, crosses phantom fences, or ignores gates.")


if __name__ == "__main__":
    main()

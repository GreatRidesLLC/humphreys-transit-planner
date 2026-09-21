#!/usr/bin/env python3
"""
Build src/data/stop_coords.json — bus-stop name → {lat, lon, source}.

Primary source: OSM nodes tagged `highway=bus_stop` with `operator=USAG Humphreys`
inside the installation polygon (way 245548245). Most ROUTES stops have an
exact or near-exact match by name.

Fallback for the handful of stops with no OSM bus_stop node: lat/lon of the
closest associated building from src/data/buildings_osm.json.
"""
from __future__ import annotations

import json
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ROUTES_JS = ROOT / "src" / "lib" / "routing.js"
BUILDINGS_JSON = ROOT / "src" / "data" / "buildings_osm.json"
OUT = ROOT / "src" / "data" / "stop_coords.json"

OVERPASS = """
[out:json][timeout:60];
way(245548245);map_to_area->.base;
(
  node["highway"="bus_stop"](area.base);
  node["public_transport"="platform"](area.base);
);
out tags center;
"""


def fetch_osm_stops() -> list[dict]:
    proc = subprocess.run(
        [
            "curl", "-sS", "-G", "https://overpass-api.de/api/interpreter",
            "--data-urlencode", f"data={OVERPASS}",
            "-A", "HumphreysTransit/0.1",
        ],
        capture_output=True, text=True, check=True,
    )
    data = json.loads(proc.stdout)
    out = []
    for e in data.get("elements", []):
        t = e.get("tags", {})
        op = t.get("operator", "")
        # Match "USAG Humphreys", common typo "USAG Humpheys", and bare "Humphreys".
        if "humph" not in op.lower():
            continue
        out.append({
            "id": e["id"],
            "lat": e["lat"],
            "lon": e["lon"],
            "name": t.get("name", ""),
            "name_ko": t.get("name:ko", ""),
        })
    return out


def parse_routes_stops() -> set[str]:
    """Extract the union of all stop names from ROUTES in src/lib/routing.js."""
    text = ROUTES_JS.read_text()
    m = re.search(r"const ROUTES\s*=\s*\{(.+?)^\};", text, re.S | re.M)
    if not m:
        sys.exit("ROUTES const not found in " + str(ROUTES_JS))
    body = m.group(1)
    stops: set[str] = set()
    for stops_blob in re.finditer(r"stops:\[(.+?)\]", body, re.S):
        for s in re.findall(r"\"([^\"]+)\"", stops_blob.group(1)):
            stops.add(s)
    return stops


# Normalise: lowercase + strip everything except a-z0-9 to make fuzzy
# match between our names and the OSM longer/shorter variants tractable.
def slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", name.lower())


# Hand mappings for stops where OSM name and ROUTES name diverge meaningfully
# (e.g. "MSG Jenkins Medical Clinic" vs "MSG Henry L. Jenkins Medical Clinic").
# Key is our ROUTES name; value is the OSM name we expect to match.
EXPLICIT_OSM_NAME = {
    "Brian D. Allgood Hospital":          "Brian D. Allgood Army Community Hospital",
    "Eighth Army HQ":                     "Eighth Army",
    "MSG Jenkins Medical Clinic":         "MSG Henry L. Jenkins Medical Clinic",
    "KTO Museum":                         "Korean Theater of Operations Museum",
    "Law Enforcement Center (DES)":       "Law Enforcement Center",
    "LTG Maude Hall (9th St)":            "LTG Timothy J. Maude Hall",
    "Main Exchange (PX)":                 "Main Exchange",
    "Collier Fitness Center":             "Collier Community Fitness Center",
    "Family Housing Towers (Tropic Lightning Ave)": "Family Housing Towers (Tropic Lightning Avenue)",
    "Family Housing Towers (Taro Ave)":   "Family Housing Towers (Taro Avenue)",
    "Family Mini Mall / Gas Station":     "Family Mini Mall/Gas Station",
    "Balboni Sports Field (5th St)":      "Balboni Sports Field Complex (5th Street)",
    "Balboni Sports Field (Marne Ave)":   "Balboni Sports Field Complex (Marne Avenue)",
    "TMP / Driver's Licensing":           "TMP (Driver's licensing)",
    "Barracks (6800s Block)":             "Barracks (6800s & 6900s Block)",  # OSM has only the combined node
}

# Fallback for stops not represented in OSM as a bus_stop node.
# Coordinates copied from a representative on-post building.
# Format: stop_name → {"lat": ..., "lon": ..., "via": "building #X"}
MANUAL_FALLBACKS_BY_BUILDING_NUM = {
    "River Bend Golf Course": "5904",
}

# Hand-pinned coordinates for stops with no OSM bus_stop node and no clean
# building fallback. Each entry carries a `source` line explaining the pin —
# these are approximate (usually within ~50-100 m) and should be refined when
# ground-truthed. Field intel: on-post shelters carry only an "S-####" ref
# with no route or stop name, so OSM mappers routinely miss these.
MANUAL_COORDS = {
    "Family Housing Towers (15th Street)": {
        "lat": 36.9556, "lon": 127.0158,
        "source": "hand-pinned; OSM has no bus_stop node for this Pink-route trial stop; SW terminus of 15th Street way 1019688918",
    },
    "SOCKOR HQ": {
        "lat": 36.9756, "lon": 126.9872,
        "source": "estimated 2026-08-24 by interpolating Blue-route offsets (2ID Sustainment min 33 → SOCKOR HQ min 34 → Central Issue Facility min 36 → 1/3 of the way from 2ID to CIF); OSM has no bus_stop node, office, or building named SOCKOR on-post",
    },
    "USO Sentry Village": {
        "lat": 36.9493211, "lon": 127.0251725,
        "source": "hand-pinned to OSM building #301 (USO Sentry Village); no bus_stop node exists",
    },
    "USO Sentry Village (Opposite)": {
        "lat": 36.9495, "lon": 127.0243,
        "source": "hand-pinned across the road from USO building #301 (~50 m NW); Gold's return-leg pair to USO Sentry Village on the outbound leg",
    },
    "Sentry Village Shoppette": {
        "lat": 36.9484, "lon": 127.0245,
        "source": "estimated inside the Sentry Village retail cluster ~50 m N of Mini Mall (bldg 400); no OSM bus_stop node — refine when ground-truthed",
    },
    "Sentry Village Gate": {
        "lat": 36.9490, "lon": 127.0272,
        "source": "estimated at the Sentry Village north entry gate (near OSM lift_gate 36.9490, 127.0273); Gold enters Sentry Village here between Morning Calm Center and USO. Renamed 2026-09-21 from 'CAC (Sentry Village)' — poster 'CAC' = Central Access Control (gate), not the Common Access Card office (which is at LTG Maude Hall).",
    },
    "Family Housing Towers (5100s Block)": {
        "lat": 36.9574, "lon": 127.0139,
        "source": "estimated centroid of OSM buildings 5101/5102/5103 (Blackhawk/Apache/Chinook Towers)",
    },
    "Family Housing Towers (5050s Block)": {
        "lat": 36.9560, "lon": 127.0135,
        "source": "estimated south of the 5100s Blackhawk/Apache/Chinook cluster in the Family Housing area; no OSM data for this stop or the 5050s buildings — refine when ground-truthed",
    },
    "Officer Housing": {
        "lat": 36.9600, "lon": 127.0090,
        "source": "estimated on the road between Family Housing Towers (5100s) and Red Cloud Circle; no OSM data for the Officer Housing bus stop — refine when ground-truthed",
    },
}


def main() -> int:
    print("Fetching OSM bus_stop nodes…", flush=True)
    osm_stops = fetch_osm_stops()
    print(f"  USAG-operated stops in OSM: {len(osm_stops)}", flush=True)

    routes_stops = parse_routes_stops()
    print(f"  unique stops in ROUTES: {len(routes_stops)}", flush=True)

    osm_by_slug = {slug(s["name"]): s for s in osm_stops if s["name"]}
    buildings = json.loads(BUILDINGS_JSON.read_text())["buildings"]

    out: dict[str, dict] = {}
    unmatched: list[str] = []
    for stop in sorted(routes_stops):
        # Direct or aliased OSM match
        target_name = EXPLICIT_OSM_NAME.get(stop, stop)
        hit = osm_by_slug.get(slug(target_name))
        if hit:
            out[stop] = {
                "lat": hit["lat"],
                "lon": hit["lon"],
                "source": f"osm bus_stop {hit['id']}",
                "name_ko": hit["name_ko"] or None,
            }
            continue
        # Building-number fallback
        bnum = MANUAL_FALLBACKS_BY_BUILDING_NUM.get(stop)
        if bnum and bnum in buildings:
            b = buildings[bnum]
            out[stop] = {
                "lat": b["lat"],
                "lon": b["lon"],
                "source": f"building #{bnum} ({b.get('name','')})",
                "name_ko": None,
            }
            continue
        # Hand-pinned fallback
        manual = MANUAL_COORDS.get(stop)
        if manual:
            out[stop] = {
                "lat": manual["lat"],
                "lon": manual["lon"],
                "source": manual["source"],
                "name_ko": None,
            }
            continue
        unmatched.append(stop)

    payload = {
        "_meta": {
            "source": "OpenStreetMap via Overpass API (highway=bus_stop, operator=USAG Humphreys)",
            "polygon_osm_way": 245548245,
            "fetched_at": datetime.now(timezone.utc).isoformat(),
            "license": "ODbL 1.0 — © OpenStreetMap contributors",
            "matched": len(out),
            "unmatched": unmatched,
            "total_routes_stops": len(routes_stops),
        },
        "stops": dict(sorted(out.items())),
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n")
    print(f"  matched {len(out)}/{len(routes_stops)} stops, unmatched: {unmatched}", flush=True)
    print(f"  wrote {OUT.relative_to(ROOT)}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

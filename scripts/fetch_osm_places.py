#!/usr/bin/env python3
"""
Query the OpenStreetMap Overpass API for named places inside the USAG
Humphreys polygon (OSM way 245548245) that carry NO building number, and
emit src/data/places_osm.json.

fetch_osm_buildings.py keeps only features with `addr:housenumber`, so
notable places mapped without one (Humphreys Central Elementary School,
Humphreys High School, the Child Development Center, parks, fields,
food-court outlets) never reached the search index. This file fills that
gap. Numbered features stay in buildings_osm.json; names that are already
a bus stop are skipped so search doesn't list them twice.

Run again whenever OSM mappers add or correct places.
"""
from __future__ import annotations

import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "src" / "data" / "places_osm.json"
STOP_COORDS = ROOT / "src" / "data" / "stop_coords.json"

# Named features of the kinds people navigate to. `building` catches named
# buildings tagged with nothing else (e.g. "Child Development Center").
KIND_KEYS = ["amenity", "leisure", "shop", "office", "healthcare", "tourism", "building"]

OVERPASS_QUERY = """
[out:json][timeout:90];
way(245548245);map_to_area->.base;
(
""" + "".join(f'  nwr["name"]["{k}"](area.base);\n' for k in KIND_KEYS) + """);
out tags center;
"""


def fetch() -> dict:
    proc = subprocess.run(
        [
            "curl", "-sS", "-G", "https://overpass-api.de/api/interpreter",
            "--data-urlencode", f"data={OVERPASS_QUERY}",
            "-A", "HumphreysTransit/0.1",
        ],
        capture_output=True, text=True, check=True,
    )
    return json.loads(proc.stdout)


def main() -> int:
    # Overpass is often overloaded (504 / empty body). A saved response can be
    # passed instead: python3 scripts/fetch_osm_places.py saved.json
    if len(sys.argv) > 1:
        print(f"Reading saved Overpass response {sys.argv[1]}…", flush=True)
        elems = json.loads(Path(sys.argv[1]).read_text()).get("elements", [])
    else:
        print("Querying Overpass for named USAG Humphreys places…", flush=True)
        elems = fetch().get("elements", [])
    print(f"  raw elements: {len(elems)}", flush=True)

    coords = json.loads(STOP_COORDS.read_text())
    stop_names = {n.lower() for n in coords.get("stops", coords)}

    places = []
    skipped_numbered = skipped_stop = 0
    for e in elems:
        tags = e.get("tags", {})
        if tags.get("addr:housenumber"):
            skipped_numbered += 1
            continue
        name = tags.get("name:en") or tags.get("name") or ""
        if not name:
            continue
        if name.lower() in stop_names:
            skipped_stop += 1
            continue
        center = e.get("center") or {"lat": e.get("lat"), "lon": e.get("lon")}
        kind = next((f"{k}={tags[k]}" for k in KIND_KEYS if k in tags), None)
        places.append({
            "name": name,
            "name_ko": tags.get("name:ko"),
            "kind": kind,
            "lat": center.get("lat"),
            "lon": center.get("lon"),
            "osm_id": f"{e['type']}/{e['id']}",
        })

    places.sort(key=lambda p: (p["name"].lower(), p["osm_id"]))
    payload = {
        "_meta": {
            "source": "OpenStreetMap via Overpass API",
            "polygon_osm_way": 245548245,
            "fetched_at": datetime.now(timezone.utc).isoformat(),
            "license": "ODbL 1.0 — © OpenStreetMap contributors",
            "elements_total": len(elems),
            "places": len(places),
        },
        "places": places,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n")
    print(f"  unnumbered named places: {len(places)}", flush=True)
    print(f"  skipped (numbered, in buildings_osm.json): {skipped_numbered}", flush=True)
    print(f"  skipped (name is already a bus stop): {skipped_stop}", flush=True)
    print(f"  wrote {OUT.relative_to(ROOT)}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
"""
Query the OpenStreetMap Overpass API for every building inside the USAG
Humphreys polygon (OSM way 245548245) and emit src/data/buildings_osm.json.

The data is community-sourced — quality varies. A separate downstream pass
(scripts/merge_buildings.py) is expected to consume this file and decide
which entries are confident enough to merge into the BUILDINGS const in
App.jsx.

Run again whenever OSM mappers add or correct buildings.
"""
from __future__ import annotations

import json
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "src" / "data" / "buildings_osm.json"

OVERPASS_QUERY = """
[out:json][timeout:90];
way(245548245);map_to_area->.base;
(
  way["building"](area.base);
  node["building"](area.base);
);
out tags center 2000;
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


# Mappings of OSM `name` patterns to the bus-stop names we already use in
# ROUTES. These are deliberately conservative; only obvious matches are
# included. Anything ambiguous falls into "unmatched" and stays out of the
# committed BUILDINGS const without a manual review.
NAME_TO_STOP = [
    (re.compile(r"\bMaude Hall\b", re.I),                    "LTG Maude Hall (9th St)"),
    (re.compile(r"\bAllgood\b", re.I),                       "Brian D. Allgood Hospital"),
    (re.compile(r"\bJenkins\b", re.I),                       "MSG Jenkins Medical Clinic"),
    (re.compile(r"\bCorps of Engineers\b", re.I),            "Corps of Engineers"),
    (re.compile(r"Freedom Chapel", re.I),                    "Freedom Chapel"),
    (re.compile(r"Pacific Victors Chapel|Victor.s Chapel", re.I), "Pacific Victors Chapel"),
    (re.compile(r"Talon Caf[eé]", re.I),                     "Talon Cafe DFAC"),
    (re.compile(r"Spartan Dining|Spartan DFAC", re.I),       "Spartan DFAC"),
    (re.compile(r"Pittman DFAC|Pittman Dining", re.I),       "Pittman DFAC"),
    (re.compile(r"Provider Grill", re.I),                    "Provider Grill DFAC"),
    (re.compile(r"\bCommissary\b", re.I),                    "Commissary"),
    (re.compile(r"\bPost Office\b", re.I),                   "Main Post Office"),
    (re.compile(r"\bExchange\b|\bPX\b|\bMain PX\b", re.I),   "Main Exchange (PX)"),
    (re.compile(r"Collier", re.I),                           "Collier Fitness Center"),
    (re.compile(r"Sitman", re.I),                            "Sitman Fitness Center"),
    (re.compile(r"Turner Fitness", re.I),                    "Turner Fitness Center"),
    (re.compile(r"Bus Terminal", re.I),                      "Bus Terminal"),
    (re.compile(r"Sentry Village.*Burger King", re.I),       "Sentry Village Burger King"),
    (re.compile(r"Sentry Village.*Mini Mall", re.I),         "Sentry Village Mini Mall"),
    (re.compile(r"Morning Calm", re.I),                      "Morning Calm Center"),
    (re.compile(r"\bDPW\b", re.I),                           "Corps of Engineers"),
    (re.compile(r"\bDES\b|Law Enforcement", re.I),           "Law Enforcement Center (DES)"),
    (re.compile(r"Eighth Army", re.I),                       "Eighth Army HQ"),
    (re.compile(r"River Bend", re.I),                        "River Bend Golf Course"),
    (re.compile(r"Desiderio", re.I),                         "Desiderio ATC Tower"),
    (re.compile(r"Lodging|Army Lodge", re.I),                "Lodging"),
    (re.compile(r"Airfield Operations", re.I),               "Airfield Operations"),
    (re.compile(r"Humphreys Hub|Building 501", re.I),        "Bus Terminal"),
    (re.compile(r"Family Mini Mall", re.I),                  "Family Mini Mall / Gas Station"),
]


def normalize_house_number(raw: str) -> str | None:
    """Drop trailing letters, '-N' subunits, and non-numeric chars."""
    if not raw:
        return None
    raw = raw.strip()
    # OSM commonly has "6140", "6140A", "6140-1" — keep just the base number.
    m = re.match(r"^(\d+)", raw)
    return m.group(1) if m else None


def guess_stop(name: str) -> str | None:
    if not name:
        return None
    for rx, stop in NAME_TO_STOP:
        if rx.search(name):
            return stop
    return None


def main() -> int:
    print("Querying Overpass for USAG Humphreys buildings…", flush=True)
    data = fetch()
    elems = data.get("elements", [])
    print(f"  raw elements: {len(elems)}", flush=True)

    buildings: dict[str, dict] = {}
    skipped_no_number = 0
    name_matched = 0

    for e in elems:
        tags = e.get("tags", {})
        num = normalize_house_number(tags.get("addr:housenumber", ""))
        if not num:
            skipped_no_number += 1
            continue
        name = tags.get("name:en") or tags.get("name") or ""
        stop = guess_stop(name)
        if stop:
            name_matched += 1
        # Center coordinates (way) or node lat/lon.
        center = e.get("center") or {"lat": e.get("lat"), "lon": e.get("lon")}
        # Prefer the entry with a name when duplicate numbers appear.
        existing = buildings.get(num)
        candidate = {
            "name": name or None,
            "stop": stop,
            "lat": center.get("lat"),
            "lon": center.get("lon"),
            "osm_id": f"{e['type']}/{e['id']}",
            "amenity": tags.get("amenity"),
            "operator": tags.get("operator"),
        }
        if existing is None or (not existing.get("name") and candidate["name"]):
            buildings[num] = candidate

    payload = {
        "_meta": {
            "source": "OpenStreetMap via Overpass API",
            "polygon_osm_way": 245548245,
            "fetched_at": datetime.now(timezone.utc).isoformat(),
            "license": "ODbL 1.0 — © OpenStreetMap contributors",
            "elements_total": len(elems),
            "buildings_with_number": len(buildings),
            "name_matched_to_stop": name_matched,
        },
        "buildings": dict(sorted(buildings.items(), key=lambda kv: int(kv[0]))),
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n")
    print(
        f"  numbered buildings: {len(buildings)} "
        f"({name_matched} mapped to a stop by name)",
        flush=True,
    )
    print(f"  skipped (no addr:housenumber): {skipped_no_number}", flush=True)
    print(f"  wrote {OUT.relative_to(ROOT)}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

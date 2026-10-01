#!/usr/bin/env python3
"""
Query the OpenStreetMap Overpass API for named streets inside the USAG
Humphreys polygon (OSM way 245548245) and emit src/data/streets.json.

On post, OSM maps most sidewalks as their own unnamed footways, so Mapbox
walking directions call them "the walkway": a walk down Marne Avenue reads
"Turn left onto the walkway". The Worker (worker/steps.js) matches each
unnamed step against these street lines and names the sidewalk after the
street it runs beside ("Turn left onto Marne Avenue"), and spots a short
step that crosses one ("Cross 11th Street").

Geometry is simplified to ~2 m and rounded to 1e-5 degrees (~1 m): plenty
for "which street is this sidewalk next to", and it keeps the Worker bundle
small. Run again whenever OSM mappers add or rename streets.
"""
from __future__ import annotations

import json
import math
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "src" / "data" / "streets.json"

# Streets a walker would name. Footways, paths and steps are left out: they
# are what we are trying to name, not what we name them after. So are
# service roads: on post their names are parking rows ("A", "B", …) and
# driveways named after the building they serve.
HIGHWAY_RE = "^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street)(_link)?$"
MIN_NAME_LEN = 3

OVERPASS_QUERY = f"""
[out:json][timeout:90];
way(245548245);map_to_area->.base;
way["highway"~"{HIGHWAY_RE}"]["name"](area.base);
out tags geom;
"""

SIMPLIFY_M = 2.0
M_PER_DEG_LAT = 110540.0
M_PER_DEG_LON = 111320.0 * math.cos(math.radians(36.965))


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


def _seg_dist_m(p, a, b) -> float:
    px, py = p[0] * M_PER_DEG_LON, p[1] * M_PER_DEG_LAT
    ax, ay = a[0] * M_PER_DEG_LON, a[1] * M_PER_DEG_LAT
    bx, by = b[0] * M_PER_DEG_LON, b[1] * M_PER_DEG_LAT
    dx, dy = bx - ax, by - ay
    t = 0.0 if dx == dy == 0 else max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    return math.hypot(px - ax - t * dx, py - ay - t * dy)


def simplify(pts: list, tol: float) -> list:
    """Douglas-Peucker in metres."""
    if len(pts) < 3:
        return pts
    worst, idx = 0.0, 0
    for i in range(1, len(pts) - 1):
        d = _seg_dist_m(pts[i], pts[0], pts[-1])
        if d > worst:
            worst, idx = d, i
    if worst <= tol:
        return [pts[0], pts[-1]]
    return simplify(pts[: idx + 1], tol)[:-1] + simplify(pts[idx:], tol)


def main() -> int:
    # Overpass is often overloaded (504 / empty body). A saved response can be
    # passed instead: python3 scripts/fetch_osm_streets.py saved.json
    if len(sys.argv) > 1:
        print(f"Reading saved Overpass response {sys.argv[1]}…", flush=True)
        elems = json.loads(Path(sys.argv[1]).read_text()).get("elements", [])
    else:
        print("Querying Overpass for named USAG Humphreys streets…", flush=True)
        elems = fetch().get("elements", [])

    streets = []
    for e in elems:
        tags = e.get("tags", {})
        geom = e.get("geometry") or []
        if len(geom) < 2:
            continue
        # Bilingual `name` values ("11th Street; 11번가") keep the English
        # half; the Korean one comes from name:ko.
        name = (tags.get("name:en") or tags["name"]).split(";")[0].strip()
        if len(name) < MIN_NAME_LEN:
            continue
        pts = simplify([[g["lon"], g["lat"]] for g in geom], SIMPLIFY_M)
        streets.append({
            "name": name,
            "name_ko": tags.get("name:ko"),
            "coords": [[round(x, 5), round(y, 5)] for x, y in pts],
        })
    streets.sort(key=lambda s: (s["name"], s["coords"][0]))

    out = {
        "_meta": {
            "source": "OpenStreetMap contributors (ODbL) via Overpass; named highways in way 245548245",
            "fetched_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "simplify_m": SIMPLIFY_M,
            "count": len(streets),
        },
        "streets": streets,
    }
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")) + "\n")
    names = sorted({s["name"] for s in streets})
    print(f"Wrote {len(streets)} ways ({len(names)} names) → {OUT.relative_to(ROOT)} "
          f"({OUT.stat().st_size // 1024} KB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())

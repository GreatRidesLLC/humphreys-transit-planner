#!/usr/bin/env python3
"""
Precompute "start from this side" points for big on-post places and emit
src/data/building_sides.json.

A big footprint (a school campus, the hospital, the PX) is a bad walk start:
the app used its centre, so every walk left from whichever road Mapbox
snapped that centre to, often the wrong side of the building. OSM maps
almost no entrances on post (5 as of 2026-09-28), so instead we offer one
start per named street that borders the footprint: "W Lewis St side",
"Pacific Victors Ave side". The start point is the spot on that street
closest to the building, so the walk begins on the street the label names.

Keys match the search index: "bldg:<number>" for numbered buildings and
"osm:<type>/<id>" for unnumbered places (places_osm.json).

Data: the OSM main API map call over the Humphreys bbox, in 4 tiles.
Overpass is too often overloaded for this. Pass a directory of saved .osm
tiles to skip the download:
    python3 scripts/gen_building_sides.py [tiles_dir]
"""
from __future__ import annotations

import glob
import json
import math
import re
import subprocess
import sys
import tempfile
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "src" / "data" / "building_sides.json"

BBOX = (36.945, 126.985, 36.980, 127.045)  # minLat, minLon, maxLat, maxLon
MIN_AREA_M2 = 3000       # "big" footprint (42 named places as of 2026-09-28)
MAX_STREET_GAP_M = 90    # a named street this close borders it (parking lots sit between)
MAX_SIDES = 4
FEATURE_KEYS = ("building", "amenity", "leisure", "shop", "healthcare", "office")


def download(dirpath: Path) -> None:
    lat0, lon0, lat1, lon1 = BBOX
    latm, lonm = (lat0 + lat1) / 2, (lon0 + lon1) / 2
    tiles = [(lat0, lon0, latm, lonm), (lat0, lonm, latm, lon1),
             (latm, lon0, lat1, lonm), (latm, lonm, lat1, lon1)]
    for i, (a, b, c, d) in enumerate(tiles):
        url = f"https://api.openstreetmap.org/api/0.6/map?bbox={b},{a},{d},{c}"
        print(f"  tile {i + 1}/4 …", flush=True)
        subprocess.run(["curl", "-sS", "-f", "--max-time", "120", "-A", "HumphreysTransit/0.1",
                        url, "-o", str(dirpath / f"t{i}.osm")], check=True)


def load(dirpath: Path):
    nodes, ways, rels = {}, {}, []
    for f in sorted(glob.glob(str(dirpath / "*.osm"))):
        root = ET.parse(f).getroot()
        for n in root.iter("node"):
            nodes[n.get("id")] = (float(n.get("lat")), float(n.get("lon")))
        for w in root.iter("way"):
            ways[w.get("id")] = ([nd.get("ref") for nd in w.iter("nd")],
                                 {t.get("k"): t.get("v") for t in w.iter("tag")})
        for r in root.iter("relation"):
            rels.append((r.get("id"),
                         [(m.get("type"), m.get("ref"), m.get("role")) for m in r.iter("member")],
                         {t.get("k"): t.get("v") for t in r.iter("tag")}))
    return nodes, ways, rels


LAT0 = math.radians((BBOX[0] + BBOX[2]) / 2)
def xy(p):  # local metres
    return (p[1] * 111320 * math.cos(LAT0), p[0] * 110540)


def unxy(q):
    return (q[1] / 110540, q[0] / (111320 * math.cos(LAT0)))


def area(pts):
    q = [xy(p) for p in pts]
    return abs(sum(q[i][0] * q[i - 1][1] - q[i - 1][0] * q[i][1] for i in range(len(q)))) / 2


def closest_on_segment(p, a, b):
    ax, ay = a; bx, by = b; px, py = p
    dx, dy = bx - ax, by - ay
    L = dx * dx + dy * dy
    t = 0 if L == 0 else max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / L))
    return (ax + t * dx, ay + t * dy)


def closest_between(poly, line):
    """Closest (distance, point on `line`) between two polylines (metres)."""
    best = (math.inf, None)
    for P, Q in ((poly, line), (line, poly)):
        for p in P:
            for i in range(1, len(Q)):
                c = closest_on_segment(p, Q[i - 1], Q[i])
                d = math.dist(p, c)
                if d < best[0]:
                    # always report the point that lies on the street
                    best = (d, c if Q is line else p)
    return best


HANGUL = re.compile(r"[가-힣]")
def split_name(tags):
    name = tags.get("name", "")
    en, ko = tags.get("name:en"), tags.get("name:ko")
    if "/" in name:
        a, b = (s.strip() for s in name.split("/", 1))
        if HANGUL.search(b) and not HANGUL.search(a):
            en, ko = en or a, ko or b
        elif HANGUL.search(a) and not HANGUL.search(b):
            en, ko = en or b, ko or a
    if not en:
        en = None if HANGUL.search(name) else name
    return en, ko


def main() -> int:
    if len(sys.argv) > 1:
        tiles = Path(sys.argv[1])
    else:
        tiles = Path(tempfile.mkdtemp(prefix="osm_tiles_"))
        print(f"Downloading OSM map tiles to {tiles}…", flush=True)
        download(tiles)
    nodes, ways, rels = load(tiles)

    def pts(refs):
        return [nodes[r] for r in refs if r in nodes]

    def in_bbox(p):
        return BBOX[0] <= p[0] <= BBOX[2] and BBOX[1] <= p[1] <= BBOX[3]

    # Named streets (any highway), as local-metre polylines.
    streets = []
    for refs, tags in ways.values():
        if "highway" not in tags or "name" not in tags:
            continue
        en, ko = split_name(tags)
        if not en or len(en) <= 2:   # parking-lot lanes "A", "B", …
            continue
        line = [xy(p) for p in pts(refs)]
        if len(line) >= 2:
            streets.append((en, ko, line))

    # Big named footprints: closed ways, plus multipolygon outer rings.
    footprints = []
    for wid, (refs, tags) in ways.items():
        if "name" in tags and refs and refs[0] == refs[-1] and any(k in tags for k in FEATURE_KEYS) \
                and "highway" not in tags:
            footprints.append((f"way/{wid}", tags, pts(refs)))
    for rid, members, tags in rels:
        if tags.get("type") != "multipolygon" or "name" not in tags or not any(k in tags for k in FEATURE_KEYS):
            continue
        outer = [p for t, ref, role in members if t == "way" and role == "outer" and ref in ways
                 for p in pts(ways[ref][0])]
        if outer:
            footprints.append((f"relation/{rid}", tags, outer))

    # Only places the app can search for: numbered buildings in
    # buildings_osm.json and unnumbered places in places_osm.json.
    data = ROOT / "src" / "data"
    known_bldgs = set(json.loads((data / "buildings_osm.json").read_text())["buildings"])
    known_places = {p["osm_id"] for p in json.loads((data / "places_osm.json").read_text())["places"]}

    out = {}
    for osm_id, tags, poly in footprints:
        if len(poly) < 3 or not in_bbox(poly[0]) or area(poly) < MIN_AREA_M2:
            continue
        ring = [xy(p) for p in poly]
        by_street = {}
        for en, ko, line in streets:
            d, c = closest_between(ring, line)
            if d <= MAX_STREET_GAP_M and (en not in by_street or d < by_street[en][0]):
                by_street[en] = (d, c, ko)
        if len(by_street) < 2:     # one side is no choice
            continue
        sides = sorted(by_street.items(), key=lambda kv: kv[1][0])[:MAX_SIDES]
        num = re.match(r"^(\d+)", tags.get("addr:housenumber", "") or "")
        key = f"bldg:{num.group(1)}" if num else f"osm:{osm_id}"
        if (num and num.group(1) not in known_bldgs) or (not num and osm_id not in known_places):
            continue
        out[key] = {
            "name": tags.get("name"),
            "sides": [
                {"street": en, "street_ko": ko,
                 "lat": round(unxy(c)[0], 7), "lon": round(unxy(c)[1], 7)}
                for en, (d, c, ko) in sorted(sides, key=lambda kv: kv[0])
            ],
        }

    payload = {
        "_meta": {
            "source": "OpenStreetMap main API map call (bbox tiles)",
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "license": "ODbL 1.0 — © OpenStreetMap contributors",
            "min_area_m2": MIN_AREA_M2,
            "max_street_gap_m": MAX_STREET_GAP_M,
            "places": len(out),
        },
        "places": dict(sorted(out.items())),
    }
    OUT.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n")
    print(f"  big places with ≥2 street sides: {len(out)}", flush=True)
    print(f"  wrote {OUT.relative_to(ROOT)}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

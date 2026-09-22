#!/usr/bin/env python3
"""Phase 2 walk-matrix generator (Roadmap.md `On-post walking directions`).

Precomputes real walking-distance / duration for every pair the runtime
walkMinutes() might look up when the origin is static (a bus stop or a
mapped building — user-geolocation origins are Phase 3, not here).

Scope:
    stop -> stop      52 stops × 51 = 2652 pairs, both directions
    bldg -> nearest   81 named OSM buildings within 2 km of any stop
                      (matches App.jsx OSM_NEAREST_CAP_M = 2000)

Output: src/data/walk_matrix.json — nested dict, `stops[src][dst]` and
`bldgs[bldg][stop]` each carry `{seconds, meters}`. `_meta.source_hash`
is a SHA-256 of the two source coord files; a rerun with an unchanged
hash short-circuits without hitting the API.

Reads MAPBOX_TOKEN from env. `source .env.mapbox` before running.
Requires network. Free-tier Mapbox comfortably absorbs ~2.7k Directions
calls per rebuild.
"""

import hashlib
import json
import math
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date
from pathlib import Path
from threading import Lock
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

REPO = Path(__file__).resolve().parent.parent
STOPS_PATH = REPO / "src/data/stop_coords.json"
BLDGS_PATH = REPO / "src/data/buildings_osm.json"
OUT_PATH = REPO / "src/data/walk_matrix.json"

# Matches App.jsx OSM_NEAREST_CAP_M — buildings farther than this from any
# stop are outside the shuttle footprint and never surface in search.
OSM_NEAREST_CAP_M = 2000

# Mapbox Directions free-tier caps around 300 req/min (~5/sec). Keep a
# small headroom to survive burst variance and background traffic.
MAX_CONCURRENT = 3
MIN_INTERVAL_S = 0.25   # 4 req/sec sustained ceiling
MAX_RETRIES = 4         # 429/5xx retries per pair before giving up

TOKEN = os.environ.get("MAPBOX_TOKEN")
if not TOKEN:
    sys.exit("MAPBOX_TOKEN not set — `source .env.mapbox` first.")

_rate_lock = Lock()
_last_call_at = [0.0]


def rate_limit():
    with _rate_lock:
        gap = time.monotonic() - _last_call_at[0]
        if gap < MIN_INTERVAL_S:
            time.sleep(MIN_INTERVAL_S - gap)
        _last_call_at[0] = time.monotonic()


def haversine_m(lat1, lon1, lat2, lon2):
    R = 6371000
    to_rad = math.radians
    d_lat = to_rad(lat2 - lat1)
    d_lon = to_rad(lon2 - lon1)
    a = math.sin(d_lat / 2) ** 2 + math.cos(to_rad(lat1)) * math.cos(to_rad(lat2)) * math.sin(d_lon / 2) ** 2
    return 2 * R * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def content_hash(*paths):
    h = hashlib.sha256()
    for p in paths:
        h.update(p.read_bytes())
    return h.hexdigest()[:16]


def nearest_stop(lat, lon, stops):
    best_name, best_m = None, float("inf")
    for name, s in stops.items():
        if s.get("lat") is None:
            continue
        m = haversine_m(lat, lon, s["lat"], s["lon"])
        if m < best_m:
            best_name, best_m = name, m
    return best_name, best_m


def fetch_walking(a_lon, a_lat, b_lon, b_lat):
    url = (
        "https://api.mapbox.com/directions/v5/mapbox/walking/"
        f"{a_lon},{a_lat};{b_lon},{b_lat}"
        f"?geometries=geojson&overview=false&steps=false&access_token={TOKEN}"
    )
    req = Request(url, headers={"User-Agent": "humphreys-transit/walk-matrix"})
    for attempt in range(MAX_RETRIES):
        rate_limit()
        try:
            with urlopen(req, timeout=30) as r:
                payload = json.loads(r.read())
        except HTTPError as e:
            if e.code in (429, 500, 502, 503, 504) and attempt < MAX_RETRIES - 1:
                time.sleep(2 ** attempt)
                continue
            return None, f"HTTP {e.code}"
        except URLError as e:
            if attempt < MAX_RETRIES - 1:
                time.sleep(2 ** attempt)
                continue
            return None, f"network: {e.reason}"
        routes = payload.get("routes") or []
        if not routes:
            return None, payload.get("message", "no route")
        r = routes[0]
        return {"seconds": round(r["duration"], 1), "meters": round(r["distance"], 1)}, None
    return None, "exhausted retries"


def main():
    stops = json.loads(STOPS_PATH.read_text())["stops"]
    bldgs = json.loads(BLDGS_PATH.read_text())["buildings"]
    src_hash = content_hash(STOPS_PATH, BLDGS_PATH)

    # Resume-from-partial: a matching source_hash with an incomplete pair
    # set (e.g. previous run got rate-limited) keeps its finished entries
    # and only refetches the misses. A stale hash discards everything.
    result = {"stops": {}, "bldgs": {}}
    if OUT_PATH.exists():
        try:
            existing = json.loads(OUT_PATH.read_text())
            if existing.get("_meta", {}).get("source_hash") == src_hash:
                result["stops"] = existing.get("stops", {})
                result["bldgs"] = existing.get("bldgs", {})
        except (json.JSONDecodeError, KeyError):
            pass

    stop_names = [n for n, s in stops.items() if s.get("lat") is not None]

    # key_path = ("stops", src, dst) or ("bldgs", bldg, dst_stop)
    tasks = []
    for a in stop_names:
        sa = stops[a]
        for b in stop_names:
            if a == b:
                continue
            if result["stops"].get(a, {}).get(b) is not None:
                continue
            sb = stops[b]
            tasks.append((sa["lat"], sa["lon"], sb["lat"], sb["lon"], ("stops", a, b)))

    for bnum, b in bldgs.items():
        if not b.get("name") or b.get("lat") is None:
            continue
        name, dist = nearest_stop(b["lat"], b["lon"], stops)
        if not name or dist > OSM_NEAREST_CAP_M:
            continue
        if result["bldgs"].get(bnum, {}).get(name) is not None:
            continue
        s = stops[name]
        tasks.append((b["lat"], b["lon"], s["lat"], s["lon"], ("bldgs", bnum, name)))

    already_have = (sum(len(v) for v in result["stops"].values())
                    + sum(len(v) for v in result["bldgs"].values()))
    if not tasks:
        print(f"All pairs already cached ({already_have}); nothing to fetch.")
    else:
        print(f"Fetching {len(tasks)} pairs "
              f"(resuming from {already_have} cached; concurrency={MAX_CONCURRENT}, "
              f"~{MIN_INTERVAL_S * 1000:.0f}ms interval)...")
    errors = []

    def checkpoint(reason):
        payload = {
            "_meta": {
                "generated_at": date.today().isoformat(),
                "source": "mapbox-walking-v5",
                "source_hash": src_hash,
                "stop_count": len(stop_names),
                "bldg_count": sum(len(v) for v in result["bldgs"].values()),
                "pair_count": (sum(len(v) for v in result["stops"].values())
                               + sum(len(v) for v in result["bldgs"].values())),
                "checkpoint": reason,
            },
            "stops": result["stops"],
            "bldgs": result["bldgs"],
        }
        OUT_PATH.write_text(json.dumps(payload, indent=2, sort_keys=True))

    with ThreadPoolExecutor(max_workers=MAX_CONCURRENT) as pool:
        futures = {
            pool.submit(fetch_walking, a_lon, a_lat, b_lon, b_lat): key_path
            for (a_lat, a_lon, b_lat, b_lon, key_path) in tasks
        }
        for i, fut in enumerate(as_completed(futures), 1):
            key_path = futures[fut]
            data, err = fut.result()
            if err:
                errors.append((key_path, err))
                continue
            top, src, dst = key_path
            result[top].setdefault(src, {})[dst] = data
            if i % 200 == 0 or i == len(tasks):
                checkpoint(f"partial:{i}/{len(tasks)}")
                print(f"  {i}/{len(tasks)}")

    print(f"Got {sum(len(v) for v in result['stops'].values())} stop pairs, "
          f"{sum(len(v) for v in result['bldgs'].values())} bldg pairs, {len(errors)} errors.")
    for key_path, err in errors[:5]:
        print(f"  ERROR {key_path}: {err}")
    if len(errors) > 5:
        print(f"  (+{len(errors) - 5} more)")

    checkpoint("final")
    print(f"Wrote {OUT_PATH.relative_to(REPO)} "
          f"({OUT_PATH.stat().st_size // 1024} KB, "
          f"errors={len(errors)})")


if __name__ == "__main__":
    main()

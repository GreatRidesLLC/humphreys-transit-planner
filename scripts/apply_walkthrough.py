"""Apply a Gold Route walkthrough JSON payload.

Reads a `gold-walkthrough-YYYY-MM-DD.json` exported from
`scripts/walkthrough/index.html` and patches:

  1. `scripts/gen_gold_schedule.py`  — appends confirmed stops to
     `STOP_OFFSETS` (idempotent; skips names already present).
  2. `src/data/stop_coords.json`     — merges lat/lon for any stop
     with coords captured (existing entries preserved unless
     `--overwrite-coords` given).
  3. Prints copy-paste blocks for `src/lib/routing.js`:
       * new canonical names to insert into `ROUTES.GOLD.stops`
       * `STOP_ALIASES` entries for poster label + user-supplied aliases

Does NOT run `gen_gold_schedule.py` or `npm test` — do that manually
after inspecting the diff. Does NOT edit routing.js; that file has
too much hand-tuned surrounding context to patch safely by script.

Usage:
  python3 scripts/apply_walkthrough.py path/to/gold-walkthrough.json
  python3 scripts/apply_walkthrough.py path/to/... --overwrite-coords
  python3 scripts/apply_walkthrough.py path/to/... --dry-run
"""

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GEN_GOLD = ROOT / "scripts" / "gen_gold_schedule.py"
STOP_COORDS = ROOT / "src" / "data" / "stop_coords.json"


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("payload", help="gold-walkthrough-*.json")
    p.add_argument("--dry-run", action="store_true")
    p.add_argument("--overwrite-coords", action="store_true",
                   help="Replace existing coords in stop_coords.json")
    return p.parse_args()


def collect_stops(payload):
    """Flatten payload into a list of {name, offsets, lat, lon, aliases}.

    Merges outbound + return_loop when `same_as_opposite == "yes"` OR
    when both platforms carry the same canonical_name.
    """
    out = []
    for stop in payload.get("stops", []):
        poster = stop["poster_label"]
        if not stop.get("confirmed"):
            print(f"  skip (not confirmed): {poster}")
            continue

        ob = stop.get("outbound") or {}
        rl = stop.get("return_loop") or None
        same = stop.get("same_as_opposite") == "yes"

        ob_name = (ob.get("canonical_name") or "").strip()
        if not ob_name:
            print(f"  skip (no canonical_name outbound): {poster}")
            continue

        rl_name = (rl.get("canonical_name") or "").strip() if rl else ""

        def entry(name, off, lat, lon, aliases_str, ret_off=None):
            offs = [int(off)]
            if ret_off is not None:
                offs.append(int(ret_off))
            aliases = [a.strip() for a in (aliases_str or "").split(",") if a.strip()]
            if poster not in aliases and poster != name:
                aliases.insert(0, poster)
            return {
                "name": name,
                "offsets": sorted(offs),
                "lat": lat.strip() if isinstance(lat, str) else lat,
                "lon": lon.strip() if isinstance(lon, str) else lon,
                "aliases": aliases,
                "poster": poster,
            }

        if same or (rl and rl_name == ob_name):
            # single canonical name, two offsets
            ret_off = int(rl["offset_min"]) if rl and rl.get("offset_min") not in ("", None) else None
            out.append(entry(
                ob_name, int(ob["offset_min"]),
                ob.get("lat", ""), ob.get("lon", ""),
                ob.get("aliases"), ret_off
            ))
        else:
            out.append(entry(
                ob_name, int(ob["offset_min"]),
                ob.get("lat", ""), ob.get("lon", ""),
                ob.get("aliases")
            ))
            if rl and rl_name:
                out.append(entry(
                    rl_name, int(rl["offset_min"]),
                    rl.get("lat", ""), rl.get("lon", ""),
                    rl.get("aliases")
                ))
    return out


def patch_stop_offsets(entries, dry_run):
    src = GEN_GOLD.read_text()
    m = re.search(r"STOP_OFFSETS\s*=\s*\{\n(.*?)^\}", src, re.DOTALL | re.MULTILINE)
    if not m:
        sys.exit("could not locate STOP_OFFSETS in gen_gold_schedule.py")
    body = m.group(1)

    existing = set(re.findall(r'^\s*"([^"]+)"\s*:', body, re.MULTILINE))
    new_lines = []
    for e in entries:
        if e["name"] in existing:
            print(f"  STOP_OFFSETS already has: {e['name']}")
            continue
        offs_repr = ", ".join(str(o) for o in e["offsets"])
        # pad name to 36 cols like existing entries for visual consistency
        key = f'"{e["name"]}":'
        new_lines.append(f'    {key:<38}[{offs_repr}],')

    if not new_lines:
        print("STOP_OFFSETS: no changes")
        return False

    insertion = "\n".join(new_lines) + "\n"
    # insert before the closing brace of the dict
    new_body = body.rstrip("\n") + "\n" + insertion
    new_src = src[:m.start(1)] + new_body + src[m.end(1):]
    if dry_run:
        print(f"[dry-run] would add {len(new_lines)} entries to STOP_OFFSETS:")
        print(insertion)
    else:
        GEN_GOLD.write_text(new_src)
        print(f"STOP_OFFSETS: added {len(new_lines)} entries")
    return True


def patch_stop_coords(entries, dry_run, overwrite):
    with open(STOP_COORDS) as f:
        coords = json.load(f)
    added = 0
    skipped = 0
    for e in entries:
        if not e["lat"] or not e["lon"]:
            continue
        try:
            lat = float(e["lat"]); lon = float(e["lon"])
        except ValueError:
            print(f"  bad coords for {e['name']}: {e['lat']},{e['lon']}")
            continue
        if e["name"] in coords and not overwrite:
            print(f"  stop_coords already has: {e['name']} (use --overwrite-coords to replace)")
            skipped += 1
            continue
        coords[e["name"]] = [lat, lon]
        added += 1
    if added == 0:
        print(f"stop_coords: no changes ({skipped} skipped)")
        return False
    if dry_run:
        print(f"[dry-run] would set coords for {added} stops")
    else:
        with open(STOP_COORDS, "w") as f:
            json.dump(coords, f, indent=2, ensure_ascii=False)
            f.write("\n")
        print(f"stop_coords: wrote {added} entries")
    return True


def print_routing_hints(entries):
    print("\n--- routing.js: paste into ROUTES.GOLD.stops ---")
    names = sorted({e["name"] for e in entries})
    print("New canonical names:")
    for n in names:
        print(f'  "{n}",')
    print("\nInsert each in the correct route-order slot in the stops array.")
    print("(Order should follow the outbound offset; see STOP_OFFSETS.)")

    print("\n--- routing.js: paste into STOP_ALIASES ---")
    for e in entries:
        if e["aliases"]:
            aliases = ", ".join(f'"{a}"' for a in e["aliases"])
            print(f'  "{e["name"]}":' + " " * max(1, 34 - len(e["name"])) + f'[{aliases}],')


def main():
    args = parse_args()
    payload = json.loads(Path(args.payload).read_text())
    if payload.get("route") != "GOLD":
        print(f"warning: payload route={payload.get('route')}, expected GOLD")

    entries = collect_stops(payload)
    if not entries:
        print("no confirmed stops to apply")
        return

    print(f"\nApplying {len(entries)} entries…")
    patch_stop_offsets(entries, args.dry_run)
    patch_stop_coords(entries, args.dry_run, args.overwrite_coords)
    print_routing_hints(entries)

    print("\nNext:")
    print("  1. Review diffs in gen_gold_schedule.py and stop_coords.json")
    print("  2. Hand-edit src/lib/routing.js using the blocks printed above")
    print("  3. python3 scripts/gen_gold_schedule.py")
    print("  4. npm test")


if __name__ == "__main__":
    main()

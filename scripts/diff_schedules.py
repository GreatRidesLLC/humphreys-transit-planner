#!/usr/bin/env python3
"""
Compare scraped per-stop schedules (src/data/schedules.json) against
the route metadata currently embedded in src/App.jsx (the ROUTES const).

Reports:
  - Stops present in schedules but missing from ROUTES (and vice versa)
  - Headway inference per route, derived from consecutive HH:MM deltas
    at stops where only that route is OCR-named
  - Service-hour bounds (earliest/latest HH:MM across stops)

Writes scripts/diff_report.md.
"""
from __future__ import annotations

import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCHED = ROOT / "src" / "data" / "schedules.json"
APP_JSX = ROOT / "src" / "App.jsx"
OUT = ROOT / "scripts" / "diff_report.md"

# Map official-site stop names → ROUTES const names where they differ.
# Built from observed mismatches on first run; extend as more turn up.
NAME_ALIASES = {
    "LTG Timothy J. Maude Hall (9th Street)": "LTG Maude Hall (9th St)",
    "Brian D. Allgood Army Community Hospital (Key Street)": "Brian D. Allgood Hospital",
    "MSG Henry L. Jenkins Medical Clinic": "MSG Jenkins Medical Clinic",
    "Korean Theater of Operations Museum": "KTO Museum",
    "Main Exchange": "Main Exchange (PX)",
    "Family Housing Towers (5050s & 5070s Block)": "Family Housing Towers (Tropic Lightning Ave)",
    "Eighth Army": "Eighth Army HQ",
    "TMP (Driver's Licensing)": "TMP / Driver's Licensing",
    "Barracks (6000's Block)": "Barracks (6000s Block)",
    "Balboni Sports Field Complex (5th Street)": "Balboni Sports Field (5th St)",
    "Collier Community Fitness Center": "Collier Fitness Center",
}

# Routes whose stops do NOT appear in the per-stop image directory
# (they use route-level downloadable PDFs instead — Gold/Brown/Pink).
# Document so they're not flagged as "missing from official".
ROUTES_WITHOUT_PER_STOP_IMAGES = {"GOLD", "BROWN", "PINK"}


def normalize_official(name: str) -> str:
    return NAME_ALIASES.get(name, name)


def parse_routes_jsx() -> dict[str, dict]:
    """Best-effort scrape of the ROUTES object from App.jsx."""
    text = APP_JSX.read_text()
    # Pull the ROUTES = { ... }; block.
    m = re.search(r"const ROUTES\s*=\s*\{(.+?)^\};", text, re.S | re.M)
    if not m:
        sys.exit("Could not locate ROUTES const in App.jsx")
    body = m.group(1)
    routes: dict[str, dict] = {}
    for entry in re.finditer(
        r"([A-Z]+):\s*\{[^}]*?freq:(\d+),\s*hours:\"([^\"]+)\",\s*days:\"([^\"]+)\"[^}]*?stops:\[(.+?)\]",
        body, re.S
    ):
        rid, freq, hours, days, stops_src = entry.groups()
        stops = re.findall(r"\"([^\"]+)\"", stops_src)
        routes[rid] = {
            "freq": int(freq),
            "hours": hours,
            "days": days,
            "stops": stops,
        }
    return routes


def infer_headway(times: list[str]) -> tuple[int | None, list[int]]:
    """
    Given sorted HH:MM strings, compute deltas between consecutive minutes
    within the same hour, modulo 60.  Returns (mode_delta_min, all_deltas).
    """
    if len(times) < 2:
        return None, []
    minutes = [int(t[:2]) * 60 + int(t[3:]) for t in sorted(set(times))]
    deltas = [b - a for a, b in zip(minutes, minutes[1:]) if 0 < (b - a) <= 60]
    if not deltas:
        return None, []
    common = Counter(deltas).most_common(1)[0][0]
    return common, deltas


def main() -> int:
    if not SCHED.exists():
        sys.exit(f"missing {SCHED}; run scrape_schedules.py first")
    sched = json.loads(SCHED.read_text())
    stops_data: dict[str, dict] = sched["stops"]
    routes = parse_routes_jsx()

    # ---- Stop coverage ----
    official_stops = {normalize_official(s) for s in stops_data}
    routes_stops = {s for r in routes.values() for s in r["stops"]}
    only_official = official_stops - routes_stops
    only_routes = routes_stops - official_stops

    # ---- Headway inference per route ----
    # Group stops by the set of routes serving them (per ROUTES const).
    stop_to_routes: dict[str, list[str]] = defaultdict(list)
    for rid, meta in routes.items():
        for s in meta["stops"]:
            stop_to_routes[s].append(rid)

    # Prefer PDF data when present (clean per-route, per-day timetable);
    # fall back to PNG headway inference for routes without PDF coverage.
    headways: dict[str, dict] = {}
    for rid in routes:
        pdf_deltas: list[int] = []
        pdf_days = set()
        for stop_blob in stops_data.values():
            by_pdf = stop_blob.get("by_route_pdf", {}).get(rid)
            if not by_pdf:
                continue
            for day, times in by_pdf.items():
                pdf_days.add(day)
                _, ds = infer_headway(times)
                pdf_deltas.extend(ds)
        if pdf_deltas:
            common = Counter(pdf_deltas).most_common(3)
            headways[rid] = {
                "current_freq": routes[rid]["freq"],
                "observed_modes": common,
                "n_samples": len(pdf_deltas),
                "source": f"PDF ({', '.join(sorted(pdf_days))})",
            }
            continue
        # PNG fallback
        exclusive = [s for s, rs in stop_to_routes.items() if rs == [rid]]
        sample_deltas: list[int] = []
        for s in exclusive:
            official = next((k for k, v in NAME_ALIASES.items() if v == s), s)
            stop_blob = stops_data.get(official)
            if not stop_blob:
                continue
            _, deltas = infer_headway(stop_blob.get("times", []))
            sample_deltas.extend(deltas)
        if sample_deltas:
            common = Counter(sample_deltas).most_common(3)
            headways[rid] = {
                "current_freq": routes[rid]["freq"],
                "observed_modes": common,
                "n_samples": len(sample_deltas),
                "source": f"PNG (exclusive stops: {', '.join(exclusive) or 'none'})",
            }
        else:
            headways[rid] = {
                "current_freq": routes[rid]["freq"],
                "observed_modes": [],
                "n_samples": 0,
                "source": "no data",
            }

    # ---- Service hours per route ----
    service_hours: dict[str, dict] = {}
    for rid, meta in routes.items():
        all_times: list[str] = []
        for s in meta["stops"]:
            official = next((k for k, v in NAME_ALIASES.items() if v == s), s)
            blob = stops_data.get(official)
            if blob:
                all_times.extend(blob.get("times", []))
        if all_times:
            service_hours[rid] = {
                "current": meta["hours"],
                "observed_min": min(all_times),
                "observed_max": max(all_times),
            }

    # ---- Render report ----
    lines: list[str] = []
    lines.append("# Schedule diff — official vs ROUTES const\n")
    lines.append(f"Scraped: {sched['_meta'].get('scraped_at','?')}")
    lines.append(f"Source: {sched['_meta'].get('source_url','?')}\n")

    lines.append("## Stop coverage\n")
    lines.append(f"- Stops only on official site (missing from ROUTES): {len(only_official)}")
    for s in sorted(only_official):
        lines.append(f"  - {s}")
    lines.append(f"\n- Stops only in ROUTES (no official-site coverage from PNGs or PDFs): {len(only_routes)}")
    lines.append("  (these likely need name-alias updates in NAME_ALIASES, or are genuinely stale guesses in ROUTES)")
    for s in sorted(only_routes):
        lines.append(f"  - {s}")

    lines.append("\n## Inferred headways (vs current `freq`)\n")
    lines.append("Mode delta is the most common gap (minutes) between consecutive")
    lines.append("departures at stops served *exclusively* by that route.\n")
    lines.append("| Route | current freq | observed mode(s) | samples | source |")
    lines.append("|---|---|---|---|---|")
    for rid in sorted(headways):
        h = headways[rid]
        modes = ", ".join(f"{d}m×{c}" for d, c in h["observed_modes"]) or "—"
        lines.append(f"| {rid} | {h['current_freq']} | {modes} | {h['n_samples']} | {h['source']} |")

    lines.append("\n## Service hours\n")
    lines.append("| Route | current hours | OCR earliest | OCR latest |")
    lines.append("|---|---|---|---|")
    for rid in sorted(service_hours):
        sh = service_hours[rid]
        lines.append(f"| {rid} | {sh['current']} | {sh['observed_min']} | {sh['observed_max']} |")

    lines.append("\n## Caveats\n")
    lines.append("- OCR is imperfect; minute patterns within ±2 minutes of the")
    lines.append("  modal delta are usually genuine, larger outliers are OCR errors.")
    lines.append("- Route-to-panel attribution inside each schedule image is not")
    lines.append("  reliably extractable from tesseract output (panels are color-")
    lines.append("  coded, not labeled by route name in text). Headways above lean")
    lines.append("  on stops served by only one route in our current ROUTES list.")
    lines.append("- Humphreys Bus (Jong Seon Kim, iOS) data not compared — would")
    lines.append("  require an IPA bundle dump from a device. App Store listing")
    lines.append("  claims arrival times across all 8 routes, matching our source.")

    OUT.write_text("\n".join(lines) + "\n")
    print(f"wrote {OUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

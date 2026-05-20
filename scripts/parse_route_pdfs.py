#!/usr/bin/env python3
"""
Parse route-level PDFs (Gold, Brown, Pink) from
home.army.mil/humphreys/.../post-shuttle-bus-service into structured
per-stop, per-day schedules and merge into src/data/schedules.json.

Unlike the per-stop PNG directory, each route PDF has one PAGE per
stop, with day-type panels (e.g. MONDAY-SATURDAY / SUNDAY) laid out
side-by-side. Text is selectable, so we use pdftotext -layout and
regex out the hour rows.
"""
from __future__ import annotations

import json
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / "scripts" / "cache"
OUT = ROOT / "src" / "data" / "schedules.json"

# Map our internal route IDs → the PDF on disk + the route badge as printed.
ROUTE_PDFS = {
    "GOLD": "gold_route.pdf",
    "BROWN": "brown_route.pdf",
    "PINK": "pink_route.pdf",
}

# Day-type tokens that appear in panel headers, in priority order.
# We split each page into segments at these boundaries.
DAY_TYPES = [
    "MONDAY-SATURDAY",
    "MONDAY-FRIDAY",
    "MONDAY-THURSDAY",
    "FRIDAY / TRAINING HOLIDAY",
    "SATURDAY / TRAINING HOLIDAY",
    "FRIDAY & SATURDAY",
    "FRIDAY",
    "SATURDAY",
    "SUNDAY-THURSDAY",
    "SUNDAY",
]

# An hour row looks like e.g. "09  00  20  40" or "19  07  37".  Allow 1-5
# minute tokens; hour must be 04..23 (early hours are filler).  Bounded by
# word edges so it doesn't slurp into the next panel on the same line.
HOUR_ROW_RE = re.compile(
    r"(?<!\d)(0[4-9]|1\d|2[0-3])((?:\s+[0-5]\d){1,5})(?!\d)"
)

# Page-header pattern: stop name (mostly UPPER with mixed-case allowed in
# parentheses, e.g. "BARRACKS (700s Block)") then ROUTE NAME at right.
# Allows the route badge to live on the SAME line (most pages) or on the
# NEXT line (a handful of pages where pdftotext breaks the line).
PAGE_HEADER_SAME_RE = re.compile(
    r"^\s*([A-ZÉ][A-Za-zÀ-ÿ0-9 ()/.'’&\-–]+?)\s{2,}([A-Z]+\s+ROUTE)\s*$"
)
PAGE_HEADER_ALONE_RE = re.compile(
    r"^\s*([A-ZÉ][A-Za-zÀ-ÿ0-9 ()/.'’&\-–]+?)\s*$"
)
ROUTE_BADGE_RE = re.compile(r"^\s*([A-Z]+\s+ROUTE)\s*$")


def pdftotext(pdf: Path, page: int) -> str:
    return subprocess.run(
        ["pdftotext", "-layout", "-f", str(page), "-l", str(page), str(pdf), "-"],
        capture_output=True, text=True, check=True,
    ).stdout


def pdf_page_count(pdf: Path) -> int:
    out = subprocess.run(
        ["pdfinfo", str(pdf)], capture_output=True, text=True, check=True
    ).stdout
    for line in out.splitlines():
        if line.startswith("Pages:"):
            return int(line.split(":", 1)[1].strip())
    raise RuntimeError(f"no page count for {pdf}")


def extract_stop_name(page_text: str) -> str | None:
    """Pull the stop name from the page header. Two layouts to handle:
    1. "<STOP NAME>   <ROUTE> ROUTE" on one line
    2. "<STOP NAME>" alone on line 1, then "<ROUTE> ROUTE" alone on line 2.
    """
    lines = page_text.splitlines()[:6]
    prev_candidate: str | None = None
    for line in lines:
        stripped = line.rstrip()
        m = PAGE_HEADER_SAME_RE.match(stripped)
        if m:
            return normalize_stop_name(m.group(1).strip())
        if ROUTE_BADGE_RE.match(stripped) and prev_candidate:
            return normalize_stop_name(prev_candidate)
        m2 = PAGE_HEADER_ALONE_RE.match(stripped)
        if m2 and stripped and not ROUTE_BADGE_RE.match(stripped):
            prev_candidate = m2.group(1).strip()
        else:
            prev_candidate = None
    return None


def normalize_stop_name(raw: str) -> str:
    """
    Convert all-caps PDF header to title case matching ROUTES const where
    possible. Specific known mappings override; everything else gets
    title-cased. Match against the upper-cased form so mixed-case input
    (e.g. 'BARRACKS (700s Block)') hits the same override entry.
    """
    raw_upper = raw.upper().strip()
    overrides = {
        "BUS TERMINAL": "Bus Terminal",
        "PEDESTRIAN GATE": "Pedestrian Gate",
        "PROVIDER GRILL DFAC": "Provider Grill DFAC",
        "BARRACKS (700S BLOCK)": "Barracks (700s Block)",
        "BARRACKS (6800S BLOCK)": "Barracks (6800s Block)",
        "BARRACKS (6800S & 6900S BLOCK)": "Barracks (6800s & 6900s Block)",
        "MORNING CALM CENTER": "Morning Calm Center",
        "SENTRY VILLAGE BURGER KING": "Sentry Village Burger King",
        "SENTRY VILLAGE MINI MALL": "Sentry Village Mini Mall",
        "MSG HENRY L. JENKINS MEDICAL CLINIC": "MSG Jenkins Medical Clinic",
        "MSG HENRY L. JENKINS MEDICAL CLINIC ": "MSG Jenkins Medical Clinic",
        "FREEDOM CHAPEL": "Freedom Chapel",
        "COLLIER COMMUNITY FITNESS CENTER": "Collier Fitness Center",
        "FAMILY HOUSING TOWERS (TROPIC LIGHTNING AVE)": "Family Housing Towers (Tropic Lightning Ave)",
        "FAMILY HOUSING TOWERS (TROPIC LIGHTNING AVENUE)": "Family Housing Towers (Tropic Lightning Ave)",
        "FAMILY HOUSING TOWERS (TARO AVE)": "Family Housing Towers (Taro Ave)",
        "FAMILY HOUSING TOWERS (TARO AVENUE)": "Family Housing Towers (Taro Ave)",
        "FAMILY HOUSING TOWERS (15TH STREET)": "Family Housing Towers (15th Street)",
        "RED CLOUD CIRCLE": "Red Cloud Circle",
        "MAIN POST OFFICE": "Main Post Office",
        "MAIN EXCHANGE": "Main Exchange (PX)",
        "MAIN EXCHANGE (PX)": "Main Exchange (PX)",
        "BALBONI SPORTS FIELD (MARNE AVE)": "Balboni Sports Field (Marne Ave)",
        "BALBONI SPORTS FIELD (MARNE AVENUE)": "Balboni Sports Field (Marne Ave)",
        "BALBONI SPORTS COMPLEX (MARNE AVENUE)": "Balboni Sports Field (Marne Ave)",
        "BALBONI SPORTS COMPLEX (5TH STREET)": "Balboni Sports Field (5th St)",
        "BALBONI SPORTS FIELD COMPLEX (MARNE AVENUE)": "Balboni Sports Field (Marne Ave)",
        "BALBONI SPORTS FIELD COMPLEX (5TH STREET)": "Balboni Sports Field (5th St)",
        "SLQS (12200S BLOCK)": "SLQs (12200s Block)",
        "RIVER BEND GOLF COURSE": "River Bend Golf Course",
        "FAMILY HOUSING (STANTON)": "Family Housing (Stanton)",
        "FAMILY HOUSING (PALMER)": "Family Housing (Palmer)",
        "FAMILY HOUSING (NORTH)": "Family Housing (North)",
        "FAMILY HOUSING (SOUTH)": "Family Housing (South)",
        "FAMILY MINI MALL/GAS STATION": "Family Mini Mall / Gas Station",
        "TALON CAFÉ DFAC": "Talon Cafe DFAC",
        "TALON CAFE DFAC": "Talon Cafe DFAC",
        "PACIFIC VICTORS CHAPEL": "Pacific Victors Chapel",
        "TMP (DRIVER'S LICENSING)": "TMP / Driver's Licensing",
        "TMP (DRIVER’S LICENSING)": "TMP / Driver's Licensing",
        "PARK AREA": "Park Area",
        "ELEMENTARY SCHOOL": "Elementary School",
        "MIDDLE/HIGH SCHOOL": "Middle/High School",
        "HOSPITAL ANNEX": "Hospital Annex",
        "DOWNTOWN PLAZA": "Downtown Plaza",
    }
    if raw_upper in overrides:
        return overrides[raw_upper]
    # Fallback: title-case but preserve common abbreviations / punctuation.
    return raw.title().replace("Dfac", "DFAC")


def find_panels(page_text: str) -> list[tuple[str, int, int]]:
    """
    Locate the day-type panel headers in the page text. Returns a list of
    (day_type, header_col, header_line_idx). header_col is the X column
    where the day-type label starts (used to bucket hour rows into the
    correct panel when two panels share a line).
    """
    panels = []
    lines = page_text.splitlines()
    for i, line in enumerate(lines):
        # Multiple panels may share a single line, e.g.
        #   "MONDAY-SATURDAY                          SUNDAY"
        for dt in DAY_TYPES:
            for m in re.finditer(re.escape(dt), line):
                panels.append((dt, m.start(), i))
    # Sort by line then column.
    panels.sort(key=lambda p: (p[2], p[1]))
    # Dedup: prefer longer match starting at same column on same line.
    dedup = []
    seen = set()
    for dt, col, ln in panels:
        key = (ln, col)
        if any(abs(col - c) < 4 and ln == l for _, c, l in dedup):
            continue
        dedup.append((dt, col, ln))
    return dedup


def page_schedule(page_text: str) -> dict[str, list[str]]:
    """
    Returns {day_type: [HH:MM, ...]} for one PDF page.

    Handles two layouts:
      - Side-by-side panels sharing a header line (e.g. Gold's
        Mon-Sat | Sunday); bucket by X column.
      - Stacked panels with separate header lines (e.g. Brown's
        Friday then Saturday/Training Holiday); bucket by Y line.

    The general rule: for each panel header at (line H, col C), it
    owns all hour-rows on lines (H, next_header_line) whose column
    falls inside the side-by-side bounds at this header line.
    """
    panels = find_panels(page_text)
    if not panels:
        return {}
    lines = page_text.splitlines()

    # Group panels by header line; for each line, compute side-by-side col bounds.
    by_line: dict[int, list[tuple[str, int]]] = {}
    for dt, col, ln in panels:
        by_line.setdefault(ln, []).append((dt, col))
    for ln in by_line:
        by_line[ln].sort(key=lambda x: x[1])

    sorted_lines = sorted(by_line.keys())
    out: dict[str, list[str]] = {}

    for i, hdr_line in enumerate(sorted_lines):
        next_hdr = sorted_lines[i + 1] if i + 1 < len(sorted_lines) else len(lines)
        ps = by_line[hdr_line]
        bounds: list[tuple[str, int, int]] = []
        for j, (dt, col) in enumerate(ps):
            left = 0 if j == 0 else (ps[j - 1][1] + col) // 2
            right = 10**9 if j == len(ps) - 1 else (col + ps[j + 1][1]) // 2
            bounds.append((dt, left, right))
        for ln_idx in range(hdr_line + 1, next_hdr):
            for m in HOUR_ROW_RE.finditer(lines[ln_idx]):
                hour = int(m.group(1))
                minute_tokens = m.group(2).split()
                if len(minute_tokens) < 2:
                    continue
                col_pos = m.start(1)
                chosen_dt: str | None = None
                for dt, lb, rb in bounds:
                    if lb <= col_pos < rb:
                        chosen_dt = dt
                        break
                if not chosen_dt:
                    continue
                for mi_s in minute_tokens:
                    mi = int(mi_s)
                    if 0 <= mi < 60:
                        out.setdefault(chosen_dt, []).append(f"{hour:02d}:{mi:02d}")

    for dt in list(out):
        out[dt] = sorted(set(out[dt]))
    return out


def parse_route_pdf(route_id: str, pdf: Path) -> dict[str, dict]:
    """
    Returns {stop_name: {route_id: {day_type: [HH:MM, ...]}}}.
    """
    stops: dict[str, dict] = {}
    n_pages = pdf_page_count(pdf)
    for p in range(1, n_pages + 1):
        text = pdftotext(pdf, p)
        stop = extract_stop_name(text)
        if not stop:
            print(f"  page {p}: no stop header detected", file=sys.stderr)
            continue
        sched = page_schedule(text)
        if not sched:
            print(f"  page {p} ({stop}): no schedule rows parsed", file=sys.stderr)
            continue
        stops.setdefault(stop, {}).setdefault(route_id, {}).update(sched)
        n_times = sum(len(v) for v in sched.values())
        days = ",".join(sched.keys())
        print(f"  page {p:>2}: {stop} → {n_times} times across [{days}]")
    return stops


def main() -> int:
    if not OUT.exists():
        sys.exit(f"missing {OUT}; run scrape_schedules.py first")
    sched = json.loads(OUT.read_text())
    stops_data: dict[str, dict] = sched.setdefault("stops", {})

    for rid, fname in ROUTE_PDFS.items():
        pdf = CACHE / fname
        if not pdf.exists():
            print(f"skip {rid}: {pdf} missing", file=sys.stderr)
            continue
        print(f"[{rid}] {pdf.name}")
        parsed = parse_route_pdf(rid, pdf)
        for stop, by_route in parsed.items():
            existing = stops_data.setdefault(stop, {"times": [], "routes_named": [], "minutes_pattern": []})
            existing.setdefault("by_route_pdf", {}).update(by_route)
            # Merge into legacy flat lists too, so downstream tools still work.
            all_times: list[str] = list(existing.get("times", []))
            for day_times in by_route[rid].values():
                all_times.extend(day_times)
            existing["times"] = sorted(set(all_times))
            existing["minutes_pattern"] = sorted({int(t[3:]) for t in existing["times"]})
            existing.setdefault("routes_named", [])
            if rid not in existing["routes_named"]:
                existing["routes_named"] = sorted(set(existing["routes_named"] + [rid]))

    sched["_meta"]["scraped_at"] = datetime.now(timezone.utc).isoformat()
    sched["_meta"].setdefault("pdf_sources", {})
    sched["_meta"]["pdf_sources"].update(
        {
            "GOLD": "Gold Route Bus Stops and Timetables (eff. 15 July 2023)",
            "BROWN": "Brown Route Bus Stops and Timetables (eff. 15 July 2023)",
            "PINK": "Pink Route Bus Stops and Timetables (eff. 15 July 2023)",
        }
    )
    sched["stops"] = dict(sorted(stops_data.items()))
    OUT.write_text(json.dumps(sched, indent=2, ensure_ascii=False) + "\n")
    print(f"\nwrote {OUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
"""
Scrape per-stop bus schedules from the official USAG Humphreys shuttle page,
OCR each image, and emit src/data/schedules.json.

Requires: tesseract-ocr installed on PATH. Uses only the Python stdlib.

Usage:
    python3 scripts/scrape_schedules.py [--refresh]

--refresh re-downloads PNGs; default uses scripts/cache/ if present.
"""
from __future__ import annotations

import argparse
import html
import json
import re
import subprocess
import sys
import urllib.request
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path

SHUTTLE_URL = "https://home.army.mil/humphreys/my-usag-humphreys/post-shuttle-bus-service"
DOWNLOAD_TPL = "https://home.army.mil/humphreys/download_file/view/{uuid}/774"
USER_AGENT = "Mozilla/5.0 (HumphreysTransit scrape; admin@local)"

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / "scripts" / "cache"
OUT = ROOT / "src" / "data" / "schedules.json"
KNOWN_ROUTES = ("BLUE", "BLACK", "GREEN", "ORANGE", "PURPLE", "GOLD", "BROWN", "PINK")


class StopLinkParser(HTMLParser):
    """Pull <a href=".../download_file/view/<uuid>/774">stop name</a> pairs."""

    HREF_RE = re.compile(r"download_file/view/([0-9a-f-]+)/774")

    def __init__(self) -> None:
        super().__init__()
        self._cur_uuid: str | None = None
        self._buf: list[str] = []
        self.pairs: list[tuple[str, str]] = []

    def handle_starttag(self, tag, attrs):
        if tag != "a":
            return
        for k, v in attrs:
            if k == "href" and v:
                m = self.HREF_RE.search(v)
                if m:
                    self._cur_uuid = m.group(1)
                    self._buf = []
                    return

    def handle_data(self, data):
        if self._cur_uuid is not None:
            self._buf.append(data)

    def handle_endtag(self, tag):
        if tag == "a" and self._cur_uuid is not None:
            text = html.unescape("".join(self._buf)).strip()
            if text:
                self.pairs.append((text, self._cur_uuid))
            self._cur_uuid = None
            self._buf = []


def slugify(name: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")
    return s[:80]


def http_get(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read()


def http_get_with_final_url(url: str) -> tuple[bytes, str]:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read(), r.geturl()


def is_route_stop(name: str) -> bool:
    """Filter out route-overview links and other non-stop anchors."""
    upper = name.upper()
    if "OVERVIEW" in upper or "ROUTE" in upper:
        return False
    if len(name) < 3:
        return False
    return True


def canonical_stop_name(name: str) -> str:
    """Strip trailing accidental digits and whitespace from anchor text."""
    return re.sub(r"\d+$", "", name).strip()


def collect_stop_targets(html_text: str) -> dict[str, str]:
    parser = StopLinkParser()
    parser.feed(html_text)
    targets: dict[str, str] = {}
    for name, uuid in parser.pairs:
        if not is_route_stop(name):
            continue
        canon = canonical_stop_name(name)
        # Multiple anchors for the same stop may use the same UUID — keep first.
        if canon in targets:
            continue
        targets[canon] = uuid
    return targets


def download_image(uuid: str, dest_dir: Path, slug: str, refresh: bool) -> tuple[Path, str]:
    out = dest_dir / f"{slug}.png"
    meta = dest_dir / f"{slug}.url"
    if out.exists() and not refresh:
        final = meta.read_text().strip() if meta.exists() else ""
        return out, final
    payload, final_url = http_get_with_final_url(DOWNLOAD_TPL.format(uuid=uuid))
    out.write_bytes(payload)
    meta.write_text(final_url)
    return out, final_url


# Schedule images use a tabular "HOUR MINUTES" layout where each row is
# "HH MM [MM MM ...]" (e.g. "08 00 15 30 45" = 08:00, 08:15, 08:30, 08:45).
# Capture leading hour, then up to 4 trailing minute tokens.
HOUR_ROW_RE = re.compile(
    r"(?<![\dA-Z])([01]?\d|2[0-3])\s+([0-5]\d)(?:\s+([0-5]\d))?(?:\s+([0-5]\d))?(?:\s+([0-5]\d))?(?![\d])"
)


def expand_hour_rows(text: str) -> list[str]:
    """
    Extract HH:MM departures from schedule rows like '08 00 15 30 45'.
    A bare minute row is only meaningful if at least 2 minute tokens follow
    the hour (avoids false positives on labels like 'Building 5410').

    Bus service at Humphreys runs no earlier than ~05:00 — so a row where
    the leading number is < 4 is almost certainly the "minute pattern"
    header row, not an actual hour. Skip those.
    """
    times: list[str] = []
    for line in text.splitlines():
        clean = re.sub(r"[^0-9A-Za-z:\s]", " ", line)
        for m in HOUR_ROW_RE.finditer(clean):
            h = int(m.group(1))
            minute_groups = [m.group(i) for i in (2, 3, 4, 5) if m.group(i)]
            if len(minute_groups) < 2:
                continue
            if h < 4 or h >= 24:
                continue
            for mi_s in minute_groups:
                mi = int(mi_s)
                if 0 <= mi < 60:
                    times.append(f"{h:02d}:{mi:02d}")
    return times


def parse_schedule(ocr_text: str) -> dict:
    """
    Extract:
      times: sorted unique HH:MM departures appearing in the OCR
      routes_named: which route names tesseract picked out of the page
      minute_pattern: most common minute pattern per hour (e.g. {0,15,30,45})
                      → used to infer headway (15 min vs 20 min vs 30 min)
    """
    times = sorted(set(expand_hour_rows(ocr_text)))
    upper = ocr_text.upper()
    routes_named = sorted({r for r in KNOWN_ROUTES if re.search(rf"\b{r}\b", upper)})
    # Compute set of minutes seen across times → infer headway pattern.
    minutes_seen = sorted({int(t[3:]) for t in times})
    return {
        "times": times,
        "routes_named": routes_named,
        "minutes_pattern": minutes_seen,
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--refresh", action="store_true", help="Re-download cached images")
    ap.add_argument("--limit", type=int, default=0, help="Process at most N stops (debug)")
    args = ap.parse_args()

    CACHE.mkdir(parents=True, exist_ok=True)
    OUT.parent.mkdir(parents=True, exist_ok=True)

    print(f"[1/5] Fetching shuttle index: {SHUTTLE_URL}", flush=True)
    html_text = http_get(SHUTTLE_URL).decode("utf-8", errors="replace")

    print("[2/5] Parsing stop → UUID map…", flush=True)
    targets = collect_stop_targets(html_text)
    print(f"      Found {len(targets)} unique stops.", flush=True)
    if not targets:
        print("ERROR: no stops parsed from page. Site layout may have changed.", file=sys.stderr)
        return 1

    if args.limit:
        targets = dict(list(targets.items())[: args.limit])

    schedules: dict[str, dict] = {}
    image_dates: dict[str, str] = {}

    for i, (stop, uuid) in enumerate(sorted(targets.items()), 1):
        slug = slugify(stop)
        print(f"[3/5] ({i}/{len(targets)}) {stop}", flush=True)
        try:
            img_path, final_url = download_image(uuid, CACHE, slug, args.refresh)
        except Exception as e:
            print(f"      ! download failed: {e}", file=sys.stderr)
            continue
        # Extract embedded date from filename if present
        date_m = re.search(r"(\d{1,2}-[A-Z][a-z]{2}-\d{4})", final_url)
        if date_m:
            image_dates[stop] = date_m.group(1)

        # PSM 6 + tessedit_do_invert=1 reliably reads the white-on-dark
        # schedule rows that other PSMs miss (e.g. 2ID Sustainment's blue
        # header band). PSM 4 misses these even though it preserves columns.
        raw = subprocess.run(
            ["tesseract", str(img_path), "-", "--psm", "6",
             "-c", "tessedit_do_invert=1"],
            capture_output=True, text=True, check=False,
        ).stdout
        (CACHE / f"{slug}.txt").write_text(raw)
        parsed = parse_schedule(raw)
        schedules[stop] = parsed
        print(
            f"      times={len(parsed['times'])}, "
            f"routes_named={parsed['routes_named']}, "
            f"minute_pattern={parsed['minutes_pattern']}",
            flush=True,
        )

    print(f"[4/5] Writing {OUT.relative_to(ROOT)}", flush=True)
    payload = {
        "_meta": {
            "source_url": SHUTTLE_URL,
            "scraped_at": datetime.now(timezone.utc).isoformat(),
            "image_dates": image_dates,
            "tool": "tesseract " + (subprocess.run(
                ["tesseract", "--version"], capture_output=True, text=True
            ).stderr.splitlines() or ["?"])[0],
        },
        "stops": dict(sorted(schedules.items())),
    }
    OUT.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n")

    print(f"[5/5] Done. {len(schedules)} stops written.", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

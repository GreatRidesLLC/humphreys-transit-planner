#!/usr/bin/env python3
"""
Usage report from Workers Analytics Engine (dataset htp_events, written by
worker/index.js recordEvent).

Needs a Cloudflare API token with only "Account Analytics: Read", kept
outside the repo in ~/.config/humphreys/cloudflare-analytics.env:

    CLOUDFLARE_ANALYTICS_TOKEN=...
    CLOUDFLARE_ACCOUNT_ID=...

Usage:
    python3 scripts/usage_report.py [days=7] [--all]

Developer ("dev") and preview traffic are left out unless --all is passed.
"""
from __future__ import annotations

import json
import os
import sys
import urllib.request
from pathlib import Path

ENV = Path.home() / ".config" / "humphreys" / "cloudflare-analytics.env"


def load_env() -> dict:
    env = {}
    if ENV.exists():
        for line in ENV.read_text().splitlines():
            if "=" in line and not line.lstrip().startswith("#"):
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip()
    env.update({k: v for k, v in os.environ.items() if k.startswith("CLOUDFLARE_")})
    return env


def sql(env: dict, query: str) -> list[dict]:
    url = f"https://api.cloudflare.com/client/v4/accounts/{env['CLOUDFLARE_ACCOUNT_ID']}/analytics_engine/sql"
    req = urllib.request.Request(url, data=query.encode(), method="POST",
                                 headers={"Authorization": f"Bearer {env['CLOUDFLARE_ANALYTICS_TOKEN']}"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read()).get("data", [])


def table(title: str, rows: list[dict], cols: list[str]) -> None:
    print(f"\n## {title}\n")
    if not rows:
        print("_no data_")
        return
    print("| " + " | ".join(cols) + " |")
    print("|" + "---|" * len(cols))
    for r in rows:
        print("| " + " | ".join(str(r.get(c, "")) for c in cols) + " |")


def main() -> int:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    days = int(args[0]) if args else 7
    everyone = "--all" in sys.argv
    env = load_env()
    if not env.get("CLOUDFLARE_ANALYTICS_TOKEN") or not env.get("CLOUDFLARE_ACCOUNT_ID"):
        print(f"Missing CLOUDFLARE_ANALYTICS_TOKEN / CLOUDFLARE_ACCOUNT_ID (see {ENV})", file=sys.stderr)
        return 2

    since = f"timestamp > NOW() - INTERVAL '{days}' DAY"
    users = "" if everyone else "AND blob2 = 'user'"
    n = "sum(_sample_interval) AS n"
    print(f"# Humphreys Transit usage: last {days} days ({'all audiences' if everyone else 'users only'})")

    table("Events by audience", sql(env, f"""
        SELECT blob2 AS audience, blob1 AS event, {n} FROM htp_events
        WHERE {since} GROUP BY audience, event ORDER BY audience, n DESC"""),
        ["audience", "event", "n"])
    table("Daily opens and plans", sql(env, f"""
        SELECT toDate(timestamp) AS day, blob1 AS event, {n} FROM htp_events
        WHERE {since} {users} AND blob1 IN ('open', 'plan') GROUP BY day, event ORDER BY day"""),
        ["day", "event", "n"])
    table("Mapbox calls (billed = sent upstream)", sql(env, f"""
        SELECT blob5 AS api, blob6 AS outcome, blob2 AS audience, {n} FROM htp_events
        WHERE {since} AND blob1 = 'mapbox' GROUP BY api, outcome, audience ORDER BY api, outcome"""),
        ["api", "outcome", "audience", "n"])
    table("Plan results", sql(env, f"""
        SELECT blob5 AS result, blob6 AS ends, {n} FROM htp_events
        WHERE {since} {users} AND blob1 = 'plan' GROUP BY result, ends ORDER BY n DESC LIMIT 20"""),
        ["result", "ends", "n"])
    table("Top trips (bus stop pairs)", sql(env, f"""
        SELECT blob7 AS trip, {n} FROM htp_events
        WHERE {since} {users} AND blob1 = 'plan' GROUP BY trip ORDER BY n DESC LIMIT 15"""),
        ["trip", "n"])
    table("Where we couldn't help (sorry)", sql(env, f"""
        SELECT blob5 AS reason, blob7 AS trip, {n} FROM htp_events
        WHERE {since} {users} AND blob1 = 'sorry' GROUP BY reason, trip ORDER BY n DESC LIMIT 15"""),
        ["reason", "trip", "n"])
    table("Language and country", sql(env, f"""
        SELECT blob3 AS lang, blob4 AS country, {n} FROM htp_events
        WHERE {since} {users} AND blob1 = 'open' GROUP BY lang, country ORDER BY n DESC"""),
        ["lang", "country", "n"])
    table("Feature use", sql(env, f"""
        SELECT blob1 AS event, blob5 AS detail, {n} FROM htp_events
        WHERE {since} {users} AND blob1 IN ('tab', 'place_pick', 'side_pick', 'route_pick', 'feedback')
        GROUP BY event, detail ORDER BY event, n DESC"""),
        ["event", "detail", "n"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

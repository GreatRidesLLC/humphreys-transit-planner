# Usage analytics: pulling and reading the numbers

The app counts anonymous usage through its own Worker. Each event goes to
`POST /api/e` and is stored in Workers Analytics Engine, in the dataset
`htp_events`. Cloudflare has no dashboard screen for this dataset, so the
data can only be read through its SQL API. `scripts/usage_report.py` is the
way to read it. What we collect, and what we never collect, is set out in
`docs/legal-posture.md` → Usage analytics.

## One-time setup

1. In the Cloudflare dashboard, go to **My Profile → API Tokens → Create
   Token → Custom token**. Give it one permission only: **Account →
   Account Analytics → Read**.
2. Save the token and the account ID outside the repo, in
   `~/.config/humphreys/cloudflare-analytics.env`:

   ```
   CLOUDFLARE_ANALYTICS_TOKEN=...
   CLOUDFLARE_ACCOUNT_ID=...
   ```

   Then run `chmod 600` on the file. Each value must sit on one line. If a
   pasted value wraps onto a second line, the API answers `HTTP Error 404`.
   The account ID is 32 hex characters.
3. On each of your own devices, open
   `https://humphreysbus.app/?dev=htp-builder` once in every browser you use.
   The mark is stored per browser, in `localStorage`. From then on your
   visits are counted as `dev` and the report leaves them out.
   `?dev=off` removes the mark.

## Running the report

From the repo root (Python 3, no extra packages):

```bash
python3 scripts/usage_report.py            # last 7 days, real users only
python3 scripts/usage_report.py 30         # last 30 days
python3 scripts/usage_report.py 7 --all    # include dev devices + branch previews
python3 scripts/usage_report.py 30 > report.md   # save it
```

The output is Markdown tables. Counts are `sum(_sample_interval)`, so they
stay correct if Analytics Engine ever samples. Analytics Engine keeps data
for three months.

## Reading the tables

| Table | What it tells you |
|---|---|
| Events by audience | Total per event, split by audience: `user`, `dev` (marked devices) or `preview` (`*.workers.dev` branch builds). |
| Daily opens and plans | App opens and trips planned, per day (UTC). |
| Mapbox calls | One row per API and outcome: `billed` went to Mapbox and counts toward the bill, `hit` came from the Worker cache (free), `limited` was blocked by the per-IP rate limit, `error` means Mapbox failed (that call was already counted as `billed`). These rows are written by the Worker itself, not by the app. |
| Plan results | `trips` (bus trips found), `walk` (walking only), `none`, `same` (same stop), plus how each end was picked: `stop`, `bldg`, `place`, `side`, `geo`. |
| Top trips | The most-planned bus stop pairs. |
| Where we couldn't help | "Sorry" cases. `leg`: a walk leg had no directions. `no-walk-directions`: the only option was a walk with no route. `no-path`: no shuttle connects the stops. |
| Language and country | EN/KO split. Country comes from Cloudflare; `KR` is the stand-in for "on post". |
| Feature use | Tabs, place picks, side picks and feedback links. `route_pick` is allowed by the Worker, but nothing in the app sends it yet. |

## Custom questions

The report covers the common questions. For anything else, query the SQL
API directly, or ask Claude to run a query. The columns are:

| Column | Holds |
|---|---|
| `blob1` | event: `open`, `tab`, `plan`, `place_pick`, `side_pick`, `route_pick`, `feedback`, `sorry`, `mapbox` |
| `blob2` | audience: `user`, `dev`, `preview` |
| `blob3` | language: `en`, `ko` |
| `blob4` | country (two-letter code) |
| `blob5` | `p1`: plan result, tab name, sorry reason, Mapbox API (`walk`/`search`), feedback source |
| `blob6` | `p2`: trip ends (`bldg>stop`), Mapbox outcome, picked side or place source |
| `blob7` | `p3`: stop pair (`Lodging > Commissary`) |
| `timestamp` | event time (UTC) |

Example, run from Python with the helpers in the script:

```python
import sys; sys.path.insert(0, "scripts")
import usage_report as u
env = u.load_env()
print(u.sql(env, """
  SELECT blob3 AS lang, sum(_sample_interval) AS n FROM htp_events
  WHERE timestamp > NOW() - INTERVAL '7' DAY AND blob2 = 'user' AND blob1 = 'plan'
  GROUP BY lang"""))
```

## Adding an event

Call `track(event, { lang, p1, p2, p3 })` from `src/lib/telemetry.js`, and
add the event name to `EVENT_NAMES` in `worker/index.js`. The Worker rejects
any name that is not on that list. Labels are public stop names or result
kinds only: never coordinates, building numbers, Mapbox place names or
search text.

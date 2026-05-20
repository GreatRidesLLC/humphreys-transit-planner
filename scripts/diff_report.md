# Schedule diff — official vs ROUTES const

Scraped: 2026-05-20T00:50:14.252370+00:00
Source: https://home.army.mil/humphreys/my-usag-humphreys/post-shuttle-bus-service

## Stop coverage

- Stops only on official site (missing from ROUTES): 0

- Stops only in ROUTES (not on per-stop directory): 0
  (these likely need name-alias updates in NAME_ALIASES, or are genuinely missing)

- Stops only in ROUTES, but belong to Gold/Brown/Pink (route-level PDFs, no per-stop images): 18
  - Balboni Sports Field (Marne Ave)
  - Barracks (6800s Block)
  - Barracks (700s Block)
  - Elementary School
  - Family Housing (North)
  - Family Housing (Palmer)
  - Family Housing (South)
  - Family Housing (Stanton)
  - Family Housing Towers (Taro Ave)
  - Freedom Chapel
  - Hospital Annex
  - Middle/High School
  - Morning Calm Center
  - Park Area
  - Red Cloud Circle
  - River Bend Golf Course
  - Sentry Village Burger King
  - Sentry Village Mini Mall

## Inferred headways (vs current `freq`)

Mode delta is the most common gap (minutes) between consecutive
departures at stops served *exclusively* by that route.

| Route | current freq | observed mode(s) | samples | exclusive stops |
|---|---|---|---|---|
| BLACK | 25 | — | 0 | (none — all stops shared) |
| BLUE | 20 | 15m×11 | 11 | 2ID Sustainment, Central Issue Facility |
| BROWN | 30 | — | 0 | Family Housing (Stanton), Elementary School, Middle/High School, Family Housing (Palmer) |
| GOLD | 20 | — | 0 | Barracks (700s Block), Morning Calm Center, Sentry Village Burger King, Sentry Village Mini Mall, Freedom Chapel, Family Housing Towers (Taro Ave), Red Cloud Circle, Balboni Sports Field (Marne Ave), Barracks (6800s Block), River Bend Golf Course |
| GREEN | 20 | 15m×50, 2m×15, 13m×13 | 126 | Desiderio ATC Tower, Law Enforcement Center (DES), Lodging, KTO Museum |
| ORANGE | 30 | — | 0 | (none — all stops shared) |
| PINK | 30 | — | 0 | Family Housing (North), Park Area, Family Housing (South), Hospital Annex |
| PURPLE | 25 | 15m×54, 8m×8, 7m×7 | 75 | Brian D. Allgood Hospital, Turner Fitness Center, Barracks (6800s & 6900s Block) |

## Service hours

| Route | current hours | OCR earliest | OCR latest |
|---|---|---|---|
| BLACK | 0600–2200 | 04:03 | 23:53 |
| BLUE | 0600–2200 | 04:03 | 23:53 |
| BROWN | 0600–2200 | 05:30 | 23:48 |
| GOLD | 0900–2100 | 04:19 | 23:48 |
| GREEN | 0600–2200 | 04:02 | 23:53 |
| ORANGE | 0600–2200 | 04:03 | 22:52 |
| PINK | 0600–2200 | 05:30 | 23:48 |
| PURPLE | 0600–2200 | 04:03 | 23:53 |

## Caveats

- OCR is imperfect; minute patterns within ±2 minutes of the
  modal delta are usually genuine, larger outliers are OCR errors.
- Route-to-panel attribution inside each schedule image is not
  reliably extractable from tesseract output (panels are color-
  coded, not labeled by route name in text). Headways above lean
  on stops served by only one route in our current ROUTES list.
- Humphreys Bus (Jong Seon Kim, iOS) data not compared — would
  require an IPA bundle dump from a device. App Store listing
  claims arrival times across all 8 routes, matching our source.

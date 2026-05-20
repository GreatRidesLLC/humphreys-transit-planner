# Schedule diff — official vs ROUTES const

Scraped: 2026-05-20T01:34:46.032657+00:00
Source: https://home.army.mil/humphreys/my-usag-humphreys/post-shuttle-bus-service

## Stop coverage

- Stops only on official site (missing from ROUTES): 3
  - Downtown Plaza
  - Family Housing Towers (15th Street)
  - Family Mini Mall / Gas Station

- Stops only in ROUTES (no official-site coverage from PNGs or PDFs): 8
  (these likely need name-alias updates in NAME_ALIASES, or are genuinely stale guesses in ROUTES)
  - Elementary School
  - Family Housing (North)
  - Family Housing (Palmer)
  - Family Housing (South)
  - Family Housing (Stanton)
  - Hospital Annex
  - Middle/High School
  - Park Area

## Inferred headways (vs current `freq`)

Mode delta is the most common gap (minutes) between consecutive
departures at stops served *exclusively* by that route.

| Route | current freq | observed mode(s) | samples | source |
|---|---|---|---|---|
| BLACK | 25 | — | 0 | no data |
| BLUE | 15 | 15m×11 | 11 | PNG (exclusive stops: 2ID Sustainment, Central Issue Facility) |
| BROWN | 30 | 30m×195 | 195 | PDF (FRIDAY, SATURDAY / TRAINING HOLIDAY) |
| GOLD | 20 | 20m×865, 30m×8, 34m×7 | 880 | PDF (MONDAY-SATURDAY, SATURDAY, SUNDAY) |
| GREEN | 15 | 15m×50, 2m×15, 13m×13 | 126 | PNG (exclusive stops: Desiderio ATC Tower, Law Enforcement Center (DES), Lodging, KTO Museum) |
| ORANGE | 30 | — | 0 | no data |
| PINK | 30 | 15m×222, 14m×21, 16m×21 | 264 | PDF (FRIDAY / TRAINING HOLIDAY, SATURDAY) |
| PURPLE | 15 | 15m×54, 8m×8, 7m×7 | 75 | PNG (exclusive stops: Brian D. Allgood Hospital, Turner Fitness Center, Barracks (6800s & 6900s Block)) |

## Service hours

| Route | current hours | OCR earliest | OCR latest |
|---|---|---|---|
| BLACK | 0600–2200 | 04:03 | 23:53 |
| BLUE | 0600–2200 | 04:03 | 23:53 |
| BROWN | 0600–2200 | 05:30 | 23:48 |
| GOLD | 0900–2100 | 04:04 | 23:48 |
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

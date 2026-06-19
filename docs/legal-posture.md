# Legal posture

Status: **Active** (standalone path; PAO engaged, coexistence approved 2026-06-19).

This document records the trademark / endorsement / branding stance taken while shipping the app standalone. If the Director of USAG Humphreys Public Affairs Office (PAO) accepts the project for MyArmyPost App (MAPA) integration, the "PAO-positive revert path" section below lists what changes — none of the changes here are load-bearing on architecture, only on copy.

## PAO engagement — Director Nagan (2026-06-19)

Director Nagan (PAO) responded after earlier silence. He does **not** oppose the standalone app, on the condition that it **points users toward MAPA, not away from it**. This is a coexistence arrangement, not MAPA integration — the distribution-pivot path stays unexecuted.

Three commitments made to Nagan, all shipped 2026-06-19 in `src/App.jsx`:

1. **Home-screen MAPA button** (`MapaCard`) — links to MAPA on the App Store (`apps.apple.com/us/app/myarmypost/id6467240977`) and Google Play (`play.google.com/store/apps/details?id=mil.aswf.garrison`). URLs in `MAPA_LINKS` const.
2. **First-launch notice** (`FirstRunNotice`) — one-time modal (dismissal persisted in `localStorage` key `humphreys.noticeSeen`) stating the tool is unofficial / community-built and that MAPA is the official U.S. Army app. Strings: `STRINGS.{en,ko}.noticeTitle` / `noticeBody` / `noticeAck`.
3. **Schedule-source credit line** — footer line crediting USAG Humphreys as the publicly posted source of route schedules. String: `STRINGS.{en,ko}.scheduleCredit`. Kept **descriptive** ("sourced from publicly posted USAG Humphreys PDFs"), not an affiliation/partnership claim — non-affiliation stance below is unchanged.

## Audience risk summary

- **App name uses "Humphreys"** — a common surname plus a place name. Place names alone are weak trademark claims, but the audience (military, civilian DoD employees, KATUSAs, KSC, family members) reads "Humphreys" as shorthand for the U.S. Army installation. An "official" reading is likely unless actively disclaimed.
- **DoD brand assets are not used** — no Army star, no USAG seal, no Department of Defense identifier appears in any committed asset (`public/favicon.svg`, `public/icon.svg`). Audit performed 2026-05-28.
- **Olive-drab Army palette dropped** — superseded by the tactical-night + signal-cyan repalette (commits `dd29f13` → `f41f47d`). No Army-coded visual identity remains.
- **"Verified by USAG"** language has been removed — replaced with descriptive "transcribed from publicly posted PDF". The internal `verified: true` data flag is unchanged because it gates schedule-lookup behavior in `findTrips`; only user-facing copy was scrubbed.

## Chosen name

**Humphreys Transit Planner** (English) / **험프리스 교통 플래너** (Korean).

Rationale:

- Keeps "Humphreys" for discoverability — the audience searches "Humphreys bus", not "Pyeongtaek bus".
- Adds **"Planner"** to frame the tool as user-built planning aid, not an authoritative timetable feed. "Planner" implies a third-party tool the way "trip planner" does for Google Maps relative to MTA.
- Avoids the high-risk strings: **"USAG Humphreys"**, **"Camp Humphreys"** (as title), **"Official"**, **"Endorsed"**.
- Reversible: if PAO accepts integration, dropping "Planner" → "Humphreys Transit" is one `STRINGS.en.appTitle` / `STRINGS.ko.appTitle` edit plus one entry each in `index.html`, `vite.config.js` (manifest), `package.json`, `README.md`, `CLAUDE.md`. Indexed in `docs/distribution-pivot.md`.

## Disclaimer wording (canonical)

Every tab carries a footer. Larger banner appears on the Off-Post tab where official-sounding content (DSN contacts, inter-garrison routes) raises endorsement risk.

**English (`STRINGS.en.disclaimer`):**

> Community-built shuttle planner. Not affiliated with, endorsed by, or operated by USAG Humphreys, the U.S. Army, or the Department of Defense. Schedule data transcribed from publicly posted PDFs; verify with the Transportation Office (DSN 755-0424) before relying on it.

**Korean (`STRINGS.ko.disclaimer`):**

> 사용자 제작 셔틀 플래너입니다. USAG 험프리스, 미 육군 또는 미 국방부와 제휴되어 있거나 승인된 것이 아닙니다. 시간표는 공개된 PDF에서 옮긴 것입니다. 운행 전 교통과(DSN 755-0424)에 확인하세요.

## Text-scrub checklist

Applied to `src/App.jsx` and `README.md`. Strikethrough = removed/rephrased.

| Old | New |
| --- | --- |
| `"Humphreys Transit"` (appTitle EN) | `"Humphreys Transit Planner"` |
| `"험프리스 교통"` (appTitle KO) | `"험프리스 교통 플래너"` |
| `"Camp Humphreys · USAG Korea"` (appSubtitle EN) | `"Community shuttle planner · Pyeongtaek"` |
| `"캠프 험프리스 · USAG Korea"` (appSubtitle KO) | `"사용자 제작 셔틀 플래너 · 평택"` |
| `"verified from official 15 July 2023 PDF"` (CLAUDE.md, App.jsx comments) | `"transcribed from publicly posted 15 July 2023 PDF"` |
| `"PDF-verified schedule"` (badge text) | `"PDF-sourced schedule"` |
| `"PDF-VERIFIED SCHEDULE"` (header) | `"PDF-SOURCED SCHEDULE"` |
| `"Verify at USAG Humphreys or MyArmyPost app."` | `"Verify with Transportation Office (DSN 755-0424) before relying on it."` |
| `"From official PDF (15 July 2023)"` (route notes) | `"Transcribed from publicly posted PDF (15 July 2023)"` |
| `"Departs Bus Terminal :00 :20 :40 each hour (from official July 2023 PDF)"` | `"Departs Bus Terminal :00 :20 :40 each hour (from publicly posted July 2023 PDF)"` |
| `"Download current PDF from USAG Humphreys website."` | `"Download current PDF from the post's public shuttle page."` |
| `"Verify current schedule at USAG Humphreys website."` | `"Verify current schedule on the post's public shuttle page."` |
| `"Updated Feb 2026. Download current PDF from USAG Humphreys website."` | `"Updated Feb 2026. Download current PDF from the post's public shuttle page."` |
| `"...for Humphreys."` (BusWhere copy) | `"...for the post."` |
| `"USAG 험프리스 또는 MyArmyPost 앱에서 확인하세요."` | `"운행 전 교통과(DSN 755-0424)에 확인하세요."` |
| `"...not yet verified against an official PDF"` (EST. tooltip) | `"...not yet matched against a publicly posted PDF"` |

Strings that intentionally stay:

- `Transportation Office DSN 755-0424` — descriptive reference contact in Off-Post tab, framed as external. Not an affiliation claim.
- `DPW GIS / IGI&S Bldg 6140` — same.
- `home.army.mil/humphreys` — descriptive link to public source of inter-garrison PDFs; no claim of endorsement.
- Stop names (`Bus Terminal`, `Maude Hall`, `Pacific Victors Chapel`, etc.) — descriptive geographic references. No trademark risk.
- Internal data flag `verified: true` on `ROUTES.GOLD` / `BROWN` / `PINK` — internal switch read by `findTrips` to consult `src/data/schedules.json`. Not user-visible. No copy change needed.

## Asset audit (2026-05-28)

| File | Content | Risk |
| --- | --- | --- |
| `public/favicon.svg` | Purple geometric shape (template leftover). Replace before public ship. | None — purely abstract. Tracked as separate cleanup. |
| `public/icon.svg` | Tactical-night background with gold `H`-bar (own brand mark) + cyan accent. | None — own design, no DoD/Army identifier. |
| `public/icons.svg` | Symbol library: bluesky, discord, github, x, social. Unused. | None — generic third-party social glyphs. |

Action items from audit:

- Replace `public/favicon.svg` with own brand mark before public ship. Currently a leftover purple-template SVG that does not match the app identity.
- Consider deleting `public/icons.svg` if no social-share UI is planned. Dead asset.

## PAO-positive revert path

If the Director responds positively and accepts MAPA integration:

1. **Rename revert** — `STRINGS.en.appTitle` `"Humphreys Transit Planner"` → `"Humphreys Transit"`. Same for KO. Mirror change in `index.html`, `vite.config.js` (manifest `name` + `short_name`), `package.json` (`name`), `README.md` heading, `CLAUDE.md` heading.
2. **Disclaimer softening** — `STRINGS.en.disclaimer` / `STRINGS.ko.disclaimer` updated to whatever wording PAO requires (likely shorter, possibly "Operated in coordination with USAG Humphreys PAO"). Footer component stays, only the string changes.
3. **Off-Post banner removal** — drop the larger disclaimer banner at the top of the Off-Post tab; the universal footer suffices.
4. **Subtitle restoration** — `appSubtitle` may return to `"Camp Humphreys · USAG Korea"` if PAO confirms branding alignment.
5. **Tooltip wording** — `"PDF-sourced schedule"` may flip back to `"PDF-verified schedule"` if PAO is now the verifying party.
6. **MAPA embed chrome** — implement `?embed=1` query param to hide header + tabs row + footer when iframed inside MAPA WebView. Single conditional in `App.jsx` render.
7. **CSP `frame-ancestors`** — `public/_headers` swap from `'none'` to the MAPA origin. `X-Frame-Options: DENY` removed in tandem.

All seven steps are pure copy / config edits. No code architecture changes. Estimated effort: half a day including QA.

See `docs/distribution-pivot.md` for the file/line index.

## PAO-negative confirmation path

If the Director explicitly declines or is unreachable for >90 days (current state — first email sent earlier in 2026, no response):

- Keep current standalone posture indefinitely.
- Re-emphasize disclaimer in About copy.
- Optional: register a non-`.army.mil` domain (e.g. `humphreys-transit.app`) — Cloudflare Pages free tier serves on `*.pages.dev` until then.
- Optional: add explicit "Report inaccurate schedule" footer link once feedback channel ships (Roadmap Phase 5a).

## Related

- [`docs/distribution-pivot.md`](./distribution-pivot.md) — file/line index for the PAO-positive revert.
- `SECURITY.md` — controls deferred to MAPA-positive branch.
- `Roadmap.md` Phase 5a / 5b / 5c — work split by PAO outcome.

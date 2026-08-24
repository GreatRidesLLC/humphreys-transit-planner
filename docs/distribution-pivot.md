# Distribution pivot index

If PAO accepts MAPA integration, this is the diff to apply. Standalone-active is the current state; this doc lists exactly what flips on PAO-positive.

Background context: `docs/legal-posture.md`, `SECURITY.md`, `Roadmap.md` Phase 5b.

## Standalone-active (today)

| Concern | Where | Current value |
| --- | --- | --- |
| App title (EN) | `src/App.jsx` `STRINGS.en.appTitle` | `"Humphreys Transit Planner"` |
| App title (KO) | `src/App.jsx` `STRINGS.ko.appTitle` | `"험프리스 교통 플래너"` |
| App subtitle (EN) | `src/App.jsx` `STRINGS.en.appSubtitle` | `"Community shuttle planner · Pyeongtaek"` |
| App subtitle (KO) | `src/App.jsx` `STRINGS.ko.appSubtitle` | `"사용자 제작 셔틀 플래너 · 평택"` |
| HTML `<title>` | `index.html` | `"Humphreys Transit Planner"` |
| Apple home-screen title | `index.html` `apple-mobile-web-app-title` | `"Transit Planner"` |
| PWA manifest `name` | `vite.config.js` `VitePWA` plugin | `"Humphreys Transit Planner"` |
| PWA manifest `short_name` | `vite.config.js` | `"Transit Planner"` |
| PWA manifest `description` | `vite.config.js` | `"Community shuttle planner for the post in Pyeongtaek."` |
| npm package name | `package.json` `name` | `"humphreys-transit"` (unchanged; npm name is internal) |
| Footer disclaimer | `src/App.jsx` (universal footer) | Full canonical disclaimer per `docs/legal-posture.md` |
| Off-Post tab banner | `src/App.jsx` `OffPostTab` top | Larger disclaimer banner |
| Endorsement-language scrub | `src/App.jsx`, `README.md` | Per `docs/legal-posture.md` checklist |
| CSP `frame-ancestors` | `public/_headers` | `'none'` |
| `X-Frame-Options` | `public/_headers` | `DENY` |
| MAPA embed chrome (`?embed=1`) | not implemented | n/a |
| Hosting | Cloudflare Workers Static Assets, project `humphreys-transit-planner`; `main` deploys to `https://humphreysbus.app` (fallback `*.workers.dev` for preview) | n/a |
| Domain | `humphreysbus.app` registered via Cloudflare Registrar 2026-08-21 | n/a |
| DNS hardening (DNSSEC, CAA, registrar lock) | applied 2026-08-21: DNSSEC on (DS at `.app` registry, `ad` flag validating), CAA restricts to `pki.goog` + `letsencrypt.org` + `iodef mailto:`, CF Edge CA pinned to Google Trust Services, registrar transfer-lock on | n/a |

## PAO-positive delta

Apply these in order. All are copy / config edits — no architectural change.

### 1. Rename to "Humphreys Transit"

| File | Change |
| --- | --- |
| `src/App.jsx` `STRINGS.en.appTitle` | `"Humphreys Transit Planner"` → `"Humphreys Transit"` |
| `src/App.jsx` `STRINGS.ko.appTitle` | `"험프리스 교통 플래너"` → `"험프리스 교통"` |
| `src/App.jsx` `STRINGS.en.appSubtitle` | `"Community shuttle planner · Pyeongtaek"` → `"Camp Humphreys · USAG Korea"` (or PAO-supplied wording) |
| `src/App.jsx` `STRINGS.ko.appSubtitle` | `"사용자 제작 셔틀 플래너 · 평택"` → `"캠프 험프리스 · USAG Korea"` |
| `index.html` `<title>` | `"Humphreys Transit Planner"` → `"Humphreys Transit"` |
| `index.html` `apple-mobile-web-app-title` | `"Transit Planner"` → `"Humphreys"` |
| `vite.config.js` manifest `name` | `"Humphreys Transit Planner"` → `"Humphreys Transit"` |
| `vite.config.js` manifest `short_name` | `"Transit Planner"` → `"Humphreys"` |
| `vite.config.js` manifest `description` | `"Community shuttle planner for the post in Pyeongtaek."` → `"Plan on-post shuttle trips at USAG Humphreys, South Korea."` (or PAO-supplied) |
| `README.md` H1 | `# Humphreys Transit Planner` → `# Humphreys Transit` |
| `CLAUDE.md` H1 | `# Humphreys Transit Planner` → `# Humphreys Transit` |

### 2. Disclaimer softening

| File | Change |
| --- | --- |
| `src/App.jsx` `STRINGS.en.disclaimer` | Replace canonical wording with PAO-supplied attribution (likely "Operated in coordination with USAG Humphreys Public Affairs Office" or similar). |
| `src/App.jsx` `STRINGS.ko.disclaimer` | Korean equivalent. |
| `src/App.jsx` `OffPostTab` top banner | Remove larger disclaimer banner; rely on universal footer. |
| `src/App.jsx` route notes | `"Transcribed from publicly posted PDF"` → `"PDF-verified"` (revert text scrub) |
| `src/App.jsx` `STRINGS.*.pdfVerified` | `"✓ PDF-sourced schedule"` → `"✓ PDF-verified schedule"` |
| `src/App.jsx` `STRINGS.*.verifiedScheduleHeader` | `"PDF-SOURCED SCHEDULE"` → `"PDF-VERIFIED SCHEDULE"` |
| `src/App.jsx` `STRINGS.*.waitDisclaimer` | Restore `"Verify at USAG Humphreys or MyArmyPost app."` tail |
| `src/App.jsx` `STRINGS.*.estTitle` | `"not yet matched against a publicly posted PDF"` → `"not yet verified against an official PDF"` |

### 3. MAPA embed chrome

| File | Change |
| --- | --- |
| `src/App.jsx` (top of `App`) | Read `?embed=1` from `URLSearchParams(window.location.search)`. Skip header block (`maxWidth:480` wrapper's first child div) and footer when `embed === true`. |
| `vite.config.js` | No change (manifest still installed when accessed direct). |

### 4. CSP / framing controls

| File | Change |
| --- | --- |
| `public/_headers` `Content-Security-Policy` | `frame-ancestors 'none'` → `frame-ancestors https://mapa.example.mil` (replace with PAO-supplied MAPA origin) |
| `public/_headers` `X-Frame-Options` | Remove `X-Frame-Options: DENY` line entirely (legacy header conflicts with `frame-ancestors`) |
| `SECURITY.md` "Trademark / endorsement posture" subsection | Update to reflect MAPA integration |

### 5. ATO / RMF / STIG paperwork

Tracked in `SECURITY.md` "Controls deferred to MAPA-positive branch". Triggered only when MAPA WebView path is chosen and the host system requires it. Not a code change.

### 6. Hosting + DNS

If MAPA integration is "data-feed-only handoff" (PAO consumes `src/data/schedules.json` directly), the standalone PWA can keep its own host. If MAPA embeds the SPA via iframe, the SPA still hosts itself — same Cloudflare Workers deploy on `humphreysbus.app`. DNS hardening (DNSSEC, CAA, registrar lock) was applied 2026-08-21 alongside registration; no further action required on the standalone side. If PAO wants the app served from a `.mil` subdomain instead, DNS work restarts on that domain.

## Reverse pivot (PAO turns negative after positive)

Same diff applied in reverse. Doc is symmetric.

## Estimated effort

Items 1–4 combined: half a day including QA. ATO/RMF paperwork in item 5 is the unknown — could be weeks if the MAPA path requires a fresh Authority to Operate package.

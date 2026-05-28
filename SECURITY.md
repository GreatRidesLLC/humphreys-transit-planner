# Security Policy

## Scope

Humphreys Transit Planner is a community-built, static, client-side React application for planning shuttle trips around the U.S. Army installation in Pyeongtaek, South Korea. It is not affiliated with, endorsed by, or operated by USAG Humphreys, the U.S. Army, or the Department of Defense. It has no backend, no authentication, no PII collection, and no third-party analytics by default.

## Reporting a vulnerability

If you discover a security issue, please report it privately. Do not open a public GitHub issue.

- Email: emmanuel.bayere@gmail.com
- Subject line: `SECURITY: humphreys-transit`
- Expected first response: within 7 days
- Coordinated disclosure: 90 days from acknowledgement, or earlier if a fix ships

Please include:

- A description of the issue and its impact
- Steps to reproduce
- Affected versions or commit SHAs
- Any proof-of-concept code (do not run it against production deployments you do not own)

## Supported versions

The project is pre-1.0. Only the `main` branch receives security fixes.

## Threat model

### Assets

| Asset | Sensitivity | Notes |
|-------|-------------|-------|
| Route and stop data | Low | Publicly posted route PDFs and OpenStreetMap data |
| Build artifact (HTML/JS/CSS) | Medium | Tampering enables phishing against a trusted audience |
| Build pipeline | High | Supply-chain entry point |
| Hosting infrastructure (CDN, DNS, certs) | High | Loss of integrity here compromises every user |
| Domain reputation | High | The audience trusts `.mil`-adjacent contexts |
| Future telemetry or logs | High (if added) | Stop usage plus timestamps can leak OPSEC patterns of life |

### Adversaries in scope

- Opportunistic script kiddies attempting to deface a static deployment
- Supply-chain attackers via compromised npm dependencies or transitive packages
- Phishing operators registering lookalike domains
- DNS, CDN, or registrar account takeover attempts

### Adversaries out of scope

- Nation-state APT activity targeting the application directly
- Physical attacks on user devices
- Compromise of the underlying operating system or browser

### Non-threats today

- Authentication bypass: no auth exists
- SQL injection: no database
- Server-side request forgery: no backend
- Session hijacking: no sessions

These may enter scope as the application gains features. Update this section when that changes.

## Controls in place

### Build-time

- Pinned Node version via `package.json` `engines` (to be added)
- `package-lock.json` committed; CI uses `npm ci`
- `gitleaks` pre-commit hook scans staged changes for secrets
- `gitleaks` GitHub Actions job runs on every PR and push to `main` (`.github/workflows/ci.yml`)
- Full-history `gitleaks detect --log-opts="--all"` scan completed against 38 commits prior to first push — no leaks
- `npm audit --audit-level=high` gate in CI; build fails on high/critical advisories
- SBOM generated on each build (`sbom.json`, CycloneDX format) and uploaded as a CI artifact
- Dependabot weekly updates for `npm` and `github-actions` ecosystems (`.github/dependabot.yml`)

### Runtime / hosting

- Static `_headers` file declares Content-Security-Policy, Strict-Transport-Security, X-Content-Type-Options, Referrer-Policy, and Permissions-Policy
- Fonts are self-hosted; no Google Fonts call at runtime
- No third-party analytics or telemetry
- HTTPS only
- Map tab loads raster tiles from `https://*.basemaps.cartocdn.com` (CARTO `dark_all`). This host is the only third-party origin in the CSP `img-src` allowlist. Tiles are fetched via `<img>` only; no XHR or script load from CARTO is permitted by `connect-src 'self'` and `script-src 'self'`.
- Map popups for stops and OSM-sourced POIs are built with `document.createElement` and `textContent` — `innerHTML` is not used with any OSM-derived string (`name`, `amenity`), so a malicious OSM tag cannot inject markup. CSP `script-src 'self'` provides a second layer.

### Data handling

- No PII is collected, stored, or transmitted
- `localStorage` is used only for non-sensitive UI state (favorites, recent trips, language preference)
- No background network calls beyond serving static assets
- Geolocation is requested only on explicit user click of the "📍 Nearest" button on the Plan tab. The browser-granted lat/lon is held in component state for the lifetime of the page, used locally to pick the closest stop and to compute a haversine walk leg, and is never persisted to `localStorage` or transmitted. Coords are cleared on swap or manual From-field edit.
- `Permissions-Policy: geolocation=(self)` scopes the permission to first-party only; all other sensors (camera, mic, accelerometer, etc.) remain denied via `=()`.

## Trademark / endorsement posture

The app ships under the name **Humphreys Transit Planner** with a universal footer disclaimer asserting non-affiliation with USAG Humphreys, the U.S. Army, and the Department of Defense. A larger banner appears on the Off-Post tab where official-sounding content (DSN contacts, inter-garrison routes) raises endorsement risk. User-facing strings have been scrubbed of language that implies authoritative verification ("PDF-verified" → "PDF-sourced"; "official PDF" → "publicly posted PDF"). Committed assets (`public/favicon.svg`, `public/icon.svg`, `public/icons.svg`) carry no Army / DoD / USAG identifiers — audit performed 2026-05-28.

Decision record and scrub checklist: `docs/legal-posture.md`. PAO-positive revert index: `docs/distribution-pivot.md`.

If the PAO Director accepts MAPA integration, copy reverts per `docs/distribution-pivot.md` "PAO-positive delta" and the "Controls deferred to MAPA-positive branch" list below activates.

## Controls deferred to MAPA-positive branch

The project currently ships standalone (see `docs/legal-posture.md`). Some controls only become relevant if the PAO Director accepts MyArmyPost App (MAPA) integration:

- ATO / RMF / STIG paperwork — only relevant for MAPA integration
- CSP `frame-ancestors` swap from `'none'` to the MAPA origin (and removal of `X-Frame-Options: DENY`)
- Code-signing infrastructure — only relevant if a native wrapper is later added on top of MAPA
- Pen test engagement scoped to MAPA's embedding chrome

## Controls deferred until a production domain is registered

- DNS hardening (DNSSEC, CAA, registrar lock) — only relevant once a production domain is registered (Cloudflare Pages default `*.pages.dev` is the planned initial host)
- Pen test engagement — timed to whichever path goes live

## Controls deferred until branch protection / deploy is wired up

The repo is hosted at `github.com/Bennoah/humphreys-transit-planner`. CI (gitleaks, `npm audit`, SBOM upload) and Dependabot are active. The following still require admin / deploy-target setup:

- Branch protection on `main`: required reviews, required status checks (CI jobs), no force-push
- Dependabot auto-merge for patch-level updates (requires branch protection + a workflow with `gh pr merge --auto`)
- OIDC federation to the hosting provider for deploys (replace any static deploy token) — deferred until Cloudflare Pages target is wired

## Out-of-scope security findings

The following are not considered security vulnerabilities and will not be triaged as such:

- Missing security headers in development mode
- Self-XSS that requires the user to paste attacker-supplied JavaScript into devtools
- Reports generated solely by automated scanners without a working proof of concept
- Issues affecting unsupported branches

## Credits

We acknowledge responsible reporters in release notes by default. Reporters who prefer to remain anonymous should say so in the initial email.

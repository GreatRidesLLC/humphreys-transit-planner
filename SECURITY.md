# Security Policy

## Scope

Humphreys Transit is a static, client-side React application for planning on-post bus trips at USAG Humphreys - South Korea. It has no backend, no authentication, no PII collection, and no third-party analytics by default.

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
| Route and stop data | Low | Public information sourced from USAG PAO and route PDFs |
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
- SBOM generated on each build (`sbom.json`, CycloneDX format)

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

## Controls deferred until deployment path is chosen

The project may ship as a MyArmyPost App (MAPA) integration, a standalone PWA, a native wrapper, or a hybrid. Some controls depend on that decision and are intentionally deferred:

- DNS hardening (DNSSEC, CAA, registrar lock) — only relevant once a production domain is registered
- Code-signing infrastructure — only relevant for native wrappers
- ATO / RMF / STIG paperwork — only relevant for MAPA integration
- Pen test engagement — timed to whichever path goes live

## Controls deferred until a remote repository exists

The repo is currently local-only. The following controls require a hosted git remote with CI (GitHub Actions, GitLab CI, or equivalent) and will be enabled after the project is pushed:

- `gitleaks` job on every PR and on `main`
- `npm audit --audit-level=high` gate in CI
- SBOM regeneration on each build, uploaded as a CI artifact
- Dependabot or Renovate weekly dependency updates (auto-merge for patch-level only)
- Branch protection: required reviews, required status checks, no force-push to `main`
- OIDC federation to the hosting provider for deploys (replace any static deploy token)
- Run `gitleaks detect --log-opts="--all"` against full history on first push, before the repo is made public or shared

## Out-of-scope security findings

The following are not considered security vulnerabilities and will not be triaged as such:

- Missing security headers in development mode
- Self-XSS that requires the user to paste attacker-supplied JavaScript into devtools
- Reports generated solely by automated scanners without a working proof of concept
- Issues affecting unsupported branches

## Credits

We acknowledge responsible reporters in release notes by default. Reporters who prefer to remain anonymous should say so in the initial email.

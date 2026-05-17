# Humphreys Transit

Mobile-first React app for planning on-post bus trips at Camp Humphreys (USAG Korea). Built for soldiers, family members, civilian employees, and Korean nationals living and working on the installation.

## Quick start

```bash
npm install        # install dependencies
npm run dev        # local dev server (http://localhost:5173)
npm run build      # production build into dist/
npm run preview    # serve dist/ locally to verify a production build
npm run lint       # eslint on the whole project
npm run sbom       # regenerate sbom.json (CycloneDX 1.6)
```

After cloning, also bootstrap the gitleaks pre-commit hook once:

```bash
./scripts/setup-hooks.sh
```

## Project structure

| Path | Purpose |
| --- | --- |
| `src/App.jsx` | Whole app — single component file by design. See "Where to look for X" below. |
| `src/main.jsx` | React entry point. |
| `public/fonts/` | Self-hosted Rajdhani / JetBrains Mono / Noto Sans KR (no Google CDN). |
| `public/_headers` | Static security headers (CSP, HSTS, etc.) applied at the edge by Cloudflare Pages / Netlify. |
| `public/favicon.svg` | App icon source. |
| `scripts/setup-hooks.sh` | Wires `core.hooksPath=.githooks` so the gitleaks pre-commit hook runs. |
| `.githooks/pre-commit` | Runs `gitleaks` against staged changes. |
| `.gitleaks.toml` | Gitleaks ruleset. |
| `sbom.json` | CycloneDX software bill of materials. Regenerate via `npm run sbom`. |
| `CLAUDE.md` | Project conventions, data-source status, audience notes. |
| `SECURITY.md` | Threat model, reporting policy, controls list, deferral sections. |
| `Roadmap.md` | Phased improvement queue and rationale. |

## Updating data

Schedule and reference data is hardcoded in `src/App.jsx`. To update:

| Data | Location |
| --- | --- |
| Routes, stops, frequencies, service hours | `ROUTES` const (~line 180) |
| Building-number directory | `BUILDINGS` const (~line 200) |
| Inter-garrison routes (info-only, not in trip planner) | `OFFPOST` const (~line 218) |
| UI strings (EN / KO) | `STRINGS` const (~line 38) |
| Color palette | `C` const (top of file) |

When a new official PDF arrives for a route currently flagged as estimated, set `verified: true` on that route's entry. Phase 5 in `Roadmap.md` covers the bigger schedule-data-structure refactor that replaces the `freq ÷ 2` wait math.

## Where to look for X

| Looking for | Where |
| --- | --- |
| Routing logic (the heart of the app) | `findTrips` in `src/App.jsx` (~line 280) |
| Next-departure logic for the Now tab | `nextDepartureInfo` (~line 598) |
| Trip-card UI | `TripCard` component |
| Route-list UI | `RouteCard` component |
| Stop search / building lookup | `StopInput` component |
| Schedule verification status | `CLAUDE.md` → "Data sources" |
| Open work and deferred items | `Roadmap.md` |
| Security posture and reporting | `SECURITY.md` |

## Mobile testing

**Preferred — cloudflared tunnel** (works from anywhere, HTTPS so service workers / geolocation activate):

```bash
npm run dev
# in another terminal:
cloudflared tunnel --url http://localhost:5173
```

Open the printed `https://*.trycloudflare.com` URL on the phone.

**LAN fallback — Vite host + WSL port-proxy** (Windows + WSL2 only):

1. `npm run dev -- --host 0.0.0.0` — bind Vite to all interfaces (note the WSL IP it prints).
2. Admin PowerShell:
   ```powershell
   netsh interface portproxy add v4tov4 listenport=5173 listenaddress=0.0.0.0 connectport=5173 connectaddress=<WSL_IP>
   New-NetFirewallRule -DisplayName "Vite Dev 5173" -Direction Inbound -LocalPort 5173 -Protocol TCP -Action Allow
   ```
3. Open `http://<WINDOWS_LAN_IP>:5173` on the phone (same WiFi). `ipconfig` shows the LAN IP.
4. WSL IP changes on every reboot — re-run the `portproxy` command with the fresh IP. Service workers and geolocation will not activate over plain HTTP; use the tunnel for those.

Cleanup when done:

```powershell
netsh interface portproxy delete v4tov4 listenport=5173 listenaddress=0.0.0.0
Remove-NetFirewallRule -DisplayName "Vite Dev 5173"
```

## Deployment

Target: Cloudflare Pages or Netlify (static-site host that respects `public/_headers`).

1. `npm run build` — output goes to `dist/`.
2. Upload `dist/` to the chosen host, or point the host at the git repo.
3. Verify headers post-deploy with [securityheaders.com](https://securityheaders.com).
4. Regenerate `sbom.json` on each release (`npm run sbom`) and commit alongside the version bump.

CI gates (gitleaks, `npm audit --audit-level=high`, SBOM upload, Dependabot, branch protection) are deferred until the repo is pushed to a hosted remote — see `SECURITY.md`.

## Security ops

- `scripts/setup-hooks.sh` wires the gitleaks pre-commit hook for new clones.
- Never commit `.env`, credentials, or other secrets — the hook blocks known patterns, not all secrets.
- `SECURITY.md` has the reporting policy and lists controls still deferred (remote-dependent and PAO-decision-dependent).
- Known compromise: CSP keeps `style-src 'self' 'unsafe-inline'` because the app uses inline styles. Tightening to nonces requires a refactor; tracked in `SECURITY.md`.

## Handoff / succession

- **Maintainer:** _(fill in — name + email)_
- **USAG Humphreys Public Affairs Office:** manages MyArmyPost App (MAPA) and is the integration / distribution stakeholder.
- **Transportation Office:** DSN 755-0424 — authoritative source for shuttle schedule changes.
- **DPW GIS / IGI&S:** Bldg 6140 — source of building directory and stop coordinates.
- **USAG Humphreys website:** [home.army.mil/humphreys](https://home.army.mil/humphreys)

If you're inheriting this project, read in this order: `CLAUDE.md` (conventions and audience), `Roadmap.md` (what's planned and why), `SECURITY.md` (what's hardened and what's deferred), then `src/App.jsx` (the whole app). The `findTrips` function is the trickiest piece — read it carefully before touching.

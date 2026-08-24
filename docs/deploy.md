# Deploy — Cloudflare Workers Static Assets

The app ships as a static SPA served by Cloudflare Workers Static Assets (Workers Builds path — dashboard git connection, no CI-side deploy step). See [[distribution-pivot]] for why Cloudflare and why standalone.

## Repo state (already wired)

- `wrangler.jsonc` — points `assets.directory` at `./dist` with `not_found_handling: "single-page-application"` for SPA fallback
- `public/_headers` — CSP, HSTS, X-Frame-Options, Referrer-Policy, Permissions-Policy, COOP/CORP, plus per-path cache rules. Vite copies to `dist/_headers` on build; Workers Static Assets parses it the same way Pages does (SPA has no Worker code, so every rule applies)
- `npm run build` — Vite + vite-plugin-pwa; emits `dist/` including `sw.js` and precached manifest

Nothing in CI touches Cloudflare. Deploys happen when Workers Builds sees a push to a watched branch.

## One-time dashboard setup

Cloudflare dashboard → **Workers & Pages** → **Create** → **Import a repository** → pick `humphreys-transit-planner`.

| Field | Value |
|-------|-------|
| Project name | `humphreys-transit-planner` (must match `wrangler.jsonc` `name`) |
| Production branch | `main` |
| Preview branches | `dev` (and any `feat/*` if desired) |
| Build command | `npm run build` |
| Deploy command | *(leave empty — `wrangler.jsonc` drives it)* |
| Build output directory | `dist` |
| Root directory | *(repo root)* |
| Node version | `20` (matches CI `.github/workflows/ci.yml`) |

Environment variables: none required for the current build.

## Branch → URL mapping

| Branch | URL | Purpose |
|--------|-----|---------|
| `main` | `https://humphreysbus.app` | Production (custom domain) |
| `main` | `humphreys-transit-planner.<subdomain>.workers.dev` | Production (fallback workers.dev) |
| `dev` | `dev.humphreys-transit-planner.<subdomain>.workers.dev` | Preview / smoke test before release |
| `feat/*` | `<hash>.humphreys-transit-planner.<subdomain>.workers.dev` | Per-PR preview (if enabled) |

Custom domain `humphreysbus.app` registered via Cloudflare Registrar 2026-08-21; attached to the Workers project as an apex Custom Domain (CF-managed cert, Google Trust Services). DNS hardening applied at the same time: DNSSEC enabled (DS pushed to `.app` registry, resolver returns `ad` flag), CAA records restrict issuance to `pki.goog` + `letsencrypt.org` with `iodef mailto:` for violation reports, and CF Registrar transfer-lock is on by default. See `SECURITY.md` "DNS / registrar" section.

## Post-deploy verification

After the first successful deploy:

1. Visit the prod URL, confirm the app loads
2. Deep-link test: `/<prod-url>/#/routes` should render the Routes tab (SPA fallback proof)
3. `curl -sI https://<prod-url>/` — confirm `content-security-policy`, `strict-transport-security`, `x-frame-options: DENY` headers present
4. Run https://securityheaders.com against the prod URL — expect A+ once HSTS preload is submitted post-launch
5. Verify PWA install: Chrome DevTools → Application → Manifest, no errors; service worker registered

## Rollback

Cloudflare dashboard → Workers & Pages → project → **Deployments** → pick a prior deploy → **Rollback**. No repo change required.

## Manual deploy (escape hatch)

Not wired. If needed later, add `"deploy": "wrangler deploy"` to `package.json` and run `npx wrangler login` locally. Prefer the dashboard flow for the launch — one deploy path, one source of truth.

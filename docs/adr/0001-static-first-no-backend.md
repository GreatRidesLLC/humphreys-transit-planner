# Static-first: no backend platform

The app ships as a fully static PWA — schedule, stop, and building data are JSON baked into the bundle at build time and precached by Workbox, served from Cloudflare Workers Static Assets. We evaluated adopting Convex as a backend (2026-08-22) and rejected it: no current feature needs a server (no writes, no accounts, no realtime), the data changes rarely and a git commit already redeploys in minutes, and a network-dependent backend would degrade the offline story for users standing at a bus stop with spotty signal while forcing the strict `default-src 'self'` CSP open to third-party origins.

## Consequences

- Feedback collection stays on Tally (external form); telemetry, if added, must be a script-free or same-origin solution compatible with the CSP.
- If a genuinely dynamic feature lands (live GPS, service alerts, feedback endpoint), the escape hatch is a route on the existing Cloudflare Worker that already serves the static assets — not a new backend platform. Re-evaluate a real backend (Convex or otherwise) only at that point.

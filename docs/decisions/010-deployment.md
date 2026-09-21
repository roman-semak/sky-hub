# ADR-010: Deployment topology

## Context

SPEC § 3 targets Cloudflare Pages (frontend) and Fly.io free tier (backend)
at 0 €. The backend is stateful (in-memory state, ingest loop, Parquet
history on disk) and must never scale to zero. Cloudflare Pages `_redirects`
cannot proxy to another origin, and the client calls `/api/*` and `/stream`.

## Decision

- **Backend:** one Fly.io machine from the repo `Dockerfile` (multi-stage,
  `pnpm deploy --prod`), `auto_stop_machines = off`, a 3 GB volume at
  `/data` for history, `/healthz` checks. The image also contains the web
  build and serves it when `WEB_DIST` is set, so a single container is a
  complete deployment on any host.
- **Frontend:** Cloudflare Pages serves `apps/web/dist/web/browser` with SPA
  fallbacks per locale (`_redirects`) and immutable caching for hashed files
  (`_headers`). The API origin is written into
  `<meta name="skytrace-api">` at deploy time; empty means same origin.
- **CI/CD:** `.github/workflows/deploy.yml` deploys the API, then the site,
  on every push to `main`. Each job is skipped until its secrets and
  variables exist.

## Consequences

Creating the Fly.io app requires an account with a payment card on file,
even on the free allowance, and Cloudflare needs an account and API token —
both are explicitly outside what the agent may do (CLAUDE.md). The
configuration is complete; the first deploy is a manual step for the owner.

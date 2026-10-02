# Deployment topology

**Canonical (production):** Vercel (web) + Railway (Postgres, Redis, BullMQ worker). Setup: [railway-setup.md](railway-setup.md).
The web tier only *enqueues* jobs; `src/worker.ts` (built by `Dockerfile.worker`) consumes them.

**Self-host option:** `docker-compose.yml` runs Postgres, Redis and the worker on one box, ports bound to `127.0.0.1`.
`deploy.sh` is the legacy droplet/systemd path (kept for self-hosters; Railway redeploys automatically on push).

Migrations: `npm run db:migrate` against the target DB before shipping code that needs them. `deploy.sh` does NOT migrate.
Day-2 operations: [../docs/RUNBOOK.md](../docs/RUNBOOK.md).

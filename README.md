# Ridhzo

A multi-tenant, WhatsApp-first lead CRM: capture leads from forms, webhooks, Facebook/Google Lead Ads and
CSV; assign, follow up, run sequences and automations; track meetings, pipeline and analytics; mobile API.

**Stack:** Next.js 15 (App Router, server components + server actions) · React 19 · TypeScript · Drizzle ORM +
PostgreSQL · BullMQ + Redis (background jobs) · NextAuth (JWT) · Razorpay billing · Cloudflare R2 (files) ·
Resend/SMTP (email) · Watxio (WhatsApp) · Vercel AI Gateway (AI).

## Architecture in one screen

```
Browser / mobile app ──► Next.js (Vercel)  ── server actions + /api/v1 + webhooks
                              │                      │ enqueue
                              ▼                      ▼
                         PostgreSQL ◄────────── Worker process (src/worker.ts, always-on: Railway/VM)
                                                 └ BullMQ consumers + schedulers (reminders, sequences, …)
```

- **Tenancy:** every row hangs off an `organization_id`; the tenant comes from the session (`requireOrg()`),
  never from user input. Services take `organizationId` as a required argument.
- **Permissions:** `src/lib/permissions.ts` (keys) + `src/lib/rbac` (checks). Enforce on the **server**
  (`requirePermission`, `assertLeadWrite`); hidden buttons are not security.
- **Web vs worker:** the web app only *enqueues* (`src/lib/jobs/queues/*`). Consumers live in
  `src/lib/jobs/workers/*` and are started only by `startWorkers` (`npm run worker`, or in-process off Vercel).
  Never import a `workers/*` module from web code.
- **Domains:** business logic in `src/domains/*`, server actions in `src/lib/actions/*`, public API in
  `src/app/api/v1/*`, webhooks in `src/app/api/webhooks/*`.

## Getting started

Requirements: Node 22, PostgreSQL 16, Redis 7 (optional locally — jobs and shared rate limits are disabled without it).

```bash
npm ci
cp .env.example .env          # fill DATABASE_URL and NEXTAUTH_SECRET at minimum
npm run db:migrate            # apply drizzle/ migrations
npm run db:seed               # LOCAL databases only: demo org, admin@acme.com / password123
npm run dev                   # http://localhost:3000
npm run worker                # separate terminal: background jobs (needs REDIS_URL)
```

`validateEnv()` (src/lib/env.ts) fails fast on missing required variables and warns about unsafe production
settings. Every variable the code reads is listed in `.env.example`.

## Commands

| | |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npx tsc --noEmit` · `npm run lint` · `npx vitest run` | typecheck · lint · unit/integration tests |
| `npx playwright test` | e2e (`e2e/`, needs a seeded local DB) |
| `npm run db:generate` / `db:migrate` / `db:baseline` | migrations (see `drizzle/`) |
| `npm run worker` | background worker |
| `npm run grant:superadmin -- you@example.com` | make a platform operator |
| `npm run admin:reset-mfa -- you@example.com` | clear a lost operator authenticator |

## Operating notes

- **Platform console** (`/admin`) is for super-admins and needs TOTP two-factor (enrol on first visit).
- **Production checklist:** `NEXTAUTH_SECRET` and a *separate* `EMAIL_SECRET_KEY`; TLS (or private networking)
  for Postgres and Redis; `RAZORPAY_*`; `FACEBOOK_APP_SECRET` + `FACEBOOK_VERIFY_TOKEN`;
  `WATXIO_APP_SECRET` or `WATXIO_VERIFY_TOKEN`; Turnstile keys for public forms; a private R2 bucket;
  `/api/health` as the uptime probe (set `HEALTH_REQUIRE_WORKER=1` to include the worker heartbeat).
- **Deploy:** web on Vercel; worker via `railway.json` → `deploy/Dockerfile.worker` (see `deploy/railway-setup.md`,
  which also covers backups and recovery). CI: `.github/workflows/ci.yml` (typecheck, lint, tests, empty-DB migrate + build).
- **Docs:** see [`docs/README.md`](docs/README.md) for the master documentation directory and topic index; consolidated chapters live in [`docs-consolidated/`](docs-consolidated/) (regenerate via `npm run docs:consolidate`). The latest engineering audit is [`docs/PRODUCTION_AUDIT_2026-10-02.md`](docs/PRODUCTION_AUDIT_2026-10-02.md).

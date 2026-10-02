# Ridhzo runbook

## Health
- `GET /api/health` — DB + Redis. Set `HEALTH_REQUIRE_WORKER=1` to also fail when the worker heartbeat is missing.
- Worker down → webhooks, automations, sequences, score decay stop. Check Railway worker logs; the worker shuts down gracefully on SIGTERM (`closeAllWorkers`).
- Failed outbound webhooks: Settings → Webhooks → failed deliveries (DLQ panel).

## Deploy
1. `npm test && npx tsc --noEmit`, merge to `main` (CI also runs gitleaks and the tenant-isolation integration test).
2. Apply migrations first: `npm run db:migrate` (idempotent; all migrations are safe to re-run).
3. Vercel deploys web; Railway redeploys the worker. Verify `/api/health`.
4. Rollback: Vercel "Instant rollback"; migrations are forward-only — never drop a column in the same release that stops using it.

## Backup / restore
`.github/workflows/db-backup.yml` dumps every 6h to R2 (30 days). Details: [deploy/railway-setup.md](../deploy/railway-setup.md#backups--recovery).
Restore: fetch the dump from R2, `psql "$DATABASE_URL" < dump.sql` into a fresh DB, then `npm run db:migrate`.
You also need `NEXTAUTH_SECRET` and `EMAIL_SECRET_KEY` (+ `_PREVIOUS`) from the password manager, or encrypted secrets are unreadable.

## Secret rotation
- **Encryption key:** set the new `EMAIL_SECRET_KEY`, move the old value to `EMAIL_SECRET_KEY_PREVIOUS`, deploy, run `npm run encrypt:source-secrets` to re-encrypt, then drop `_PREVIOUS`. Set `SECRETS_STRICT=1` once nothing is plaintext.
- **NEXTAUTH_SECRET:** rotating signs everyone out (and invalidates the admin MFA step-up cookie).
- **Webhook/API keys:** revoke from Settings → API; keys also expire and are revoked when their user is removed.

## Operator tasks
- Locked out of platform-admin MFA: `npm run admin:reset-mfa -- <email>`.
- Maintenance mode: toggle in the platform admin; the API returns 503 and writes are blocked.
- Audit logs prune after `AUDIT_RETENTION_DAYS` (default 730, min 90); processed `webhook_events` after 30 days (score-decay worker).

## Troubleshooting
| Symptom | Check |
|---|---|
| Razorpay events ignored | `webhook_events` ledger (keyed on `x-razorpay-event-id`); signature secret; replayed events are no-ops by design |
| WhatsApp inbound not routed | Tenant webhook token URL; inbound routes to the org of the most recent outbound |
| 402 on exports/uploads/messages | Plan limit hit — see usage in the user menu; counters in `usage_counters` |
| Slow Postgres | `DB_POOL_MAX`, prepared statements off behind pgBouncer (see `src/db/index.ts`) |

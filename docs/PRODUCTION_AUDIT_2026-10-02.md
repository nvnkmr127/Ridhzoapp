# Ridhzo — Full Production-Readiness Audit (2026-10-02)

**Mode:** inspect and report only. No application code, schema, config or data was changed. This file is the only thing added.
**Baseline checks run:** `tsc --noEmit` → clean. `vitest run` → 184 files / 860 tests pass, 4 files / 21 tests skipped.

## How to read this report (coverage and honesty)

- **Method:** static tracing of the real code paths — middleware → auth → RBAC → action/route → service → SQL — plus repo-wide pattern scans (every `.update/.delete` without an org filter, every server action's guard, every `/api/v1` route, every webhook, every `fetch(`, secrets scan incl. git history).
- **Not done:** I did not run live cross-tenant attacks against a running instance, did not touch the Railway DB/Redis, did not inspect production env vars, Vercel/Railway dashboards, the mobile app, or the (private) R2 bucket settings. Anything marked **(config-dependent)** needs you to check the real deployment.
- **Read in full:** auth, RBAC, `apiAuth`, mobile JWT, secrets crypto, billing (plan/service/actions/webhook), the generic/Razorpay/WhatsApp/missed-call/Facebook webhooks, attachments/storage, SSRF guard, workers bootstrap, DB client, CI/deploy files, schema for users/leads. **Sampled:** the other 790-ish files — every server action was checked for its guard (script), every `/api/v1` route for `authorizeApiRequest`, every id-based mutation for an org filter. Components were sampled (LeadsTable, DuplicatesManager, destructive-action confirmations, page guards), not read line by line.
- **Prior audits exist** (`docs/WEB_APP_AUDIT_2026-09-28.md`, `PRE_MARKETING_AUDIT_2026-10-01.md`). I did not rely on them; where I found the same thing I say so.
- **Overall tenant-isolation result:** the *service layer* is disciplined (nearly every id-based mutation re-checks org first). The leaks are at the edges: two missing authorization checks, one webhook that cannot know the tenant, and an architecture that depends on every caller remembering the org filter (no RLS).

---

## Remediation status (2026-10-02, later)

- **Critical C1–C2, High H1–H5, H7–H11:** fixed in code (see git history). **H6 was a false finding** — a fresh database migrates cleanly (the table is created by `0018_shared_content`); the orphan duplicate file was removed.
- **Medium M1–M21:** fixed in code, except where noted: M3 makes tenant arguments required in the follow-up, lead-assignment, status and source services but does **not** add Postgres row-level security; M15 adds key expiry and auto-revoke on user removal but not per-key scope lists or plan gating; M16 adds a 3-write cap and audit trail but not a human-confirm step; M17's audit writes remain best-effort; M13 needs `pg_trgm` available on the database (migration 0096 skips the indexes with a notice otherwise).

- **Low L1–L16:** fixed except L14 (signup email enumeration, kept as a deliberate UX trade-off), L16 (`timestamp` → `timestamptz` is a large migration, deferred) and L13 (already handled in code — link-preview bots and the sender are excluded from view counts). The CI dependency audit is report-only for now.

- **F. Incomplete features:** done — webhook DLQ screen, duplicate bulk-status action removed, legacy CSV dialog removed, Razorpay refund (credit note) and failed-payment events, web Calls page, per-tenant WhatsApp accounts with tenant-scoped inbound. **Not built (product decisions):** multi-workspace membership and separate Contacts/Companies entities.

- **G. Missing frontend:** done — failed-webhook screen, read-only lead/list/board states for roles without `leads.edit`, delete and export permission-aware controls, a new `leads.export` permission, plan meters for automations/sequences/sources, and batched import with a progress bar. Export still shows a plain "Exporting…" state (one server call, no incremental progress).

## A. Executive Summary

Ridhzo is a mature, unusually well-commented Next.js 15 / Drizzle / Postgres / BullMQ multi-tenant CRM. Typecheck is clean, 860 tests pass, org scoping in services is consistent, SSRF/webhook-signature/idempotency work has clearly been done with care, and secrets are not committed (`.env*` never appear in git history).

It is **not yet safe to call production-ready for paying multi-tenant traffic.** The reasons are concentrated, and most are small fixes:

1. **Two authentication/authorization holes that are real exploits, not hygiene:** a Firebase-token fallback that can sign anyone in as any phone number (C1), and a bulk-WhatsApp action with *no lead/tenant check* that sends through any tenant's lead (C2).
2. **The `leads.edit` ("Viewer / read-only role") rule is enforced on only about a third of write paths** (H1). The permission model advertises read-only roles; the web backend lets them send WhatsApp/email, edit stage/value, attach files, book meetings, enrol sequences.
3. **Billing safety nets depend on env config** (manual plan switch when Razorpay keys are absent, H3) and **usage limits are check-then-insert and cover only 6 of ~15 metered things** (H4, and Section K).
4. **Infrastructure contradictions:** BullMQ *consumers are instantiated inside the web/serverless process* (H5), the committed migration set **cannot build a fresh database** (H6), and the documented compose stack publishes Postgres/Redis to the internet without TLS (H7).
5. **No MFA anywhere, including on the super-admin that can hard-delete tenants** (H8), and unverified-email signup enables Google account pre-hijack (H2).

Reasonable next step: fix C1, C2, H1–H3, H5, H6 (all ≤ a few days each), then re-run this audit's targeted tests. The *Recommended Fix Order* is in Section R.

**Counts:** 2 Critical · 11 High · 21 Medium · 16 Low.

---

## Feature completion matrix

Legend: ✓ verified in code · ◐ partial / gaps noted · ✗ missing · ? not verified (not read in depth). "Tests" = test files exist for the core logic (not that coverage is adequate).

| Feature | Frontend | Backend | Database | API | Validation | Permissions | Tests | Status | Missing items |
|---|---|---|---|---|---|---|---|---|---|
| Email/password signup & login | ✓ | ✓ | ✓ | n/a (NextAuth) | ◐ min-6 pwd | ✓ rate-limited | ✓ | **Partial** | email verification never enforced (H2); no MFA; no pwd strength rules |
| Google login | ✓ | ✓ | ✓ | n/a | ✓ | ◐ | ✓ | **Partial** | no `email_verified` check; account pre-hijack (H2) |
| Phone/WhatsApp OTP login | ✓ | ✓ | ✓ | v1 + web | ✓ | ◐ | ✓ | **Broken (C1)** | Firebase fallback bypass; no unique constraint on `users.phone` (M7) |
| Leads CRUD / recycle bin / purge | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ (`leads.edit/delete/purge`) | ✓ (57 lead-domain tests) | **Complete** | purge non-transactional (M9) |
| Lead list / search / filters / kanban | ✓ | ✓ | ◐ | ✓ | ✓ | ✓ | ✓ | **Complete** | `ILIKE '%q%'` unindexed (M13); negative `limit` → 500 (L3) |
| CSV import (wizard) | ✓ | ✓ | ✓ | n/a | ✓ | ✓ | ✓ | **Partial** | **two parallel import paths** (`ImportCsvDialog`→`uploadCsvAction` vs `LeadImportWizard`→`import.ts`) with different limits/logic (M14); no audit entry |
| CSV export | ✓ | ✓ | n/a | n/a | ✓ | ◐ | ✗ | **Partial** | any role can export all *visible* leads; no export permission/quota; no tests |
| Custom fields / statuses / pipeline stages | ✓ | ✓ | ✓ | ✓ v1 | ✓ | ✓ | ✓ | **Complete** | status delete has no confirm (L7) |
| Tags | ✓ | ✓ | ✓ | ✓ | ✓ | ◐ (no `leads.edit`) | ✓ | **Partial** | H1 |
| Notes / activities / timeline | ✓ | ✓ | ✓ | ✓ | ✓ | ◐ (delete/update note: no `leads.edit`) | ✓ | **Partial** | no org column on `activities` — tenancy only via lead join |
| Follow-ups / tasks | ✓ | ✓ | ✓ | ✓ | ✓ | ◐ | ✓ | **Partial** | H1; service methods have *optional* `organizationId` (M3) |
| Meetings + public booking | ✓ | ✓ | ✓ | ✓ | ✓ | ◐ | ✓ (1 file) | **Partial** | public booking emails any address with no verification/CAPTCHA (M5); H1 |
| Sequences (drips) | ✓ | ✓ | ✓ | ✓ | ✓ | ◐ (`enrollLeadsAction` no `leads.edit`) | ✓ | **Partial** | no send cap/quota on drips (K) |
| Automations | ✓ | ✓ | ✓ | n/a | ◐ `type` is free string | ✓ | ✓ | **Partial** | "Create" button visible to everyone; `toggle` not plan-gated (M12); action config unvalidated |
| Lead sources: webhook / hosted form | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | **Partial** | no CAPTCHA/spam control (H9); legacy secretless sources unauthenticated (L5); idempotency key global across tenants (M2) |
| Facebook Lead Ads | ✓ | ✓ | ✓ | ✓ | ✓ signature enforced in prod | ✓ | ✓ | **Complete** | default verify-token literal in code (L9) |
| Google Lead Ads | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | **Complete?** (route read only by signature test) | — |
| Lead distribution rules (outbound) | ✓ | ✓ | ✓ | ✓ | ✓ | `api.manage` | ✓ | **Complete** | — |
| Outbound webhooks + DLQ | ◐ | ✓ | ✓ | ✓ | ✓ SSRF guard | ✓ | ✓ | **Partial** | **DLQ list/retry/purge actions have no UI** (`listWebhookDlqAction`, `retryWebhookDlqAction`, `purgeWebhookDlqAction` are never imported); assert-then-fetch DNS rebinding window (M10) |
| API keys + `/api/v1` | ✓ | ✓ | ✓ | ✓ | ✓ | ◐ | ✓ | **Partial** | keys have no expiry, no per-key scope below `full/read_only`, not plan-gated, survive creator's removal (M15) |
| WhatsApp (Watxio) send | ✓ | ✓ | ✓ | ✓ | ✓ | ◐ | ✓ | **Partial** | C2; H1; **single platform-wide account** (no per-tenant credentials) |
| WhatsApp inbound | n/a | ◐ | ◐ | ✓ | ◐ signature optional | n/a | ✓ | **Broken for multi-tenant (H10)** | no tenant resolution; no dedupe by provider id |
| Email send / SMTP per tenant | ✓ | ✓ | ✓ | ✓ | ✓ SSRF-pinned | ✓ | ✓ | **Complete** | — |
| AI (drafts, recap, assistant, agent) | ✓ | ✓ | ✓ | ✓ | ✓ | ◐ (agent: `requireOrg` only) | ◐ | **Partial** | prompt-injection only guarded by prompt text (M16); obscure default model for tool-calling (L12) |
| Insights / analytics | ✓ | ✓ | ✓ | n/a | n/a | ✓ | ✓ | **Partial** | ~20 services pull the whole tenant lead set into Node memory (M12-perf) |
| Billing (Razorpay) | ✓ | ✓ | ✓ | ✓ webhook | ✓ | ✓ `billing.manage` | ✓ (8 files) | **Partial** | H3; webhook has no event-id dedupe; no refund/`payment.failed` handling |
| Usage limits / plan gating | ✓ | ◐ | ◐ | ✓ | n/a | n/a | ✓ | **Partial** | Section K |
| Users / roles / teams | ✓ | ✓ | ✓ | ✓ | ✓ | ◐ | ✓ | **Partial** | `users.manage` can delete/deactivate other admins (M1); no multi-workspace membership |
| Audit log | ✓ | ✓ | ✓ | ✓ | n/a | ✓ | ✓ | **Partial** | many mutations unaudited (M17); best-effort writes |
| Notifications / push / email prefs | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | **Complete** | — |
| Attachments (R2/local) | ✓ | ✓ | ✓ | ✓ | ◐ ext-only | ◐ | ✓ | **Partial** | public-R2 redirect defeats access control (H11); no per-plan storage quota |
| Super-admin console / impersonation | ✓ | ✓ | ✓ | n/a | ✓ | ✓ `requireSuperAdmin` | ✓ (13 files) | **Partial** | no MFA (H8); maintenance mode only enforced in the dashboard layout (M18) |
| Compliance (DSR, retention, tenant delete) | ✓ | ✓ | ✓ | n/a | ✓ | ✓ | ✓ | **Complete?** | redaction updates by leadId without org filter (callers pre-check) |
| Mobile app API | n/a | ✓ | ✓ | ✓ | ✓ | ✓ live role | ✓ | **Partial** | visibility rule differs from web (M6) |
| Contacts / Companies / Customers entities | ✗ | ✗ | ✗ | ✗ | – | – | – | **Not built** | Everything is a lead (documented). If the brief expects separate entities, this is a gap |
| Calls | ◐ | ◐ | ✓ | ✓ sync endpoints | ✓ | ✓ | ? | **Partial** | call sync is mobile-only |
| Documentation | – | – | – | – | – | – | – | **Weak** | Section P |

---

## B. Critical Issues

> Format: **Issue / Location / Current / Expected / Impact / Severity / Root cause / Fix / Files / DB / API / Frontend / Backend / Tests.**

### C1 — Phone-number account takeover via Firebase fallback in `authorizePhoneOtp`
- **Location:** `src/lib/auth.ts:92` (called by NextAuth `phone-otp` provider and by `POST /api/v1/auth/otp/verify`… note: the mobile route passes only `otp`, so the exposure is the **web** `phone-otp` provider, which accepts `idToken`).
- **Current:** `if (!res.phoneNumber || res.phoneNumber === phone) verified = true;` — a *valid* Firebase ID token with **no** `phone_number` claim (anonymous, email/password, Google or custom-provider users of the same Firebase project) is treated as proof that the caller owns whatever `phoneNumber` they typed.
- **Expected:** the token must carry a `phone_number` claim that equals the claimed number (and `sign_in_provider === "phone"`), or the legacy path should be removed — the app already has WhatsApp OTP.
- **Impact:** an attacker mints a Firebase token (the web API key is public: `NEXT_PUBLIC_FIREBASE_API_KEY`) and signs in as any user, any tenant admin, or any super-admin who has a phone number. Also auto-creates workspaces. **Config-dependent:** exploitable if the Firebase project has *any* non-phone sign-in method enabled (anonymous/email/Google). Even if not, it is one config change from catastrophic.
- **Severity:** Critical.
- **Root cause:** `!res.phoneNumber ||` short-circuit written as "no phone in token = fine".
- **Fix:** require `res.phoneNumber && res.phoneNumber === phone` (normalise both to E.164 first); better, delete the Firebase branch and `firebaseTokenVerifier.ts`, plus `NEXT_PUBLIC_FIREBASE_*` if client SMS is retired. Also declare `jose` as a direct dependency (today it is imported but only present transitively via `next-auth`).
- **Files:** `src/lib/auth.ts`, `src/lib/auth/firebaseTokenVerifier.ts`, `package.json`.
- **DB/API/Frontend/Backend:** none / none / remove idToken UI path if any / auth only.
- **Tests:** unit — token without `phone_number` must be rejected; token whose number ≠ claimed number rejected; mock-token path never reachable when `NODE_ENV=production`.

### C2 — `sendCampaignAction` sends WhatsApp to arbitrary leads (cross-tenant IDOR + role bypass)
- **Location:** `src/lib/actions/campaigns.ts:17`, `src/lib/messaging/whatsapp/service.ts:67`, UI `src/components/leads/LeadsTable.tsx:294`.
- **Current:** the action only calls `assertWritable()` (which only blocks read-only impersonation). It loops over client-supplied `leadIds` and calls `WhatsAppService.send({ leadId, body, userId })`. `send()` loads the lead by id **with no organization or ownership check**, looks up *that lead's* org mode, and sends through the platform's single Watxio account. On failure it also writes a note activity onto the lead — again with no check.
- **Expected:** `requirePermission("leads.edit")` + `filterAccessibleLeadIds(leadIds, ctx)` before sending (exactly what `bulkChangeLeadStatusAction` already does). `WhatsAppService.send` should take `organizationId` and refuse a mismatch.
- **Impact:** any signed-in user of *any* tenant — including a Viewer — who learns a lead UUID can send free-form 2000-char messages **to another tenant's lead from the shared platform number**, log them in the victim's timeline, and burn the platform's WhatsApp spend/reputation. UUIDs aren't guessable, but they leak through URLs, shared links, logs, exports, support tickets. Only BSP-mode tenants are affected (`whatsapp_mode` defaults to `personal`) — but that is exactly the tenants paying for it.
- **Severity:** Critical.
- **Root cause:** domain service trusts its caller; the action forgot the access helper that every sibling action uses.
- **Fix:** guard the action as above; add `organizationId` to `SendWhatsAppInput` and `where(and(eq(leads.id), eq(leads.organizationId)))`; same for `ActivityService.addActivity` call sites (it has no org parameter). Add a per-org/per-user send rate limit and daily cap.
- **Files:** `lib/actions/campaigns.ts`, `lib/messaging/whatsapp/service.ts`, `domains/activities/service.ts`, tests.
- **DB/API:** none / none. **Frontend:** hide the bulk-send control for roles without `leads.edit`. **Backend:** above.
- **Tests:** integration — org A user calls the action with org B's lead id → nothing sent, no row written; Viewer role → Forbidden; member only gets their own leads.

---

## C. High Priority Issues

### H1 — `leads.edit` (read-only "Viewer" role) is not enforced on most web write paths
- **Location:** `src/lib/leads/access.ts:45` (`getActionableLead`) and `:56` (`assertLeadAccess`) check *ownership*, never `leads.edit`. Actions that rely on them without `requirePermission("leads.edit")`: `sendWhatsAppAction`, `sendEmailAction`, `logLeadContactAction`, `logLeadReplyAction` (messaging.ts), `createFollowUp/updateFollowUp/complete/reopen/snooze/reschedule/assign/cancel` (follow-ups.ts), `uploadAttachmentAction/addAttachmentAction/deleteAttachmentAction`, `addTagAction/removeTagAction/bulkAddTagAction`, `createMeetingAction/updateMeetingAction/setMeetingOutcomeAction/reopen/checkIn/sendMeetingConfirmationAction`, `enrollLeadsAction`/pause/resume/stop, `createShareAction`, `deleteNoteAction`, `updateNoteAction`, `updateLeadFollowUpAction`, **`updateLeadStageAndValueAction`**, `draftLeadReplyAction`, `summarizeLeadAction`, `dismissAiSuggestionAction`, `runAgentAction` (agent tools call `createFollowUp`, `addTagAction`…).
- **Current:** only 17 call sites enforce `leads.edit`. `src/lib/permissions.ts` states "A read-only Viewer is any custom role created WITHOUT leads.edit; the backend actions now enforce that gate." The mobile API *does* enforce it (`canEditLeads`), so web and mobile disagree.
- **Expected:** one choke-point. Make `getActionableLead`/`assertLeadAccess` take a `{ write: true }` flag that also requires `leads.edit`, or add `requirePermission("leads.edit")` to every mutating action.
- **Impact:** a Viewer can message customers, change pipeline stage/deal value, attach/delete files, book meetings, and drive the AI agent. Privilege model is advisory on the web.
- **Severity:** High. **Root cause:** permission check lives in each action instead of in the shared access helper. **Files:** the actions above + `lib/leads/access.ts`. **API/DB:** none. **Frontend:** hide the buttons for Viewers (today only some are hidden). **Tests:** a table-driven test "for every mutating action, a role without `leads.edit` is refused" (generate the list from `lib/actions/*.ts`).

### H2 — Email verification is never enforced → account pre-hijack through Google sign-in
- **Location:** `lib/actions/auth.ts:43` (`signupAction`), `lib/auth.ts` Google `signIn` callback (~line 253), `allowDangerousEmailAccountLinking` (`:177`).
- **Current:** anyone can register `victim@gmail.com` with their own password; no verification is required to use the app (`emailVerifiedAt` is only read to show a banner). When the real owner later clicks "Sign in with Google", the callback finds the existing row **by email** and signs them into the attacker's account; the attacker still holds the password.
- **Expected:** unverified password accounts must not be linkable by Google sign-in (or Google sign-in must *replace* the password hash/ invalidate sessions of an unverified account); also check `profile.email_verified === true` from Google.
- **Impact:** data the victim then enters is readable by the attacker. **Severity:** High. **Fix:** on Google link of a row where `emailVerifiedAt IS NULL`, reset `passwordHash` to a random hash and revoke sessions (`SessionService.revokeUserSessions`), or require verification before first login. Raise password minimum (currently 6) and add a breached-password check. **Files:** `lib/auth.ts`, `lib/actions/auth.ts`, `lib/auth/emailVerify.ts`. **Tests:** signup(A) → Google(A) must not land in the signup-created session.

### H3 — Free plan upgrade path when Razorpay keys are absent
- **Location:** `lib/actions/billing.ts:71` (`setPlanManuallyAction`), `components/settings/BillingManager.tsx:110`.
- **Current:** any holder of `billing.manage` can set the plan to `unlimited` without payment whenever `isConfigured()` is false. `isConfigured()` is just "are the two env vars set in this process". A missing/typo'd env var on a prod deploy, a preview deploy pointed at the prod DB, or Railway worker env drift opens a free-upgrade path for every tenant admin.
- **Expected:** gate on an explicit `BILLING_TEST_MODE=1` plus `NODE_ENV !== "production"`, or remove from the tenant surface and keep it as a super-admin action (already exists: `setOrgPlanAction`).
- **Severity:** High (config-dependent revenue loss). **Fix:** as above. **Files:** `lib/actions/billing.ts`, `BillingManager.tsx`, `lib/billing/razorpay.ts`. **Tests:** with keys unset and `NODE_ENV=production` the action returns FORBIDDEN.

### H4 — Usage limits are check-then-insert; concurrent requests bypass them
- **Location:** `domains/billing/planService.ts:121,132,~180` (`assertCanAddSeat`, `assertCanAddLead`, `assertCanAdd`), call sites in `domains/leads/service.ts:92`, `lib/leads/ingestion.ts:144`, `domains/invitations/service.ts:42,81`, `sourceService.ts:104`, `actions/automations.ts:38`, `sequenceService.ts:56`.
- **Current:** `SELECT count(*)` → compare → separate `INSERT`. No transaction, lock, or constraint. Two parallel requests (bulk API clients, webhook bursts, the 5-concurrent ingestion worker) each see `current < max`. The ingestion worker makes this realistic: free plan (300 leads) can be overshot by `concurrency` per burst.
- **Expected:** enforce atomically (advisory lock per org around count+insert, or `INSERT … SELECT … WHERE (SELECT count(*)…) < max`).
- **Severity:** High (billing correctness). Details and the rest of the metering gaps: **Section K**.

### H5 — BullMQ *consumers* are created inside the web process (and so inside Vercel lambdas)
- **Location:** `lib/jobs/workers/ingestionWorker.ts:27` and `automationWorker.ts:25` call `new Worker(…)` **at module load**. They are imported by web code: `app/api/webhooks/[provider]/route.ts`, `lib/actions/csv.ts`, `domains/leads/iframePostMessageWorker.ts`, and `lib/events/handlers.ts` — which `instrumentation.ts:12` imports unconditionally (before the `if (!process.env.VERCEL)` guard that the comments claim keeps workers out of serverless).
- **Current:** every lambda cold start that touches a webhook, CSV upload or event handler becomes a queue consumer.
- **Impact:** lead-ingestion and automation jobs are taken by processes that get frozen/killed right after the HTTP response → stalled jobs, duplicate executions (stall re-delivery), double WhatsApp sends from automations, extra Redis connections per instance. The "droplet-only workers" design in the comments is not what the code does.
- **Severity:** High (reliability/duplicates). **Fix:** split each file into `queue.ts` (producer, safe to import anywhere) and `worker.ts` (consumer, imported only by `startWorkers`). **Tests:** `import` the web entrypoints under `VERCEL=1` and assert `Worker` is never constructed.

### H6 — The migration set cannot build a fresh database
- **Location:** `drizzle/0018_device_tokens.sql` exists but is **not in `drizzle/meta/_journal.json`** (journal has 94 entries, disk has 95 `.sql`; prefix `0018` is duplicated). `0027_device_token_widen.sql` does `ALTER TABLE "device_tokens"`.
- **Current:** `drizzle-kit migrate` on an empty database never creates `device_tokens`, then fails at 0027. Static analysis only — I did not execute it. The CI job `migrations` ("Apply every migration to an empty database") should therefore be red; check its status. Additionally snapshots stop at `0087_snapshot.json` while the journal runs to 0093, so the next `db:generate` will re-emit changes already made by hand.
- **Impact:** new environments (staging, DR rebuild, new dev) cannot be created from the repo. Backups are `pg_restore` based so DR from backup is unaffected.
- **Severity:** High. **Fix:** add 0018_device_tokens to the journal in correct order (or fold into 0019), regenerate missing snapshots. **Tests:** CI "empty DB → migrate → schema diff = none" must fail on drift.

### H7 — Documented production stack exposes Postgres and Redis to the internet without TLS
- **Location:** `deploy/docker-compose.yml` (ports 5432/6379 published; `?sslmode=disable`; password-only). The file itself calls this a `ponytail` shortcut.
- **Current vs expected:** `.env` shows the real deployment now uses Railway proxy hosts, but the repo still ships and documents the droplet topology, and `README`/`deploy/` do not say which is canonical. Railway TCP proxies are also public endpoints.
- **Impact:** if the compose stack is (or ever was) used: DB and queue credentials cross the internet in clear text; Redis compromise = arbitrary job injection (BullMQ executes jobs against production data).
- **Severity:** High (config-dependent). **Fix:** TLS on both, private networking or IP allow-list, delete the unused topology from the repo/docs. Confirm `DATABASE_URL`/`REDIS_URL` in production use TLS (`rediss://`, `sslmode=require`).

### H8 — No MFA anywhere; super-admin is a single-factor "delete every tenant" account
- **Location:** `lib/actions/platform.ts` (e.g. `hardDeleteTenantAction`, `impersonateOrgAction`, `exportTenantDossierAction`, `toggleSuperAdminAction`), `lib/auth.ts`.
- **Current:** password (or Google, or a WhatsApp code) alone yields a session whose `isSuperAdmin` is re-read every 60 s. Impersonation is audit-logged and has a read-only mode (good), but there is no step-up/MFA, no IP allow-list, no session binding.
- **Severity:** High. **Fix:** TOTP/WebAuthn for super-admins at minimum (step-up before destructive platform actions), then offer it to all admins.

### H9 — No bot/spam protection on public lead capture, so an attacker can exhaust any tenant's lead quota
- **Location:** `lib/actions/publicLead.ts`, `app/api/webhooks/[provider]/route.ts`, `lib/actions/booking.ts`.
- **Current:** per-IP (10/min) and per-source (200/min) limits only; IP is the leftmost `X-Forwarded-For` (spoofable off-Vercel, see M4). No CAPTCHA, honeypot, or per-org daily cap. Each accepted submission consumes a lead of the plan quota (Free = 300).
- **Impact:** a competitor floods a hosted-form URL (the sourceId is public by design) at ~200 leads/min; Free/Starter tenants hit their cap and legitimate leads are rejected; storage/notification/automation costs scale with the flood. Same for `webhookEvents` rows (no retention found for processed events).
- **Severity:** High. **Fix:** Turnstile/hCaptcha on hosted forms and booking, honeypot field, per-org hourly ceiling and "pause source" alert, retention job for `webhook_events`.

### H10 — WhatsApp inbound webhook cannot resolve the tenant and the signature check is optional
- **Location:** `app/api/webhooks/whatsapp/route.ts:28`, `lib/messaging/whatsapp/service.ts:150`.
- **Current:** `recordInbound` matches by phone digits across **all tenants** (`organizationId` is never passed from the route) with `.limit(1)` and no ordering; includes soft-deleted leads. A phone that is a lead in two workspaces gets the reply, the AI intent-tagging and the "stop my sequence" side-effect applied to an arbitrary one. Signature verification is skipped when `WATXIO_APP_SECRET` is unset (the local `.env` doesn't define it; production unknown). No dedupe on `providerMessageId`; the `regexp_replace(...)` predicate can't use the phone index, so each inbound message scans every tenant's leads.
- **Impact:** wrong-tenant data attribution (privacy), forged inbound messages when the secret is unset, duplicate messages on provider retries, load. Prior audit flagged the same item as still open.
- **Severity:** High. **Fix:** resolve tenant from the *outbound* thread (`whatsapp_messages` by recipient + most recent outbound) or per-tenant numbers; fail closed in production when the secret is missing; unique index on `(provider_message_id)`; indexed normalised phone column.

### H11 — "Private" attachments become public when `R2_PUBLIC_URL` is set
- **Location:** `app/api/attachments/[id]/route.ts:48`, `lib/storage/attachments.ts` (header comment: "Never public … Keep the bucket private").
- **Current:** after authenticating the viewer the route 302-redirects to `${R2_PUBLIC_URL}/${objectKey}`, so the object must be publicly readable, and the redirect target needs no auth, no `nosniff`, no sandbox CSP, and stays valid forever. `.env.local` sets `R2_PUBLIC_URL`. Keys are `attachments/<orgId>/<uuid>.<ext>` — unguessable but a leaked URL never expires, and tenant revocation (user removed, lead purged-but-CDN-cached) can't be enforced.
- **Severity:** High (config-dependent). **Fix:** remove the shortcut or use short-lived presigned GET URLs; keep bucket private.

### (Also High) M-tier items promoted by blast radius
See **M1** (a `users.manage` holder can disable/delete workspace admins) and **M16** (AI agent has write tools driven by lead-controlled text).

---

## D. Medium Priority Issues

| # | Issue | Location | Current → Expected | Impact | Fix | Tests |
|---|---|---|---|---|---|---|
| M1 | Privilege escalation inside a tenant | `lib/actions/users.ts` `setUserActiveAction/deleteUserAction/setUserRoleAction`; `domains/users/service.ts:235` | Any role with `users.manage` can deactivate, delete or demote *any* user incl. admins; only the *last* admin is protected → a "HR" role can lock out the owner and then re-role itself via roles it can assign | Account lock-out / takeover of the workspace | Compare target's granted permissions with the caller's (reuse `roleAssignmentError` logic on the target's role); owner flag | role matrix tests |
| M2 | Webhook idempotency key is global, not per tenant | `app/api/webhooks/[provider]/route.ts:136,170` unique on `(provider, idempotency_key)` | Tenant A can pre-claim keys that B's sender will use → B's lead silently dropped as "duplicate", and A learns `eventId` | Cross-tenant interference | scope uniqueness by `organizationId` (put org into the key / unique index) | two-tenant same-key test |
| M3 | Tenant scoping is optional in service signatures | `follow-ups/service.ts` (all methods `organizationId?`), `assignmentService`, `LeadService.assignLead/changeStatus`, `sourceService` | Omit the arg and the query silently becomes unscoped (e.g. `assignmentService.ts:~245` `whereCondition = organizationId ? … : eq(leads.id, leadId)`) | A future caller bug = cross-tenant write; there is **no RLS** as a backstop | make `organizationId` required; add Postgres RLS (`SET app.org_id`) as defence in depth | lint rule / type tests |
| M4 | Client-IP rate limits trust the leftmost `X-Forwarded-For` | `lib/clientIp.ts`, `lib/auth.ts` login, `actions/auth.ts` (signup/reset/OTP), webhooks use the *whole* header (`[provider]/route.ts:73`) | Spoofable unless the edge overwrites the header; inconsistent between files | Brute-force/OTP-cost/spam throttles can be dodged (login also has a per-email limit, which still holds) | one `clientIp()` honouring the platform's trusted header (`x-vercel-forwarded-for` / `cf-connecting-ip`), use it everywhere | unit |
| M5 | Public booking/OTP can email/WhatsApp arbitrary third parties | `actions/booking.ts`, `sendWhatsAppOtpAction` | no CAPTCHA, only per-slug (15/min) | spam relay & WhatsApp OTP cost drain | CAPTCHA + per-IP + per-destination limits | — |
| M6 | Web and mobile disagree on which leads a rep may see | web: owner **or** attends a meeting **or** has a follow-up (`lib/leads/access.ts`); v1: `app/api/v1/leads/route.ts:47` and `changesFeed` use `ownerId = me` only | A lead the user can open on web is missing from (or marked `gone` in) the phone | Data appears/disappears between clients | use `visibleToUserSql` in list + sync feed | parity test |
| M7 | `users.phone` has no unique constraint; phone ownership never verified when an admin adds a user | `db/schema/users.ts`; `UserService.create`; `authorizePhoneOtp` `.limit(1)` | duplicate phones possible (race); OTP login picks an arbitrary row; the check at `domains/users/service.ts` uses `'\D'` (JS template → `'D'`) instead of `'\\D'` so formatting differences defeat it | A tenant admin can register someone else's number and the real owner's OTP login lands in the admin's tenant | partial unique index on normalised phone; fix regex; require OTP when linking | race test |
| M8 | Unlimited sessions after password change | `actions/account.ts:changePasswordAction` | only *reset* revokes sessions | stolen session survives a password change | call `SessionService.revokeUserSessions` | — |
| M9 | Lead purge/hard delete is non-transactional and unbounded | `domains/leads/service.ts:746` | 9 sequential deletes + R2 deletes *before* the lead row; `inArray` of all ids (`emptyRecycleBin`, `purgeExpired` across all orgs → Postgres 65 535-parameter limit) | half-purged leads, orphaned/missing files, job fails once a tenant has ~30k deleted leads | wrap in tx, chunk by 1 000, delete files after commit | — |
| M10 | SSRF checks are assert-then-fetch (DNS-rebinding window) in two places | `leadWebhookEventService.ts:60`, `lib/actions/aiContext.ts:188`; `pinnedPost` exists but is used only by enrichment/SMTP; IPv6 blocklist omits `::ffff:7f00:1` hex form, `64:ff9b::/96`, `fec0::` | rebinding host can pass the check then hit an internal IP | SSRF to internal services/metadata | use `pinnedPost`-style connect-to-validated-IP everywhere; complete the IPv6 list | extend `ssrf.test.ts` |
| M11 | Razorpay webhook has no event-id dedupe and a thin event set | `domains/billing/service.ts:234` | relies on period comparison; `activate()` is also re-run on retries and calls `CouponService.redeem` each time (`:201`, error swallowed) → coupon redemption counted repeatedly; no `payment.failed`/refund handling; `activate` accepts a subscription with **no** `notes.organizationId` (`:160`) | double coupon burn, missed dunning | persist processed `x-razorpay-event-id`; require the org note | replay test |
| M12 | Automations: create button visible to all; `toggle` not plan/feature-gated; free-form action `type` and `config` | `automations/page.tsx`, `actions/automations.ts:~150`, `automationSchema` | a downgraded tenant can re-enable automations (only `runnableIds` caps execution); unknown action types stored | confusing 'Forbidden' for viewers, config injection | gate UI by permission; allow-list action types via `lib/automation/schema.ts` | — |
| M13 | Unindexed substring search | `leadSearchCondition` (`ILIKE '%q%'`); `searchUniversalAction` (unescaped `%`/`_`) | seq-scan within a tenant; wildcards not escaped | slow on 100k+ leads | `pg_trgm` GIN index; escape LIKE metacharacters | — |
| M14 | Two CSV import implementations | `components/leads/ImportCsvDialog.tsx`→`actions/csv.ts` (1 MB/5 000 rows, via ingestion queue, per-lead limit check in worker → silent failures) vs wizard → `domains/leads/importService.ts` | inconsistent limits/dup-detection/audit; legacy path can't report plan-limit failures | remove legacy dialog, add audit entry + progress for large files | import e2e |
| M15 | API keys: no expiry, no scopes below read/write, no per-key rate-limit setting, created-by user removal doesn't revoke | `domains/apiKeys/service.ts`, `lib/apiAuth.ts` | long-lived full-access bearer tokens; 600 req/min fixed | leaked key = persistent access | optional expiry, per-key scope list, auto-revoke with creator, plan gating | — |
| M16 | AI agent: write tools driven by untrusted lead text | `lib/ai/agent.ts` (change status, assign, tag, reminders, meetings) | only the system prompt says "ONLY when the user asks"; lead notes/messages are in context | a hostile lead message can induce reassignments/status changes (reversible but noisy) | human-confirm step for writes (like `propose_message`), per-run write cap, log tool calls | adversarial prompt tests |
| M17 | Audit-log gaps | `AuditService.log` is best-effort and called from ~28 files | not audited: lead create/update/assign/status/bulk assign, CSV import, source create/update/delete/FB connect, webhook endpoint create/delete/toggle, API-key revoke/delete, distribution rules, tenant integrations (CAPI/enrichment), custom statuses, logout, failed login, role *permissions* diffs | weak forensics | add a `withAudit` wrapper to mutating actions; store before/after for settings | — |
| M18 | Maintenance mode is only enforced in the dashboard layout | `app/(dashboard)/layout.tsx:44` | server actions, `/api/v1`, webhooks and public forms keep running | writes during maintenance | check in `authorizeApiRequest`, `requireOrg`, ingestion | — |
| M19 | DB pool sized for long-lived servers, not Fluid/serverless | `db/index.ts:28` (`max: 20`, prepared statements on) | N lambda instances × 20 connections against a Railway Postgres; `prepare: true` breaks behind a transaction-mode pooler | connection exhaustion under load | lower `max` on Vercel, add pgbouncer/Hyperdrive, set `prepare:false` if pooled | load test |
| M20 | Same key encrypts everything and signs JWTs | `lib/crypto/secret.ts` falls back to `NEXTAUTH_SECRET`; SHA-256, no KDF/versioning | rotating one secret bricks SMTP creds/Meta tokens/webhook secrets and logs everyone out; no key id in ciphertext | operational risk | require `EMAIL_SECRET_KEY` in prod (validateEnv), add key version prefix | rotation test |
| M21 | Worker has no graceful shutdown / health | `src/worker.ts:24` `process.exit(0)` on SIGTERM; `numReplicas: 1`; `/api/health` doesn't check workers/queue depth | in-flight jobs aborted; invisible worker death | duplicate/lost jobs on deploy | `worker.close()` on signal; queue-depth + last-heartbeat on health | — |

---

## E. Low Priority Issues

| # | Issue | Location | Fix |
|---|---|---|---|
| L1 | README is the create-next-app boilerplate | `README.md` | write a real one (Section P) |
| L2 | `/api/health` creates a new Redis client per call and leaks it if `ping` throws before `disconnect()` | `app/api/health/route.ts` | reuse client / `finally` |
| L3 | Negative `limit` → `.limit(-5)` → SQL error 500 | `app/api/v1/leads/route.ts:20` (and similar) | clamp `Math.max(1, …)` |
| L4 | Dev-login defaults (`admin@acme.com` / `password123`) compiled into the login bundle, guarded only by `NODE_ENV==="development"`; seed script writes that user; `.env` DB points at a Railway proxy host so `db:seed` from a laptop would seed that DB | `app/(auth)/login/page.tsx:25`, `db/seed.ts` | refuse seeding unless host is local; drop client-side defaults |
| L5 | Webhook sources with a NULL/legacy secret accept unauthenticated posts | `[provider]/route.ts:107` (`if (secret)`) | backfill secrets, then require |
| L6 | `unsubscribe` token has no expiry and shares `NEXTAUTH_SECRET` | `lib/mail/unsubscribe.ts:20` | purpose-derived key (already done for mobile codes) |
| L7 | No confirmation dialog on: delete attachment, delete template, delete custom status, **merge duplicates (hard delete)** | `LeadAttachmentsTab`, `TemplatesManager`, `StatusManagementModal`, `DuplicatesManager` | use `ui/confirm-dialog` |
| L8 | Misleading error message: UI `catch` shows "We couldn't reach the server" when the action actually threw `Forbidden` (`requirePermission` is called outside the action's try/catch in most actions) | e.g. `LeadsTable.tsx:300` | make `requirePermission` failures return `fail("FORBIDDEN")` consistently |
| L9 | Hard-coded fallback verify token | `webhooks/facebook/route.ts:21` | require env |
| L10 | `revalidatePath("/templates")` points at a route that doesn't exist (it's `/settings/templates`) | `lib/actions/messaging.ts` | fix path |
| L11 | Unused dependencies `@anthropic-ai/sdk`, `zustand`; `ANTHROPIC_API_KEY` still in `.env.example`; stale "Stripe" comment | `package.json`, `.env.example`, `planService.ts:7` | remove |
| L12 | Default AI model `inclusionai/ling-3.1-flash` is used for **tool-calling** and processes lead PII via the AI Gateway | `lib/ai/agent.ts:44`, `.env` | pick a tool-capable model; confirm gateway ZDR/DPA; list sub-processors in the privacy page |
| L13 | Public shared-link view counter is bumped by link previews/bots (false "read receipts") | `contentSharingService.openPage` | ignore known bot UAs / HEAD |
| L14 | Signup distinguishes "email already registered" (user enumeration) | `actions/auth.ts:~96` | acceptable trade-off; document |
| L15 | CI uses Node 20 while the worker image uses Node 22; E2E suite exists but is never run in CI; no `npm audit`/secret-scan step | `.github/workflows/ci.yml` | align, add |
| L16 | `timestamp` columns are all `without time zone` with custom UTC parse/serialise; works but any raw SQL with `now()` in a non-UTC session would silently skew | `db/index.ts`, schema | consider `timestamptz` long-term |

---

## F. Incomplete Features
- **Outbound webhook DLQ** — backend list/retry/purge exist; tenants have no UI to see or retry failed deliveries.
- **Legacy CSV dialog** coexists with the new import wizard.
- **`bulkUpdateLeadStatusAction`** (customStatuses.ts) duplicates `bulkChangeLeadStatusAction` and is never called.
- **WhatsApp inbound** works only for a single-tenant world (H10).
- **Per-tenant WhatsApp credentials** — one platform Watxio account serves all tenants.
- **Multi-workspace membership** — `users.email` is globally unique and one org per user.
- **Calls** — only mobile sync, no web surface.
- **Contacts/Companies/Customers** as separate entities (everything is a lead).
- **Refunds / failed-payment events** from Razorpay are not reconciled beyond halted/cancelled.

## G. Missing Frontend
- DLQ management screen (above).
- Permission-aware hiding: Automations "Create", bulk WhatsApp control, Viewer-only states on lead actions.
- Confirmations (L7).
- Usage/limit indicators for sources, automations, sequences, storage, messages (only seats/leads/AI credits are surfaced).
- Export-permission UI; progress UI for large imports/exports.
- No dedicated React Query/Zustand layer despite docs mentioning it: data flows via server components + `router.refresh()`; there is no client cache, optimistic-update or rollback mechanism to audit. Several screens (`DuplicatesManager`) do optimistic local updates after success only, which is safe.

## H. Missing Backend
- Atomic limit enforcement (H4); message/storage/export/import/API metering (K).
- Webhook event ledger for Razorpay; tenant-aware WhatsApp inbound.
- MFA / step-up auth; email-verification gate; API-key expiry/scopes.
- Central audit wrapper; retention for `webhook_events`, `automation_runs` (exists), `api_idempotency_keys` (exists).
- Maintenance-mode enforcement outside the layout.
- Per-user/per-org send rate limits for WhatsApp and email.
- Postgres RLS.

## I. Missing Business Logic
- `leads.edit` gate on web write paths (H1); `users.manage` target-privilege check (M1).
- Downgrade handling: automations/sequences are *paused* via `runnableIds`; **sources, seats and leads over the new cap are not** (a downgraded tenant keeps all of them and can keep ingesting up to the existing count).
- AI credits reset on the **UTC calendar month** (`currentPeriod`), not on the subscription's billing period — a customer who subscribes on the 20th gets a reset 10 days later.
- Restored leads re-check the lead cap (good), but bulk restore/purge-undo paths and *merge* don't re-count.
- Two sources of truth for "who can see a lead" (M6) and for "what is an admin": `isAdmin()` = role name `admin`, `canSeeAll` = `settings.manage`, last-admin check = `users.manage`/`*`.
- `PlanService.plan()` swallows every DB error and returns `"free"` — a transient DB error silently downgrades a paying tenant's limits for that request (fail-closed but invisible; also hides outages).

## J. Tenant Isolation Findings
Verified safe (spot-checked end-to-end): automations CRUD, sequences update, DLQ retry, custom-field update, follow-up delete, tags, attachments (web + v1 + mobile signed link), imports (owner/source/team re-validated), API-key revoke/delete, API v1 lead routes (`leadForApi`), notifications (scoped by `userId`), idempotency (scoped by org), webhook ingestion (`organizationId` from the source row, never from payload), Facebook ingestion (fans out per org), missed-call webhook (org mandatory), Razorpay webhook (org from stored subscription id), impersonation (super-admin only, cookie ignored otherwise).

Findings:
1. **C2** cross-tenant WhatsApp send + timeline write by lead id.
2. **H10** inbound WhatsApp matched across all tenants.
3. **M2** global webhook idempotency namespace.
4. **M3** optional `organizationId` parameters (+ no RLS) — latent.
5. `ActivityService.addActivity` and `WhatsAppService.listForLead` take only a `leadId`; safe today only because every caller pre-validates.
6. Many id-keyed `update/delete` statements have no org predicate (≈100 flagged by script); I traced the high-risk ones and found a prior scoped lookup each time, but the *pattern* is the risk (see M3).
7. Tenant columns that are nullable "backfilled": `users.organization_id`, `teams.organization_id`, `lead_sources.organization_id`; `assignment_rules` has no tenant column at all.
8. **Config-dependent:** public R2 bucket (H11).
9. Missed-call and WhatsApp share one platform-wide provider account, so *provider-side* isolation (number, templates, quality rating) is shared across tenants.

## K. Usage Limit Findings
Enforced (backend): seats (users+open invites), leads (incl. import batch, restore, ingestion, API), automations, sequences, sources, AI credits. Enforced in the right layer (service), not just the UI.

Problems:
1. **Race conditions (H4)** — all of the above are count-then-insert.
2. **Not metered at all:** WhatsApp/email messages (drips, automations, campaigns, OTP), storage/attachments (25 MB per file, unlimited count), exports, imports (per batch only), API requests (600/min flat, no monthly quota), meetings, outbound webhooks, API keys, saved views, custom fields, custom statuses, teams, enrichment calls, notifications.
3. **Billing period:** AI credits use UTC calendar month, not the subscription period (I).
4. **Downgrade:** only automations/sequences are paused; seats/sources/leads over cap persist (I).
5. **Failure refunds:** credits are refunded on failure in `leadAssist`, `aiContext` and `ai.ts`; the one consumer I found with no refund path is `lib/actions/agent.ts:25` (a failed or fallback agent turn still costs a credit).
6. **Seat counting:** includes deactivated (not deleted) users, and open invites; consistent, but `seat_overrides` (platform config) can silently differ from `PLAN_LIMITS` shown in the UI.
7. **Frontend vs backend:** UI shows seats/leads/AI only; the backend enforces sources/automations/sequences too, so users hit errors without a meter. (The reverse — a frontend-only limit — was **not** found.)
8. `plan()` returns `"free"` on DB errors (I).
9. Direct API: `POST /api/v1/leads` does enforce the lead cap; API-key requests are not plan-gated at all (a Free tenant gets full API).

## L. API and Integration Findings
- **Razorpay:** signature verified with raw body, constant-time; stale-event drop is good. Gaps: M11, no event-id ledger, no refund/payment-failed events, `setPlanManuallyAction` fallback (H3).
- **Facebook Lead Ads:** signature mandatory in production, per-org fan-out, token refresh service, "needs reconnect" flow, replay of auth-failed events — solid. Tokens are read through `readSecret` which tolerates legacy plaintext; run `encrypt:source-secrets` and then make `readSecret` strict.
- **Google Calendar:** OAuth `state` is HMAC-bound to the user (verified in callback); tokens encrypted; disconnect deletes credentials. Refresh failures are swallowed in places — not traced end-to-end.
- **Generic webhook/hosted form:** secret via `?key=` (ends up in access logs) or HMAC; idempotency per (provider,key) (M2); no payload size cap (App Router reads the whole body); events stored with full PII and no retention found.
- **WhatsApp (Watxio):** H10, C2; single shared account; `X-Idempotency-Key` used on sends (good); no timeout on `fetch` in `client.ts` (a hung provider ties up the lambda/worker); response not schema-validated.
- **Outbound webhooks:** HMAC signing, retries, SSRF guard, DLQ — good; M10.
- **AI Gateway:** no `AbortSignal`/timeout verified on `generateText`; model hard-coded fallback.
- **Resend/SMTP:** tenant SMTP is SSRF-pinned (good).
- **External responses are mostly cast, not validated** (`as any`, `res.json() as T`) — Razorpay, Graph, Watxio, Google.
- **OAuth lifecycle matrix** (connect → store → refresh → disconnect → reconnect → delete): complete for Facebook and Google; Meta CAPI/enrichment tokens are per-tenant encrypted with disconnect actions; no dangling-credential cleanup on user deletion for `google_credentials` outside tenant hard-delete.

## M. Database Findings
- **H6** migration journal gap; snapshots stop at 0087.
- Tenant-key columns nullable/backfilled: `users`, `teams`, `lead_sources`; none on `activities`, `follow_ups`, `reminders`, `whatsapp_messages`, `assignment_rules`, `automation_*` children → every access needs a join; RLS impossible without adding them.
- `users.phone` not unique (M7); `users.email` global unique (design limit).
- `leads(email)` unique index is case-sensitive while dedupe matches `lower(email)` → `A@x.com` and `a@x.com` can coexist.
- Missing/unsuitable indexes: normalised phone (`regexp_replace` in inbound webhook and login — seq scans), trigram for search, `webhook_events(status, created_at)` for the pending sweeper (not verified), `whatsapp_messages.provider_message_id` unique.
- Inconsistent types: `lead_sources.is_active` is integer while others are boolean; `organizations.cancel_at_period_end`, `complimentary` are integers.
- FK cascade design is mixed: some tables cascade on lead delete, others (`activities`, `follow_ups`, `lead_attachments`, `notifications`, `whatsapp_messages`, `lead_status_history`) don't, which is why `hardDeleteLeads` hand-deletes (M9).
- `timestamp` without TZ throughout (L16).
- 63 of 95 migrations lack `IF [NOT] EXISTS` guards (fine for ordered migrate, bad for the `db:baseline` workflow they also support).
- Pool/prepared-statement settings vs serverless (M19).
- Audit table `audit_logs` has no retention/archival and no append-only protection.
- Seed script creates a deterministic admin with `password123`.

## N. Performance Findings (top expensive operations)
1. **Insights page:** ~20 analytics services (`revenueForecast`, `winLoss`, `pipelineAging`, `ltv`, `cohort`, `geo`, `teamPerformance`, `sourceRoi`, `qualificationMatrix`, `engagementHealth/Velocity`, `stageStagnation`, …) each load every lead (and for velocity, every activity/status-history row) of the tenant into Node and aggregate in JS. A shared `tenantLeads` fetch and a cached snapshot soften it, but the Unlimited plan has **no lead cap**. Move to SQL aggregation / materialised daily rollups.
2. **WhatsApp inbound / phone login:** `regexp_replace(phone)` predicate = full scan (cross-tenant for inbound).
3. **Lead search:** unindexed `ILIKE '%…%'` (M13).
4. **Mobile sync feed:** reads `pg_stat_activity` in every call to compute a horizon (`v1/leads/route.ts`), needs superuser-ish visibility and is slow on busy DBs.
5. **Bulk status change** loops per lead (N+1) up to `MAX_BULK`; `bulkAssign`, CSV export of 10 000 rows run in one request.
6. **Hard purge / `purgeExpired`:** unbounded IN lists (M9).
7. **Per-request layout cost:** the dashboard layout runs ~8 queries per render and again on every `router.refresh()`; `requireOrg` adds an org-suspension read per call (memoised per request).
8. **Connection pool/prepared statements** (M19).
9. **Duplicate work in serverless:** consumers per lambda (H5).
10. 37 `console.log/debug` calls outside scripts; 217 `any` casts; 118 `.catch(() => {})` swallow patterns (some intentional).
- Caching: 17 uses of `unstable_cache`/tags; per-process role cache (15 s) and user cache (60 s) with a Redis mirror — OK, but "evict on role change" only clears the instance that handled the change (other instances up to 60 s stale).
- Pagination: list screens and API v1 are paginated; exports capped at 10 000; some admin/DLQ lists use hard `limit(500)` without paging.

## O. Security Findings
Strengths: passwords bcrypt; JWT sessions re-checked against DB every 60 s with revoke support; suspended orgs locked out; HMAC-verified Razorpay/Facebook/Meta webhooks; constant-time compares; SSRF guard + pinned connect for tenant SMTP/enrichment; attachment allow-list + sandbox CSP + `nosniff`; formula-safe CSV; open-redirect checks on `callbackUrl`; no `dangerouslySetInnerHTML`; `.env*` ignored and absent from git history; no secrets found in tracked files (scan covered common key patterns and PEM headers); source maps/DB query debug logging disabled in production; rate limiting with Redis and in-memory fallback.

Findings (cross-referenced): **C1, C2, H1, H2, H3, H7, H8, H9, H10, H11**, M1, M2, M4, M5, M7, M8, M10, M16, M20, L4–L6, L9, L13. Additional:
- **Security headers:** `nosniff`, HSTS, Referrer-Policy, frame-ancestors present; **no CSP `script-src`** (only `frame-ancestors`) and no CSRF token beyond Next's built-in Origin check for server actions; `serverActions.bodySizeLimit: "25mb"` applies to every action (DoS surface) while per-action limits vary.
- **CORS:** no CORS config for `/api/v1` (fine for native/server clients; browser integrations won't work).
- **Cookies:** NextAuth defaults; `NEXTAUTH_URL` must be https in prod for `Secure` cookies — not validated by `validateEnv`.
- **Mobile JWT:** HS256, 30-day, revocation by jti, live role re-read — good; refresh endpoint re-issues for any valid token (no rotation/replay detection).
- **Account enumeration:** signup (L14); login is generic.
- **File upload:** extension-only type check (no magic-byte sniff), entire file buffered in memory, `zip`/`mp4` allowed.
- **Secret handling:** SMTP/Meta/webhook secrets encrypted at rest (AES-GCM); the reveal action is audited (good); key hygiene M20.
- **Local dev points at a Railway proxy DB** (`.env`): a developer machine has a production-grade credential; confirm it is a dev database.

## P. Documentation Findings
- `README.md`: unmodified create-next-app text; no setup, env, architecture, deploy or runbook.
- `docs/` (≈9.8k lines) and `docs-consolidated/` (≈12.2k lines) **duplicate each other** — guaranteed drift. No single source of truth.
- Five docs describe React Query/Zustand-style client state; the code has neither (Server Components + actions). `zustand` is a dependency but unused.
- Two incompatible deployment stories: DigitalOcean droplet + docker-compose (`deploy/docker-compose.yml`, `instrumentation.ts` comments) vs Railway worker + Vercel (`railway.json`, `deploy/railway-setup.md`, `.env`). `railway.json` builds `Dockerfile.worker` only; the web deployment config isn't in the repo.
- `.env.example` lacks ~40 variables the code reads (`AI_GATEWAY_API_KEY`, `AI_MODEL`, `AI_AGENT_MODEL`, `R2_*`, `META_CAPI_*`, `GST_SUPPLIER_*`, `MAIL_DOMAIN`, `WATXIO_OTP_TEMPLATE`, `RAZORPAY_PLAN_PRO/BUSINESS`, `FIREBASE_SERVICE_ACCOUNT`, `WORDPRESS_ORIGIN`, …) and still lists `ANTHROPIC_API_KEY`. `validateEnv` requires only `DATABASE_URL` and `NEXTAUTH_SECRET`.
- No OpenAPI/API reference for `/api/v1` beyond `docs/SETTINGS_API_ACCESS.md`; no webhook payload reference for outbound events beyond the settings doc; no DB/ER documentation; no incident/backup-restore runbook beyond `railway-setup.md`.
- Docs and code disagree on permissions ("backend actions now enforce [leads.edit]", H1) and on workers ("droplet only", H5).
- Prior audit files record status updates but not the current state of items still open (WhatsApp inbound, pooler).

## Q. Testing Gaps
Present and good: auth, rate-limit, idempotency, billing (8 files), SSRF, signature verifiers, leads domain (57 files), webhook route tests (generic, Facebook, Google), v1 lead/meeting routes.

Missing or thin (priority order):
1. **Authorization matrix test** — every server action × role (admin, member, Viewer, other-tenant user, super-admin read-only). Would have caught C2 and H1.
2. **Tenant isolation tests** — `e2e/tenant-isolation.spec.ts` is 22 lines and only checks a list renders. Need API-level A-vs-B tests for each id-taking route and action (incl. campaigns, WhatsApp inbound, attachments).
3. **Usage-limit concurrency tests** (parallel inserts at cap) and downgrade tests.
4. **WhatsApp**: inbound routing, status ordering, signature-missing behaviour; Razorpay replay/out-of-order events and coupon double-redeem.
5. **Fresh-DB migration + schema-drift test** (H6); CI result for the `migrations` job.
6. **Worker bootstrap test** that web entrypoints don't construct consumers (H5).
7. Action files with **no test file**: agent, aiContext, apiKeys, attachments, audit, automations, billing, booking, campaigns, csv, customFields, dedup, exportLeads, follow-ups, import, integrations, invitations, leadDistribution, meetings, notifications, organizations, platform (partial), publicLead, roles, savedViews, sequences, sharedContent, sources, staleLeads, support, tags, teams, users. Domains with none: activities, invitations, savedViews, teams.
8. E2E suite exists (10 specs) but is **not executed in CI** and runs against `npm run dev`.
9. Super-admin impersonation/read-only and account-takeover scenarios (C1, H2) beyond unit mocks.

---

## R. Recommended Fix Order

**Phase 0 — same day (small, high blast radius)**
1. C1 — require `phone_number` match; plan removal of Firebase fallback.
2. C2 — guard `sendCampaignAction`; org-check in `WhatsAppService.send`.
3. H3 — gate manual plan switch on a non-prod flag.
4. Confirm in production: `WATXIO_APP_SECRET`, `FACEBOOK_APP_SECRET`, `MISSED_CALL_WEBHOOK_SECRET`, `R2_PUBLIC_URL` unset, Firebase providers, Postgres/Redis TLS, `DATABASE_URL` for local dev.

**Phase 1 — this week**
4. H1 — enforce `leads.edit` inside the shared access helper; add the role-matrix test.
5. H5 — split queue/worker modules.
6. H6 — fix the migration journal; make CI migrations job a required check.
7. H2 — verify-before-link; revoke on Google link; raise password policy.
8. H10 — tenant-aware WhatsApp inbound; fail closed without signature secret; unique provider id.
9. H11 — presigned URLs or private-only.
10. M1 — target-privilege check for user management.

**Phase 2 — next 2 weeks**
11. H4/K — atomic limit enforcement; message/storage/API metering; downgrade handling; billing-period AI credits.
12. H8 — super-admin MFA/step-up.
13. H9/M5 — CAPTCHA, per-org ceilings, retention for `webhook_events`.
14. M2, M3 (make `organizationId` required; plan RLS), M4 (one trusted-IP helper), M6, M7, M8, M11.
15. H7 — retire/secure the compose topology; env validation expansion; `.env.example` complete.

**Phase 3 — hardening and hygiene**
16. M9, M10, M12–M21; L-items; N (SQL aggregation for insights, trigram search, phone index, pool tuning); audit wrapper (M17); DLQ UI; remove duplicate import path.
17. Documentation consolidation (P) and CI additions (E2E, audit, secret scan, Node version parity).
18. The testing gaps in Q, prioritising 1–3.

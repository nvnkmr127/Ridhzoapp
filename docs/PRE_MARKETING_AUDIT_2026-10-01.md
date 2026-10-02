# Ridhzo — Pre-Marketing Product Audit (2026-10-01)

> **Superseded in part by [PRODUCTION_AUDIT_2026-10-02.md](PRODUCTION_AUDIT_2026-10-02.md)** — see its remediation status for what has since been fixed.

**Verdict: not ready to start paid acquisition yet.** The core product is solid (signup, login, tenant isolation, RBAC, CRUD and billing logic all held up under test). But there are 4 blockers that would waste ad spend or lose real customers' data on day one: email deliverability, the broken default signup tab, no usable conversion tracking, and lead loss when Redis hiccups. All are fixable in days, not weeks.

**Counts:** 2 Critical · 6 High · 11 Medium · 9 Low (plus items I could not verify, listed at the end).

---

## Status update (2026-10-01, later)

**Fixed in code (uncommitted at time of writing):** H1 default tab, H2 UTM forwarding + login capture, H3, H4 (missed-call), H5, H6 (CI), M2, M3, M4, M5, M10, L1, L3, L5, plus session-refresh resilience for C2.
**Configured in production by the owner:** C1 (email domain), H1 (WhatsApp OTP), H2 (tracking IDs), H4 (webhook secrets). Not independently verified. A public check shows the live website bundle still has no Meta Pixel ID inlined: `NEXT_PUBLIC_*` values are baked in at build time, so the website must be **redeployed** after adding the variable. The app still has no GTM/GA tags (code change needed).
**Still open:** C2 (pooler / `maxDuration`), WhatsApp inbound webhook signature + cross-tenant matching, pending-event sweeper, M1, M6–M9, M11.

---

## How this was tested

| What | How |
|---|---|
| App code at `HEAD` (2872c7b) | Ran on a **throwaway local Postgres + Redis** with all 91 migrations applied from scratch. Every external key (Resend, Razorpay, Google, Firebase, R2, AI) was blanked. **No production data was written.** |
| User journey | Drove signup → dashboard → create lead → logout → login → forgot/reset password → phone-OTP signup → duplicate signup in a real browser. |
| Security / isolation | 2 tenants + 1 member user. ~60 scripted API calls: cross-tenant read/write on every lead sub-route, member vs admin, unauthenticated hits, forged webhooks. |
| Production (read-only) | Live `ridhzo.com` and `app.ridhzo.com` HTML, headers, JS bundles, link crawl (62 links); Vercel deployments, domains, and 7 days of **runtime error clusters**. |
| Static checks | `tsc` clean · 854 unit tests pass (21 skipped) · eslint warnings only. |

**Not done (be aware):** production env-var values (access was denied by the permission layer, so I didn't retry), real email delivery, real payments (no Razorpay test keys), Google OAuth, Facebook/Google Lead Ads live, real WhatsApp, the Android app, `next build` (host disk was at 99%, which actually killed my local DB once), load testing, Playwright e2e suite (exists in `e2e/`, not run in CI either).

---

## What works (verified, not assumed)

- Signup (email + WhatsApp-OTP): validation, required fields, duplicate email (case-insensitive) rejected with a clear message and **no orphan workspace**, user + org + roles + 14-day Starter trial created, welcome email dispatched, auto-login, redirect to dashboard with a 3-step setup checklist.
- Login: wrong/unknown password → generic failure; **rate limit kicks in** (8/15 min per email); session survives refresh and server restart; logout works; all dashboard routes redirect to `/login?callbackUrl=` when signed out; `/api/v1/*` returns 401.
- Password reset: generic response (no account enumeration), one-time token, reset works, token cannot be reused.
- **Tenant isolation: no leaks.** Tenant B got 404 on all 20+ lead sub-routes (read, edit, delete, notes, tags, WhatsApp, email, AI…) for tenant A's lead.
- RBAC: a `member` sees only own leads, is bounced from billing/users/API/audit/webhooks/admin; `/admin` is super-admin only.
- Input validation: bad email/oversize name/bad UUID/non-JSON all return clean 4xx; `<script>` in a name is stored but rendered as text; duplicate phone → 409.
- Email HTML: user data is escaped in notification, support, invite, meeting and billing emails (two small exceptions: L3).
- SSRF guard on tenant webhooks/SMTP is thorough. Invitation flow is transactional and concurrency-safe. Razorpay webhook signature check is correct and fails closed. Billing state machine handles out-of-order events.
- Marketing site: all 62 links return 200; pricing (₹249 / ₹449, yearly = 10×) matches the app's plan config.
- Production deploys are on `HEAD` and READY. DB query logging is correctly disabled in production.

---

## CRITICAL

### C1. Transactional email likely undeliverable in production (Resend sandbox sender)
- **Where:** invites, meeting emails, notifications — and by the same code path, welcome / password-reset / billing mail.
- **Evidence:** production runtime errors (50 occurrences, 21 Sep → 29 Sep): *"You can only send testing emails to your own email address (nvnkmr127@gmail.com). To send emails to other recipients, please verify a domain at resend.com/domains."* Also 89 × `rate_limit_exceeded` (Resend allows 10 req/s; a burst of notifications exceeded it, 29 Sep).
- **Steps:** invite any teammate with a non-owner email on production, or request a password reset for a non-owner address.
- **Expected:** email arrives from `no-reply@<your verified domain>`. **Actual (per logs):** Resend rejects; invite is created but never delivered (`[invite] email delivery failed; invite still created`). Password reset returns an error to the user.
- **Severity:** Critical — every new user who forgets a password, every invited teammate, every notification is lost. Last seen 29 Sep; I can't confirm whether it's since fixed (couldn't read env), so **test it live before spending on ads**.
- **Root cause:** `MAIL_DOMAIN` unset / domain not verified in Resend → `senderFor()` falls back to `MAIL_FROM = onboarding@resend.dev` (`src/lib/mail/mailer.ts:15-24`; `.env.example:33`).
- **Fix:** verify the domain in Resend (SPF/DKIM/DMARC), set `MAIL_DOMAIN`, `MAIL_FROM`, `MAIL_REPLY_DOMAIN` in Vercel **and** the Railway worker. Add a 10 req/s throttle/queue around bursts of `notifications` mail. Send one real test of each template to a Gmail + Outlook inbox.

### C2. Production Postgres connections are unreliable → logouts, 500s, and 300 s hangs
- **Evidence (7 days of prod logs):** `read ECONNRESET` on `select … from users` (26 occurrences, 19 users, **still happening 01:24 UTC today**); `JWT_SESSION_ERROR` (31, 18 users — users are bounced to `/login`); `Task timed out after 300 seconds` (26, 23 users — includes `/login`, `/signup`, `/forgot-password`); `connect ETIMEDOUT`; and `/api/health` itself reported `"database":"down"` on my first call today, then `up` on the next six.
- **Expected:** a transient DB blip is retried invisibly. **Actual:** the failed query bubbles up; in `auth.ts` `jwt()` a DB error during the 60 s refresh makes NextAuth drop the session; a DB error inside `authorize()` surfaces the SQL text in the redirect (see M3).
- **Severity:** Critical for a launch — paid traffic that hits `/signup` or `/login` during a blip sees a 500, timeout, or logout.
- **Root cause (likely):** Railway TCP proxy resets idle sockets; pooled `postgres-js` connections go stale (`src/db/index.ts`: `idle_timeout: 20`, `max_lifetime: 600`, no retry). Vercel functions with `max: 20` per instance can also exhaust Railway's connection cap. Not reproducible locally (no proxy).
- **Fix:** (1) retry-once wrapper for `ECONNRESET`/`CONNECTION_*` errors in the db client; (2) in `jwt()`, catch DB errors and keep the existing token instead of throwing; (3) put a pooler (PgBouncer / Railway private network / Neon) between Vercel and Postgres, `max: 3–5` per function instance; (4) set function `maxDuration` ≈ 30 s rather than the 300 s default so hangs fail fast; (5) alert on `/api/health` = 503.

---

## HIGH

### H1. Default signup/login tab (WhatsApp OTP) is broken in production
- **Evidence:** `[watxio-otp] … Watxio 401: Unauthenticated` (11 occurrences, 25–28 Sep) and `Watxio 500: Message blocked by 24h policy. Use a Template` (5, 25 Sep). Both `/signup` and `/login` open on the **WhatsApp OTP tab**.
- **Expected:** code arrives on WhatsApp. **Actual:** "We couldn't send the code on WhatsApp…". A first-time visitor's first attempt fails.
- **Root cause:** expired `WATXIO_API_KEY`; `WATXIO_OTP_TEMPLATE` not set so the plain-text fallback is blocked outside the 24 h window (`lib/actions/auth.ts` `sendWhatsAppOtpAction`). Also: if WhatsApp isn't configured at all, production returns "isn't available" but the tab stays default.
- **Fix:** rotate the key, create + approve an OTP *authentication template* and set `WATXIO_OTP_TEMPLATE`. Until it's proven, **make Email (or Google) the default tab**, or hide the WhatsApp tab when `isConfigured()` is false.

### H2. No usable conversion tracking (Meta / Google Ads) — you'd be flying blind
Three separate gaps, all confirmed:
1. **Meta Pixel is not loaded on the website.** Live bundle has `gaId:"G-59GN5JJMJT"`, `gtmId:"GTM-MB4J36VH"` inlined but `NEXT_PUBLIC_META_PIXEL_ID` was never set at build → no `fbq`, no `_fbp` cookie. Unless the Pixel lives inside GTM (can't verify), Meta can't optimise or attribute.
2. **The app (`app.ridhzo.com`) has no client-side tracking at all** — no GTM/GA/Pixel on `/signup`, `/login`, dashboard. There is no browser `CompleteRegistration`/`Lead` event, no Google Ads conversion, and no GA4 `sign_up`. Only a server-side Meta CAPI call exists (`CompleteRegistration`, `Subscribe`), and only if CAPI is configured in the admin console (can't verify). Google Ads has `gclid` stored but **no offline-conversion upload**, so Google Ads signup conversions are impossible today.
3. **Campaign attribution is dropped at the website→app hop.** Website CTAs are static links (`https://app.ridhzo.com/signup`, `…?plan=starter`) — no code forwards `utm_*`, `gclid`, `fbclid` (`ridhzo-website/src`: zero references). The app only captures them if they're on the `/signup` URL itself (`lib/tracking/utm.ts`, called only from `signup/page.tsx`). Also never captured on `/login`, so Google-button signups from there have no attribution.
- **Also:** both GA and GTM are configured — the site's own comment (`analytics-config.ts`) warns this double-counts if GA4 is also inside GTM. Consent is strict opt-in, so only a minority of visitors will be measured (reasonable for EU, heavy undercount for India — consider region-based defaults, with CAPI backfilling).
- **Fix:** add GTM to the app layout (consent-gated) and push `sign_up`/`login`/`begin_checkout`/`purchase` to `dataLayer`; set `NEXT_PUBLIC_META_PIXEL_ID` (or configure inside GTM — one method only); add a small script on the website that appends stored UTMs/click-IDs to every `app.ridhzo.com` link; call `captureAttribution()` on `/login` too; send a shared `event_id` for browser/CAPI dedupe; upload gclid offline conversions.

### H3. Inbound lead webhooks can lose leads permanently when Redis is unavailable
- **Steps (reproduced):** with Redis down, POST to `/api/webhooks/generic_webhook?sourceId=…` with `x-idempotency-key: K`.
- **Expected:** 5xx → sender retries → lead eventually created. **Actual:** attempt 1 returns 500 *after* storing the event as `pending`; the sender's retry with the same key returns `200 {"duplicate":true}` and is never enqueued. After Redis returned, the lead never existed. No sweeper re-queues `pending` events.
- **Root cause:** `app/api/webhooks/[provider]/route.ts` inserts the row, then `ingestionQueue.add()`; the idempotency short-circuit treats any existing row as done. Production logs show Redis timeouts (`Rate limit timeout`, 10 occurrences), so this is not hypothetical. Meta Lead Ads is the likeliest source to hit it.
- **Fix:** if `queue.add` fails, mark/delete the event (or return 5xx *and* allow re-enqueue when a duplicate is `pending`); add a periodic job that re-enqueues `webhook_events` stuck `pending` > 2 min; for hosted forms (already processed inline) no change.

### H4. Unauthenticated webhooks that are open when their secret env var is unset
Reproduced locally with default env:
- `POST /api/webhooks/missed-call` `{"phone":"…"}` — **no auth, no `organizationId` required** → matched tenant A's lead, logged activity, and attempted a WhatsApp send. With the Business API configured it would **message real people on any tenant's behalf**. Secret check is `if (secret && …)` (`missed-call/route.ts:17`), so unset = open. Without an `organizationId` it matches the first lead **across all tenants**.
- `POST /api/webhooks/whatsapp` — signature only checked `if (WATXIO_APP_SECRET)`; unset = forged inbound replies written into any lead timeline, plus paid AI classification per forged message.
- `WhatsAppService.recordInbound` (shared) also matches by phone **across all tenants** with `limit(1)` — if the same phone is a lead in two workspaces, a genuine reply can land in the wrong tenant's timeline (cross-tenant data misattribution).
- **Severity:** High if `MISSED_CALL_WEBHOOK_SECRET` / `WATXIO_APP_SECRET` are unset in prod (can't verify; `.env.example` ships `MISSED_CALL_WEBHOOK_SECRET=""`).
- **Fix:** fail closed (401 when the secret is missing); require `organizationId`; resolve the tenant from the WhatsApp phone-number-id in the payload; rate-limit on the *first* XFF hop (it currently keys on the whole header, which a client can vary).

### H5. Security headers missing (clickjacking / MIME-sniffing / referrer leakage)
- Verified on prod: `app.ridhzo.com` and `ridhzo.com` return **only** `strict-transport-security`. No `X-Frame-Options`/`frame-ancestors`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, CSP. `X-Powered-By: Next.js` exposed in dev (`poweredByHeader` not disabled).
- **Impact:** the login/billing UI can be iframed (clickjacking); reset-password tokens in the URL leak via `Referer`.
- **Fix:** `headers()` in `next.config.ts`: `frame-ancestors 'none'`, `nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`, then a report-only CSP. Set `poweredByHeader:false`. (Note `/f/[slug]` and `/book/[slug]` may be intentionally embeddable — exempt those.)

### H6. Deploys have shipped before DB migrations (schema drift in production)
- **Evidence:** production 500s from missing columns — `first_contacted_at` (24 Sep), `state` (25 Sep), `lead_field_config` (26 Sep). Build is `next build` only; CI runs tsc/lint/vitest only; nothing runs `drizzle-kit migrate`. (Separately, `time zone "Asia/Calcutta" not recognized` took the India dashboard down on 29 Sep; the analytics path now avoids it, but prod Postgres lacks that tz alias — check other `AT TIME ZONE <org tz>` use.)
- **Fix:** run `db:migrate` as a gated deploy step *before* promoting the build (expand/contract migrations so old code keeps working); add a CI job that applies all migrations to an empty Postgres (I did this by hand: all 91 apply cleanly) and runs the Playwright smoke suite.

---

## MEDIUM

| # | Issue | Where / evidence | Fix |
|---|---|---|---|
| M1 | **No email verification at signup.** Anyone can register `victim@company.com`. Combined with `allowDangerousEmailAccountLinking: true` and no `email_verified` check in the Google `signIn` callback, an attacker who pre-registers a victim's email owns the account the victim later "signs in with Google" into (pre-hijacking). | `lib/actions/auth.ts`, `lib/auth.ts` | Send a verification link/OTP; require `profile.email_verified` for Google; link accounts only when verified. |
| M2 | **Sessions survive password reset / change.** Reproduced: a session issued before a reset still returns the user afterwards (30-day JWT). | `resetPasswordAction`, `changePasswordAction` | Call `SessionService.revokeUserSessions(userId)` on both. |
| M3 | **DB error text leaks into login redirect** and breaks login. Prod: `TypeError: Headers.set: "/login?error=Failed query: select … from users …"` and `GET /api/auth/error?error=Failed+query…` (SQL + user id in the URL). | `authorize()` rethrows `err.message` (`lib/auth.ts`) | Map unknown errors to a fixed code (`"ServerError"`), log the real one. |
| M4 | **WhatsApp OTP: no per-IP limit, weak RNG, enumeration.** Only a 45 s per-phone cooldown → one IP can trigger OTPs to unlimited numbers (WhatsApp cost / harassment). Code uses `Math.random()`. `purpose=login` returns "no account with this number" / signup "already has an account" (phone enumeration). | `sendWhatsAppOtpAction` | Per-IP + global limit; `crypto.randomInt`; neutral message on login. |
| M5 | **Razorpay webhook swallows errors and returns 200** — a transient DB failure (see C2) permanently drops a paid activation/cancel event; Razorpay won't retry. | `api/webhooks/razorpay/route.ts:25-28` | Return 500 on failure (Razorpay retries up to 24 h); handlers are already idempotent. |
| M6 | **Pricing-page plan is ignored.** `/signup?plan=starter|unlimited` links exist on the site but `signup/page.tsx` never reads `plan`; user lands on a trial with no plan context. | `ridhzo-website` pricing CTAs vs app signup | Read `plan`, store it, route to checkout after onboarding, or drop the param. |
| M7 | **Dashboard is chatty:** `/` runs **52 SQL statements** per load (empty tenant), `/follow-ups` 18, `/leads` 25; ~13 are single-key `platform_configs` lookups repeated per request. The code itself notes a ~550 ms remote DB round-trip. With C2, this multiplies timeout risk. | `(dashboard)/layout`, `PlatformConfigService` | Cache `platform_configs` 30–60 s in-process; batch layout lookups. |
| M8 | **Public lead forms / webhooks have no bot protection** (no CAPTCHA/honeypot/Turnstile). 10/min per IP, 200/min per form — a bot can fill a tenant's 300-lead Free quota in under 2 min. | `lib/actions/publicLead.ts` | Honeypot + Cloudflare Turnstile (you're already behind Cloudflare). |
| M9 | **Existing users can't be invited.** Inviting an email that already has an account fails ("A user with that email already exists") — one email = one workspace. A colleague who signed up first can never join a team. | `domains/invitations/service.ts:25` | Product decision: support multi-workspace membership or a "move my account" flow; at minimum a clear message. |
| M10 | **Signup rate limit 5/hour/IP** blocks shared-NAT cases (offices, colleges, events, mobile carriers — important for India). | `signupAction` | Raise to ~20/h or key on IP+UA; keep email-level limit. |
| M11 | **CI doesn't build or run e2e.** `ci.yml` = tsc + lint + vitest. Tenant-isolation, kanban, automations specs exist in `e2e/` but never run; a broken `next build` is only caught by Vercel. (Two recent prod builds ended `ERROR` on 30 Sep before the next one succeeded.) | `.github/workflows/ci.yml` | Add build + Playwright smoke job with a Postgres service. |

## LOW

- **L1** No Terms/Privacy consent on signup form (website has `/terms`, `/privacy`; the app's signup doesn't link or require them). Needed for paid-ad compliance (DPDP/GDPR, Meta/Google policy).
- **L2** Invalid phone (`"abc"`) is silently dropped → lead created with no phone, HTTP 201. Past-dated follow-ups accepted. `PATCH` with `budget` as a number returns an unreadable `invalid_union` error.
- **L3** Unescaped `org.name` / `owner.firstName` in two billing lifecycle emails (`lifecycleService.ts:534, 614`) → HTML injection into the owner's own mail.
- **L4** Phone-OTP and Google signups create org then user in separate statements (not one transaction) → orphan workspaces if the second fails (email signup is transactional). `users.phone` has no unique index (only a race-prone app check).
- **L5** Duplicate-email message from `signupAction` falls through to a generic error (checks for the word "duplicate"; actual text is "…already exists"), so the field-level inline error isn't shown.
- **L6** Per-email login lockout (8/15 min) lets anyone lock a known user out for 15 minutes; mobile login keys the IP limit on the *entire* `X-Forwarded-For` header.
- **L7** Wrong OTP stays in the input after an error; two nag banners (trial + "add your mobile number") consume ~150 px of an 812 px phone screen.
- **L8** Server-action body limit is 25 MB globally (`next.config.ts`) — applies to unauthenticated `signupAction` too; CSV import still pre-checks at 1 MB (stale comment). Prod once logged `Body exceeded 1 MB limit` on a lead action.
- **L9** Dev-only `Sign in as demo admin (dev)` button is correctly gated on `NODE_ENV === "development"` (confirmed absent on prod) — noted only so it isn't re-reported.

Earlier prod errors that look **already fixed** in `HEAD` (verify no recurrence): R2 upload `411` (fix `c1e6743`), `isSendableFollowUp` server/client boundary (last seen 25 Sep), `useSession` undefined on `/` and `/profile` (26 Sep), `Asia/Calcutta` analytics SQL.

---

## Production-readiness checklist (what I could and couldn't confirm)

| Area | Status |
|---|---|
| Vercel deployment = `HEAD`, domains `app.ridhzo.com` (+ 2 redirects), HTTPS/HSTS | ✅ |
| Env validation at boot (`DATABASE_URL`, `NEXTAUTH_SECRET` fatal; others warn) | ✅ in code; **prod values not inspected** |
| Resend domain, `MAIL_DOMAIN` | ❌ see C1 |
| WhatsApp (Watxio) key + OTP template | ❌ see H1 |
| `MISSED_CALL_WEBHOOK_SECRET`, `WATXIO_APP_SECRET`, `WATXIO_VERIFY_TOKEN` | ❓ verify set (H4) |
| `NEXT_PUBLIC_META_PIXEL_ID`, Meta CAPI config in admin console | ❌ pixel absent (H2); CAPI ❓ |
| Razorpay live keys, 4 plan IDs, webhook secret, **webhook URL registered in Razorpay dashboard** | ❓ not testable |
| Background worker (Railway, 1 replica, `numReplicas:1`, restart ON_FAILURE ×10, no health check) | ❓ confirm it is running and drains `ingestion`, `sequence`, `trial-downgrade`, `webhook-retry` queues; add an alert if a queue backs up |
| DB backups: GitHub Action every 6 h with restore-proof to R2 | ✅ in code; confirm last run is green |
| Sentry DSN | ❓ (DSNs exist in `.env`); none of the prod errors above came from Sentry, so check it's receiving |
| Cron-like jobs | All BullMQ repeatables (no HTTP cron routes) — they only run if the worker is up |
| `/api/health` | ✅ exists, 503 on DB/Redis failure — wire an uptime monitor to it |

---

## Recommended order of work (≈ 1 week)

1. **Day 1:** C1 (verify domain + send real test of every template), H1 (fix Watxio or default to Email tab), H5 (headers), M2/M3 (small auth fixes).
2. **Day 2–3:** H2 (GTM in app, Pixel, UTM forwarding, `sign_up`/`purchase` events), L1 (consent links).
3. **Day 3–4:** C2 (retry + pooler + shorter `maxDuration` + health alert), H3, M5.
4. **Day 4–5:** H4 (fail-closed webhooks), H6 (migrate-on-deploy, CI build + e2e), M1 (email verification), M8 (Turnstile).
5. Re-run this audit's smoke: signup → email arrives → reset → invite → payment (Razorpay test mode) → ad-click → UTM visible in admin attribution.

*No application code was changed in this audit; this file is the only addition.*

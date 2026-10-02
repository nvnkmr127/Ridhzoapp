# Ridhzo REST API (`/api/v1`)

The API behind the mobile app and third-party integrations. This page is the reference; the route handlers under
`src/app/api/v1/**` are the source of truth. Settings → API (in the app) creates keys and shows the base URL.

## Authentication

Send `Authorization: Bearer <token>` on every request. Two kinds of token:

| Token | Looks like | Who it is | Notes |
|---|---|---|---|
| **API key** | `pk_…` | The workspace (no user) | Created in Settings → API (needs `api.manage` and a verified email). Shown once. Optional expiry (30/90/365 days), optional read-only switch, optional per-area **scopes**. |
| **Mobile session token** | JWT | A signed-in user | From `/auth/login`, `/auth/otp/verify` or Google sign-in. 30 days; `POST /auth/refresh` swaps it for a fresh one (the old one retires 10 minutes later). Honours the user's **live** role: a demoted/deactivated user loses access at once. |

Endpoints marked **user** below need a mobile session token (they act as a person); API keys get `403 A user session is required`.

### Scopes (API keys only)
A key created without a scope list can reach everything its read/write switch allows. With a list, each area is allowed only
if named: `leads:read|write`, `meetings:read|write`, `followups:read|write`. Areas outside these (e.g. `/me`, `/statuses`,
`/templates`) are not scope-guarded. `GET`/`HEAD` need `:read`, everything else `:write`. A missing scope → `403`.

## Limits

- **Per minute:** 600 requests per key / per user (`429`, with `Retry-After` and `X-RateLimit-*` headers).
- **Per month (API keys only):** by plan — Free 10,000 · Starter 300,000 · Unlimited 3,000,000 (`429`). The mobile app is not metered.
- **Plan features** apply as in the app (lead cap, storage cap, message/email allowances → `402`/`422` with a clear message).
- **Maintenance mode:** writes return `503` + `Retry-After`; reads keep working.
- **Suspended workspace:** `403`.

## Conventions

- JSON in, JSON out: success `{ "data": … }`, errors `{ "error": "message", "details"?: { field: "message" } }`.
- Status codes: `200/201` ok · `401` missing/invalid/expired/revoked token · `403` not allowed (role, read-only key, scope) · `404` not found **or not yours** (never reveals other tenants' ids) · `422` validation · `429` throttled · `503` maintenance.
- IDs are UUIDs; a malformed id is a `404`.
- **Idempotency:** `POST /leads`, `/leads/{id}/notes`, `/leads/{id}/follow-ups`, `/leads/{id}/contact`, `/leads/{id}/reply` accept an `Idempotency-Key` header (8–100 chars `[A-Za-z0-9-]`). A repeat with the same key and route returns the first result (`Idempotent-Replayed: true`); keys are kept 35 days.
- **Visibility:** an API key sees the whole workspace. A user token sees leads they own, leads they attend a meeting for or have a follow-up on, and (with `settings.manage`) all leads.
- **Writes** need `leads.edit` for user tokens ("Viewer" roles are read-only here, as on the web).

## Pagination
`GET /leads` → `limit` (1–200, default 50) and either `offset` or keyset `cursor=<last lead id>` (newest first; stable under inserts).
`?search=` (name/email/company/phone digits), `?status=`, `?owner=me`, `?deleted=1` (recycle bin; needs `leads.delete`).

**Incremental sync (mobile):** `GET /leads?sync=1[&after=<cursor>]` returns changes oldest-first as `{ data, next, done }`;
rows the caller can no longer see (deleted, reassigned away) come back as `{ id, gone: true }`. Loop until `done`.

## Endpoints

### Session & app
| Method | Path | Notes |
|---|---|---|
| GET | `/app-config` | public: min app version, store links |
| POST | `/auth/login` | `{ email\|phone, password }` → `{ token, user }` (rate-limited per account and IP) |
| POST | `/auth/otp/send` · `/auth/otp/verify` | WhatsApp OTP login (existing accounts) |
| POST | `/auth/google/exchange` · GET `/auth/google/finish` | Google sign-in hand-off (PKCE-style code) |
| POST | `/auth/refresh` · `/auth/logout` | **user** — rotate / revoke the token |
| GET | `/me` | **user** — profile, workspace, permissions, plan |

### Leads
| Method | Path | Notes |
|---|---|---|
| GET / POST | `/leads` | list (see Pagination) / create (`name` required; duplicate email/phone → `422` naming the existing lead) |
| GET | `/leads/cold` | going-cold list |
| GET / PATCH / DELETE | `/leads/{id}` | read / edit fields, status, stage / move to recycle bin |
| GET | `/leads/{id}/profile` | the whole lead screen in one call (timeline, follow-ups, meetings, …) |
| POST | `/leads/{id}/restore` · `/leads/{id}/purge` | recycle bin (`leads.delete` / `leads.purge`) |
| GET / POST / DELETE | `/leads/{id}/tags` | |
| POST · PATCH · DELETE | `/leads/{id}/notes`, `/leads/{id}/notes/{noteId}` | |
| POST | `/leads/{id}/follow-ups` | **user** |
| POST | `/leads/{id}/contact` · `/leads/{id}/reply` | **user** — log an outreach / paste a reply |
| POST | `/leads/{id}/whatsapp` · `/leads/{id}/email` | send (Business-API mode / workspace mailer); email is **user** |
| POST | `/leads/{id}/attachments` | **user** — multipart `file` (≤ 25 MB, allow-listed types, content must match the extension) |
| POST | `/leads/{id}/shares` | **user** — branded share link |
| POST | `/leads/{id}/sequences` | enrol in a sequence |
| GET | `/leads/{id}/ai/recap` · POST `/ai/draft` · POST `/ai/suggestions/{id}` | AI features (consume AI credits) |
| GET · DELETE | `/attachments/{id}` | **user** — signed 10-minute download link / remove |

### Follow-ups, meetings, calls
| Method | Path | Notes |
|---|---|---|
| GET | `/follow-ups` · PATCH `/follow-ups/{id}` | list / complete, snooze, reschedule |
| GET · POST | `/leads/{id}/meetings` | |
| GET | `/meetings` · GET/PATCH `/meetings/{id}` | |
| POST | `/meetings/{id}/outcome` · `/meetings/{id}/check-in` | outcome / **user** check-in |
| PATCH | `/sequence-enrollments/{id}` | pause / resume / stop |
| GET/POST | `/calls/numbers`, `/calls/caller-id`, `/calls/sync`, `/calls/sync/status` | **user** — phone call-log sync |

### Reference data & misc
`GET /statuses` · `/custom-fields` · `/templates` · `/users` · `/dashboard` · `/badges` ·
`GET/PATCH /notifications` · `POST/DELETE /devices` (push tokens, **user**) · `POST /devices/test` (**user**).

## Webhooks (outbound)
See [`OUTBOUND_WEBHOOK_EVENTS.md`](OUTBOUND_WEBHOOK_EVENTS.md). Inbound lead capture endpoints (`/api/webhooks/*`) are documented in
`SOURCE_WEBSITE_WEBHOOK.md`, `SOURCE_FACEBOOK_LEAD_ADS.md`, `SOURCE_GOOGLE_LEAD_ADS.md`.

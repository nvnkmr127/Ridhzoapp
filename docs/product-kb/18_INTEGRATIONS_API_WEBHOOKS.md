# Integrations, API & Webhooks

## Built-in integrations
| Integration | What it does |
|---|---|
| **Facebook & Instagram Lead Ads** | Real-time lead import, form filtering, past-lead sync, auto token refresh |
| **Google Lead Form Ads** | Real-time lead import via webhook |
| **Android Call Sync & Caller ID** | Native call log sync (`/api/mobile/calls/sync`), Caller ID directory (`/api/mobile/caller-id`), and phone key prefiltering |
| **WhatsApp Business API** | Connect via Watxio or Meta Cloud API with organization tenant ID isolation |
| **Personal WhatsApp** | One-tap wa.me messaging, no setup |
| **Google Calendar** | Meetings and booking-page appointments sync to your calendar; Google Meet links |
| **Email (SMTP)** | Gmail, Google Workspace, Zoho, Outlook, SES; custom reply-to and connection testing |
| **Meta Conversions API (CAPI)** | Send lead-quality events back to Meta with an interactive **Test Ping** button in Settings |
| **Lead enrichment** | Fill in missing lead details automatically from your data provider |
| **Telephony (missed calls)** | Any provider (Exotel, Knowlarity, Twilio…) → auto-WhatsApp on missed call |
| **Razorpay** | Subscription payments with automated GST tax invoices |
| **Zapier / Make / Pabbly / any tool** | Via inbound webhook, REST API and outbound webhooks |

Lead-intelligence integrations (enrichment, inbound email logging, Meta CAPI) are configured in **Settings → Lead Intelligence**.

## REST API (Settings → API)
- Create **API keys** with **Full** or **Read-only** scope; keys are shown once and stored hashed.
- Usage tracking and rate limiting per key.
- Endpoints (v1) include:
  - `POST /api/v1/leads` — create a lead · `GET /api/v1/leads` — list/search leads (trigram phone matching) · `GET/PATCH/DELETE /api/v1/leads/{id}`
  - `POST /api/leads/purge` — permanent lead purge (admin permission required)
  - Follow-ups, meetings, statuses, templates, custom fields, users, notifications, dashboard summary
- **Use cases:** push leads from your own website backend or app; sync leads into an ERP; build a custom report.

## Mobile API & Offline Sync Endpoints
Dedicated endpoints power the native mobile application:
- **Authentication & Security:** `/api/mobile/auth/send-otp`, `/api/mobile/auth/verify-otp`, `/api/mobile/auth/token-revoke`.
- **Incremental Lead Sync:** `/api/mobile/leads/sync` supporting `sync_at` timestamp filtering and offline conflict detection.
- **Mobile AI Suggestions:** `/api/mobile/leads/[id]/ai-suggestions` for 1-click field updates and stage transitions from mobile.
- **Android Call Sync:** `/api/mobile/calls/sync` and `/api/mobile/calls/phone-keys`.
- **Idempotency-Key Header:** Mobile mutation requests (notes, contact logs, replies) support `Idempotency-Key` headers to prevent duplicate executions during network dropouts.

## Outbound webhooks (Settings → Webhooks)
Ridhzo can notify your other systems in real time.
- Events: **lead created**, **lead status changed**, **lead became hot**, **lead stuck (stagnant alert)**.
- Each delivery is signed (HMAC-SHA256) so the receiver can verify it came from Ridhzo.
- Automatic **retries with exponential backoff** (up to 5 attempts); failed deliveries are kept for inspection and replay.
- Add, edit, test and disable endpoints from the settings screen.

**Use cases:**
- When a lead is marked **Won**, create the customer in Tally/Zoho Books/your ERP.
- Post new hot leads to a Slack or Google Chat channel via Zapier.
- Update a Google Sheet for a client report.

## Inbound webhook
Every workspace gets signed webhook URLs to receive leads from any website or tool. See [Lead Capture](04_LEAD_CAPTURE_SOURCES.md).

## Coming soon
- LinkedIn Lead Gen Forms (Coming soon)
- WhatsApp inbound as an automatic lead source (Coming soon)

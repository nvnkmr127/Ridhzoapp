# Integrations, API & Webhooks

## Built-in integrations
| Integration | What it does |
|---|---|
| **Facebook & Instagram Lead Ads** | Real-time lead import, form filtering, past-lead sync, auto token refresh |
| **Google Lead Form Ads** | Real-time lead import via webhook |
| **WhatsApp Business API** (via Ridhzo's WhatsApp partner) | Send/receive WhatsApp, templates, campaigns, sequences, alerts |
| **Personal WhatsApp** | One-tap wa.me messaging, no setup |
| **Google Calendar** | Meetings and booking-page appointments sync to your calendar; Google Meet links |
| **Email (SMTP)** | Gmail, Google Workspace, Zoho, Outlook, SES and any SMTP server |
| **Meta Conversions API (CAPI)** | Send lead-quality and conversion events (e.g., lead qualified, won) back to Meta so Facebook's algorithm finds you better leads |
| **Lead enrichment** | Fill in missing lead details automatically from your data provider |
| **Telephony (missed calls)** | Any provider (Exotel, Knowlarity, Twilio…) → auto-WhatsApp on missed call |
| **Razorpay** | Subscription payments (for your Ridhzo plan) |
| **Zapier / Make / Pabbly / any tool** | Via inbound webhook, REST API and outbound webhooks |

Lead-intelligence integrations (enrichment, inbound email logging, Meta CAPI) are configured in **Settings → Lead Intelligence**.

## REST API (Settings → API)
- Create **API keys** with **Full** or **Read-only** scope; keys are shown once and stored hashed.
- Usage tracking and rate limiting per key.
- Endpoints (v1) include:
  - `POST /api/v1/leads` — create a lead · `GET /api/v1/leads` — list/search leads · `GET/PATCH/DELETE /api/v1/leads/{id}`
  - Follow-ups, meetings, statuses, templates, custom fields, users, notifications, dashboard summary
- **Use cases:** push leads from your own website backend or app; sync leads into an ERP; build a custom report.

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

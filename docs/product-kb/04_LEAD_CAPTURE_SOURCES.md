# Lead Capture & Lead Sources

## What it is
Ridhzo pulls leads from every channel into **one inbox**, automatically, in seconds. Every source runs through the same pipeline: **receive → clean & map fields → check duplicates → create lead → assign → alert → run automations.**

Managed at **Settings → Lead Sources**. Each source shows live stats (leads received, last lead time, status) and can be paused or removed safely.

## Supported sources

### 1. Facebook & Instagram Lead Ads
- **Connect in one click** with Facebook login; choose your Page(s).
- New leads arrive **within seconds** of form submission (real-time webhook).
- **Multi-Tenant Page Sharing:** A single Facebook Page can be connected across multiple shared organization accounts. Incoming leads are automatically copied and dispatched to all connected workspaces — ideal for marketing agencies managing franchise or regional dealer accounts.
- **Choose which forms** to import (form-level filter).
- **Sync Past Leads** — backfill leads you received before connecting.
- Automatic field mapping: name, email, phone, plus every custom form question saved on the lead ("What they told you in the form").
- **Proactive Token Expiry & Health Tracking:** Continuous monitoring of Facebook Page access tokens with clear in-app expiry warnings before integrations break, plus automatic outage recovery.
- **Meta Conversions API (CAPI) Delivery Status:** Track real-time delivery status (sent, pending, failed) and diagnostic errors directly within Settings → Lead Intelligence.
- Supports Meta data-deletion and deauthorization requirements.

**Use case:** An agency manages 4 franchise branches running ads on one central Facebook page. Leads automatically replicate to all branch workspaces with instant local rep alerts.

### 2. Google Lead Form Ads
- Paste Ridhzo's webhook URL and key into your Google Ads lead form extension.
- Leads (including test pings) arrive instantly; campaign/ad-group attribution is preserved.

**Use case:** An education institute running Google Search ads for "MBA admission" captures every form lead directly into the counsellor pipeline.

### 3. Hosted Web Forms (no website needed)
- Build a form with the **visual field editor** — any field, including custom fields.
- **Multi-step forms** (up to 10 steps) to reduce drop-off.
- Share as a **public link** (for Instagram bio, WhatsApp status, QR codes, flyers) or **embed** on any website (WordPress, Elementor, Webflow, Wix, Squarespace, Shopify, plain HTML) with one copy-paste iframe code.
- Spam-protected and rate-limited; UTM parameters are captured for attribution.
- "Powered by Ridhzo" badge on Free plan; removed on paid plans.

**Use case:** A gym puts a QR code at its front desk → "Free trial class" form → every walk-in enquiry becomes a lead with a follow-up.

### 4. Website Webhook (custom forms & tools)
- A unique, signed webhook URL for your existing website forms or any tool (Zapier, Make, Pabbly, WordPress plugins, landing-page builders).
- Send JSON; Ridhzo maps name, email, phone, company and puts everything else into custom data.
- Optional HMAC signature verification for security.

**Use case:** A clinic's existing WordPress contact form posts to the Ridhzo webhook; appointment requests appear as leads instantly.

### 5. REST API
- Create and read leads programmatically with an API key (`POST /api/v1/leads`). See [Integrations, API & Webhooks](18_INTEGRATIONS_API_WEBHOOKS.md).

### 6. CSV / Excel Import
- Upload a CSV, **map columns** to Ridhzo fields (including custom fields), **preview/simulate** the import to see what will be created or skipped, then commit.
- Enhanced validation safeguards, automated budget extraction, and duplicate detection during import ensure bad records don't corrupt your database.

**Use case:** An insurance advisor moves 2,000 old contacts from Excel into Ridhzo in five minutes without corrupting existing records.

### 7. Manual Entry & Quick Add
- Global **Quick Add** button from any screen: name, phone (with country code), email, optional company, owner, custom fields.
- **Works offline** — saved on the device with version claiming and synced automatically with conflict detection when internet returns.

**Use case:** An agent at a property expo adds 40 walk-in visitors on their phone with patchy network — none are lost or overwritten.

### 8. Android Device Call Sync & Smart Missed-Calls
- **Automatic Android Call Logging:** Reps install the Ridhzo Android app; calls made, answered, or missed are synced automatically with timestamps and exact talk durations.
- **Caller ID Directory:** Ridhzo pre-downloads active lead phone keys to the rep's phone. When a lead calls, the rep sees the caller's lead name instantly before picking up.
- **Smart Missed-Call Alerts:** If a lead calls a rep and the rep misses it, the rep's phone already displayed the native missed-call alert. Ridhzo smartly suppresses redundant duplicate push alerts to that phone while logging the missed call on the timeline and triggering team automations.
- **Telephony Webhook Integration:** Connect virtual telephony numbers (Exotel, Knowlarity, Twilio, etc.) to Ridhzo's missed-call webhook. Missed calls automatically trigger instant WhatsApp replies so no inbound enquiry goes cold.

### 9. Inbound Email → Lead Timeline
- Email replies from leads are logged automatically on their timeline and can trigger automations (configured in **Settings → Lead Intelligence**).
- **Auto-Reply & OOO Filtering:** Inbound webhook intelligently filters out auto-replies, out-of-office (OOO) messages, and bounce notifications.
- **Deduplication:** Prevents duplicate timeline activities if an inbound email is retried or delivered across multiple aliases.

### Coming soon
- **LinkedIn Lead Gen Forms** (Coming soon)
- **WhatsApp inbound as a lead source** — new WhatsApp conversations creating leads automatically (Coming soon)

## Smart processing on every lead
| Step | What happens |
|---|---|
| Field mapping | Standard + custom fields mapped automatically from every source |
| Phone normalisation | Fast trigram (`pg_trgm`) index matches numbers in any format (+91 98765 43210, 9876543210) instantly |
| Duplicate check | Same phone/email → flagged or auto-merged (optional auto-merge) |
| Call & Activity sync | Device calls, audio logs, and message history linked to matching lead record |
| Attribution | Source, form, campaign and UTM data saved |
| Enrichment (optional) | Fill missing details from your data provider |
| Assignment | Round-robin / capacity / rules / automation |
| Alerts | High-priority push channels, in-app with sound, email, WhatsApp |
| Automations | "Lead created" or "Call logged" workflows run instantly |

## Why it matters
- **Speed:** leads are in your hand seconds after they submit — not the next morning from a spreadsheet.
- **Zero manual logging:** Android call sync automatically records talk time and calls without reps typing notes.
- **Nothing lost:** no copy-paste from Facebook Lead Center, no forgotten email enquiries, no missed calls ignored.
- **Clear ROI:** you know exactly which source and campaign produced each lead, each call, and each sale.

## Plan limits
Free: 1 source · Starter: 5 sources · Unlimited: unlimited sources. (Device call sync is available on all plans).

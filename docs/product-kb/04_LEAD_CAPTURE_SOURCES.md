# Lead Capture & Lead Sources

## What it is
Ridhzo pulls leads from every channel into **one inbox**, automatically, in seconds. Every source runs through the same pipeline: **receive → clean & map fields → check duplicates → create lead → assign → alert → run automations.**

Managed at **Settings → Lead Sources**. Each source shows live stats (leads received, last lead time, status) and can be paused or removed safely.

## Supported sources

### 1. Facebook & Instagram Lead Ads
- **Connect in one click** with Facebook login; choose your Page(s).
- New leads arrive **within seconds** of form submission (real-time webhook).
- **Choose which forms** to import (form-level filter).
- **Sync Past Leads** — backfill leads you received before connecting.
- Automatic field mapping: name, email, phone, plus every custom form question saved on the lead ("What they told you in the form").
- **Automatic token refresh** and outage recovery — if Facebook access expires, Ridhzo warns you and can replay missed leads once reconnected.
- Supports Meta data-deletion and deauthorization requirements.

**Use case:** A real-estate developer runs 6 lead ads across 2 Pages. All leads land in Ridhzo, tagged with their form/campaign, and are round-robined to 4 sales reps who get a push notification instantly.

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
- Duplicate handling during import.

**Use case:** An insurance advisor moves 2,000 old contacts from Excel into Ridhzo in five minutes.

### 7. Manual Entry & Quick Add
- Global **Quick Add** button from any screen: name, phone (with country code), email, company, owner, custom fields.
- **Works offline** — saved on the device and synced automatically when internet returns.

**Use case:** An agent at a property expo adds 40 walk-in visitors on their phone with patchy network — none are lost.

### 8. Missed-Call → Instant WhatsApp
- Connect any telephony provider (Exotel, Knowlarity, Twilio, etc.) to Ridhzo's missed-call webhook.
- When a customer's call is missed, Ridhzo matches the caller to a lead and **auto-sends a WhatsApp** so the enquiry is followed up immediately; the event is logged on the lead's timeline.

### 9. Inbound Email → Lead Timeline
- Email replies from leads can be logged automatically on their timeline, and can trigger automations (set in **Settings → Lead Intelligence**).

### Coming soon
- **LinkedIn Lead Gen Forms** (Coming soon)
- **WhatsApp inbound as a lead source** — new WhatsApp conversations creating leads automatically (Coming soon)

## Smart processing on every lead
| Step | What happens |
|---|---|
| Field mapping | Standard + custom fields mapped automatically from every source |
| Phone normalisation | Numbers in any format (+91 98765 43210, 9876543210) are matched correctly |
| Duplicate check | Same phone/email → flagged or auto-merged (optional auto-merge) |
| Attribution | Source, form, campaign and UTM data saved |
| Enrichment (optional) | Fill missing details from your data provider |
| Assignment | Round-robin / capacity / rules / automation |
| Alerts | Push, in-app with sound, email, WhatsApp |
| Automations | "Lead created" workflows run instantly |

## Why it matters
- **Speed:** leads are in your hand seconds after they submit — not the next morning from a spreadsheet.
- **Nothing lost:** no copy-paste from Facebook Lead Center, no forgotten email enquiries.
- **Clear ROI:** you know exactly which source and campaign produced each lead and each sale.

## Plan limits
Free: 1 source · Starter: 5 sources · Unlimited: unlimited sources.

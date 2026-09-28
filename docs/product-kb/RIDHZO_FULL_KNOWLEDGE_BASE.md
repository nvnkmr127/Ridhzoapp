# Ridhzo Product Knowledge Base

This folder is the single source of truth about **Ridhzo CRM**, written for:

- **AI training / AI assistants** (chatbots, sales bots, support bots, content generators)
- **Website building** (landing pages, feature pages, pricing page, FAQ)
- **Product explanation** (sales demos, onboarding, investor/partner decks)

Every file describes features that exist in the product today. Anything not yet live is clearly marked **(Coming soon)**. Prices are in Indian Rupees (₹) and exclude 18% GST.

## Files

| # | File | What it covers |
|---|------|----------------|
| 01 | [Product Overview](01_PRODUCT_OVERVIEW.md) | What Ridhzo is, who it's for, the core promise, differentiators, call tracking, mobile-first design |
| 02 | [Pricing & Plans](02_PRICING_AND_PLANS.md) | Free / Starter / Unlimited, limits, trial, yearly, INR default & dynamic currency, AI credits |
| 03 | [Getting Started & Ease of Use](03_GETTING_STARTED_EASE_OF_USE.md) | Signup to first lead in minutes, native mobile app, mobile OTP, call sync, support tickets |
| 04 | [Lead Capture & Sources](04_LEAD_CAPTURE_SOURCES.md) | Facebook/Instagram, Google Ads, web forms, website webhook, API, CSV, manual, missed calls, Android call sync |
| 05 | [Leads Management](05_LEADS_MANAGEMENT.md) | Fast leads table with lead scores, configurable lead fields, search, filters, saved views, bulk actions, tags, duplicates, recycle bin & purge |
| 06 | [Lead Profile](06_LEAD_PROFILE.md) | Streamlined header (owner, stage, tags), live Next Best Action, 1-click AI suggestions, call metrics & audio, activity timeline |
| 07 | [Pipeline & Statuses](07_PIPELINE_AND_STATUSES.md) | Kanban board, custom statuses with AI context & stage playbooks, win/loss |
| 08 | [Assignment & New-Lead Alerts](08_ASSIGNMENT_AND_ALERTS.md) | Round-robin, capacity, teams, high-priority mobile push channels, smart missed-call deduplication |
| 09 | [Messaging: WhatsApp, Email, Content Sharing](09_MESSAGING.md) | One-tap WhatsApp, Business API (Watxio/Meta Cloud API), custom reply-to email, templates, campaigns, tracked links |
| 10 | [Follow-ups & Reminders](10_FOLLOW_UPS.md) | Follow-up domain, call auto-completion, callback pile-up prevention, calendar, overdue escalation |
| 11 | [Meetings & Booking Page](11_MEETINGS_AND_BOOKING.md) | Site visits, online meetings, check-in, public booking link, Google Calendar |
| 12 | [Automations](12_AUTOMATIONS.md) | WHEN → IF → THEN workflows, call.logged trigger, serverless resilience |
| 13 | [Sequences (Drip Campaigns)](13_SEQUENCES.md) | Multi-step WhatsApp/email follow-up, AI-drafted, flexible tokens |
| 14 | [AI Features](14_AI_FEATURES.md) | Unified lead-context engine, live Next Best Action, 1-click field fills & status change, status playbooks, AI Assistant |
| 15 | [Dashboards & Insights](15_DASHBOARDS_AND_INSIGHTS.md) | My Dashboard, Executive Dashboard, Insights, call metrics & answer rates, org currency formatting |
| 16 | [Notifications, Mobile & Offline](16_NOTIFICATIONS_MOBILE_OFFLINE.md) | Native Android app, mobile OTP, device call sync, caller ID directory, incremental offline sync with conflict detection |
| 17 | [Team, Roles & Security](17_TEAM_ROLES_SECURITY.md) | Users, invites with soft-delete accounting, least-privilege roles, audit log, support tickets, mobile token revocation |
| 18 | [Integrations, API & Webhooks](18_INTEGRATIONS_API_WEBHOOKS.md) | REST API, mobile endpoints & Idempotency-Key, Android call sync API, CAPI test ping, webhooks |
| 19 | [Industry Use Cases](19_INDUSTRY_USE_CASES.md) | Real-world playbooks by industry including call tracking and AI guidance |
| 20 | [FAQ](20_FAQ.md) | Common questions from buyers and users including Android call sync, offline sync, and AI features |
| 21 | [Website Copy Kit](21_WEBSITE_COPY_KIT.md) | Headlines, taglines, feature blurbs, CTAs, SEO keywords |
| 22 | [Mobile App](22_MOBILE_APP.md) | Native Android app, call tracking, Caller ID directory, offline sync, 1-click AI suggestions |

## Rules for any AI using this knowledge base

1. **Product name:** "Ridhzo" (app name "Ridhzo CRM"). Never call it anything else.
2. **Do not invent features, integrations or prices.** If it is not in these files, say "I'm not sure — please contact the Ridhzo team."
3. **Prices:** Free ₹0, Starter ₹249/month, Unlimited ₹449/month. Yearly = 10× monthly (2 months free). GST extra. Default currency is Indian Rupees (INR / ₹) with dynamic organization currency configuration.
4. **Tone:** simple, friendly, practical. Our buyers are business owners and sales teams, often on their phone. Avoid jargon.
5. **Items marked (Coming soon)** must never be described as available.
6. Ridhzo is **lead-focused and mobile-first**: it is built to capture, respond to, auto-track calls, and convert leads fast — not a heavy enterprise CRM.

---

# Ridhzo — Product Overview

## One-line summary
**Ridhzo is a simple, mobile-first lead CRM that captures every lead automatically, alerts you instantly, and lets you reply on WhatsApp in one tap — so no lead goes cold.**

Official short description: *"Lead capture, instant alerts, and one-tap messaging."*

## The problem Ridhzo solves
Small businesses and sales teams spend money on Facebook ads, Google ads, websites and referrals — then lose most of those leads because:

- Leads sit in Facebook Lead Center, Google sheets, email inboxes and WhatsApp chats — **scattered everywhere**.
- Nobody calls back fast enough. A lead contacted in the first 5 minutes is far more likely to convert than one contacted after an hour.
- Follow-ups are forgotten. Most sales need 5+ touches; most reps stop after 1 or 2.
- Owners have no idea which ad, which source or which salesperson is actually bringing money.
- Big CRMs (Salesforce, Zoho, HubSpot) are too complex, too expensive and not built for the phone.

## The Ridhzo solution — the lead journey
Ridhzo follows one lead from the first click to the closed deal:

1. **Capture** — Leads flow in automatically from Facebook & Instagram Lead Ads, Google Lead Form Ads, website forms, your own hosted forms, any tool via webhook/API, CSV import, missed calls, Android device call sync, or quick manual entry.
2. **Clean** — Duplicates are detected by phone/email and can be merged automatically.
3. **Route** — The lead is assigned to the right person instantly (round-robin, capacity-based, team rules, or automations).
4. **Alert** — The owner gets a high-priority push notification on their phone, an in-app alert with sound, email, or WhatsApp alert within seconds.
5. **Respond & Call** — One tap opens WhatsApp, a phone call, or email with a ready-made, personalised template. On Android, all sales calls, talk time, and outcomes are synced automatically with zero manual logging.
6. **Follow up & Guide** — Live Next Best Action and 1-click AI suggestions guide the rep on the next milestone, auto-complete follow-ups upon answered calls, and trigger automatic drip sequences.
7. **Automate** — WHEN → IF → THEN automations do the repetitive work (assign, change status, send WhatsApp, schedule follow-up, react to `call.logged`, enroll in sequence).
8. **Convert & measure** — Pipeline board, win/loss, dashboards and insights show what is working — by source, by rep, by stage, with call answer rate metrics and revenue tracking in your chosen currency.

## Who Ridhzo is for
- **Solo professionals:** real-estate agents, insurance advisors, financial planners, consultants, coaches, freelancers.
- **Small & growing sales teams (2–50 people):** real-estate developers & brokers, education/coaching institutes, clinics, gyms, interior designers, solar installers, travel agencies, car dealers, loan DSAs.
- **Marketing agencies:** who run ads for clients and need to deliver leads to them (agency clients can even be given a complimentary plan).
- **Any business running lead-gen ads** on Facebook, Instagram or Google.

Built first for India (₹ INR default pricing, multi-currency settings, Razorpay payments, GST invoices, WhatsApp-first, Hindi & Telugu app language), and works anywhere.

## Core value propositions
| Promise | How Ridhzo delivers it |
|---|---|
| **Never miss a lead** | All sources in one inbox, instant push alerts, offline capture, missed-call auto-WhatsApp |
| **Reply & call in seconds** | One-tap WhatsApp/call/email, auto-filled templates, AI reply drafts, automatic Android call logging |
| **Caller ID on every call** | Pre-cached lead phone keys identify incoming lead callers right on the rep's phone |
| **Never forget a follow-up** | Reminders, calendar, overdue escalation, auto-complete on answered calls, automatic drip sequences |
| **Work from your phone** | Native Android app & PWA, offline incremental sync with conflict detection, push channels |
| **Know what's working** | Dashboards, call answer rates, source ROI, rep leaderboard, win rate, pipeline health grade |
| **Affordable & simple** | Free forever plan; paid plans from ₹249/month; set up in minutes, no training needed |

## Key differentiators (vs. generic CRMs)
1. **Lead-first, not contact-database-first.** Every screen is about moving a lead forward today. Company fields are optional so B2C/consumer workflows stay fast and uncluttered.
2. **Automatic Android call sync.** Calls made, received, and missed on reps' phones are tracked automatically with duration and timestamps — no rep forgets to log calls.
3. **WhatsApp-native.** One-tap personal WhatsApp for free, or official WhatsApp Business API for automation, templates, campaigns and sequences.
4. **Speed-to-lead built-in.** Auto-assignment + high-priority mobile push channels + one-tap reply.
5. **Real AI intelligence with 1-click apply.** Unified lead-context engine powers live Next Best Action, 1-click field filling, stage transitions, and stage-specific playbooks.
6. **Field-sales ready.** Meetings, site visits, GPS check-in, public booking page, and conflict-safe offline sync.
7. **Priced for small businesses.** ₹249/month for Starter; unlimited users and leads for ₹449/month.
8. **Multi-language app.** English, Hindi, Telugu.

## Product map (main screens)
| Area | Screen | Purpose |
|---|---|---|
| Home | Executive Dashboard | Business overview for owners/managers |
| Home | My Dashboard | Personal daily workload for each rep |
| CRM | Leads | High-speed table with lead scores, configurable fields, filters, bulk actions |
| CRM | Pipeline (Kanban) | Drag leads through stages with stage playbooks |
| CRM | Hot Leads | Leads most likely to convert right now |
| CRM | Going Cold | Leads with no contact for 14+ days |
| CRM | Duplicates | Find and merge duplicate leads |
| CRM | Recycle Bin | Restore deleted leads within 30 days or purge permanently |
| Productivity | Follow-ups (list + calendar) | Tasks and reminders with call auto-completion |
| Productivity | Meetings | Scheduled meetings & site visits with GPS check-in |
| Productivity | Automations | Rule-based workflows (including call.logged) |
| Productivity | Sequences | Automatic multi-step follow-ups |
| Productivity | AI Assistant | Chat-based CRM helper |
| Analytics | Insights | Deep analytics, call metrics, and forecasts |
| Settings | 15+ settings areas | Sources, lead fields config, users, roles, templates, email, billing, API, webhooks, alerts, meetings, integrations, support tickets, audit log |

## Technology & reliability (plain language)
- Native Android app (APK / Expo) and modern web app; works in any modern browser.
- Offline-first mobile sync with incremental synchronization, version claiming, and conflict detection.
- Each business's data is fully isolated from others (multi-tenant isolation on every query).
- Background job queue system guarantees reliable webhook delivery, push notifications, and automation execution across serverless environments.
- Passwords are hashed; email passwords, API secrets, and tokens are encrypted (AES-256-GCM).
- Redis-backed deduplication prevents duplicate notifications during rapid mobile network reconnections.
- Complete audit log of who changed what.

---

# Pricing & Plans

Ridhzo has three simple plans. All standard prices are in Indian Rupees (INR / ₹), **exclusive of 18% GST**. Multi-currency / dynamic organization currency settings are supported. GST invoices are generated for every payment (add your GSTIN in Billing settings).

## Plan summary

| | **Free** | **Starter** | **Unlimited** |
|---|---|---|---|
| **Monthly price** | ₹0 forever | **₹249 / month** | **₹449 / month** |
| **Yearly price** | — | ₹2,490 / year (2 months free) | ₹4,490 / year (2 months free) |
| **Best for** | Individuals getting started | Solo agents & growing teams | Teams that want no limits |
| Team members (seats) | 1 | 3 | Unlimited |
| Leads | 300 | 5,000 | Unlimited |
| Lead sources (Facebook, Google, forms, webhooks, Android sync) | 1 | 5 | Unlimited |
| Automations | 2 | 15 | Unlimited |
| Sequences (drip campaigns) | 1 | 10 | Unlimited |
| AI credits per month | 15 | 300 | 2,000 |
| AI auto-tagging & 1-click suggestions | — | ✓ | ✓ |
| "Powered by Ridhzo" on hosted web forms | Shown | Removed | Removed |
| Lead list, table scores, pipeline, follow-ups, meetings, templates, dashboards, mobile app, Android call sync, offline sync, push alerts | ✓ | ✓ | ✓ |

> Core features — lead inbox, table lead scores, pipeline, follow-ups, reminders, one-tap WhatsApp, templates, dashboards, the mobile app, Android device call sync, offline incremental sync, and push notifications — are available on **every plan, including Free**. Plans differ by **volume limits** (seats, leads, sources, automations, sequences, AI credits) and branding.

## Free trial
- Every new workspace starts with a **14-day free trial of Starter** — no card needed to sign up.
- When the trial ends, the workspace moves to **Free** automatically unless you subscribe. **No data is deleted.**

## Team seats calculation
- Seats are counted only for **active users** and **pending active invitations**.
- Deactivated and soft-deleted team members are excluded, so you never pay for past employees.

## What is an AI credit?
One AI credit = one AI generation via `consumeAiCredit`: drafting a reply, summarizing a lead, generating a sequence, 1-click field suggestion, or one AI Assistant turn. Credits reset on the 1st of each month. If an AI call fails, the credit is refunded automatically and you get a standard fallback instead.

## What happens at a limit?
- You get a clear message ("Your plan allows 300 leads. Upgrade to add more.") and an **Upgrade** button.
- Nothing already in your account is deleted. Deleted leads in the Recycle Bin do not count towards active lead quotas.
- If you downgrade and have more automations/sequences than the new plan allows, the **oldest ones keep running** and the rest are paused until you upgrade again.

## Payments & billing
- Pay securely with **Razorpay** (UPI, cards, net banking).
- Monthly or yearly subscriptions; switch plans any time.
- **Coupons / discount codes** supported at checkout.
- **Cancel any time** — you keep your paid plan until the end of the paid period, then move to Free.
- If a payment fails, you get a **grace period** with reminders before the account is downgraded.
- **Agency / complimentary plans:** Ridhzo can grant a paid plan free of charge (e.g., to an agency's client) for a set period; after that the customer can choose to subscribe.

## Value comparison (for sales conversations)
- A single converted lead usually pays for a full year of Ridhzo.
- ₹249/month ≈ **₹8/day** for a 3-person team.
- ₹449/month for **unlimited users** — compared to per-user pricing of most CRMs (often ₹1,000–₹5,000 per user per month).

## Which plan should I choose?
- **Just me, testing it out, < 300 leads:** Free.
- **Me + up to 2 teammates, running ads, up to 5,000 leads:** Starter.
- **A team of 4+, or high lead volume, or many ad accounts/forms:** Unlimited.

## Pricing FAQ
**Is there a setup fee?** No.
**Is there a contract?** No. Monthly plans can be cancelled any time.
**Do I lose my data if I downgrade?** No. Your leads, history and settings stay.
**Can I get a refund?** Contact the Ridhzo team; cancellation stops the next renewal.
**Is GST included?** No, 18% GST is added and shown on your invoice.
**Are currencies configurable?** Yes, while defaults are in INR (₹), workspace currency settings support your preferred operational currency.
**Do WhatsApp Business API message fees apply?** Official WhatsApp Business API conversations are billed directly by Meta/your WhatsApp provider (e.g. Watxio) with no arbitrary CRM markup credits. Personal one-tap WhatsApp is completely free.

---

# Getting Started & Ease of Use

## How easy is Ridhzo?
Ridhzo is designed so a busy business owner can go from signup to receiving their first real lead **in under 10 minutes**, without training, IT help or a consultant.

- **No setup fee, no implementation project.**
- **Works on your phone** — install it like an app from the browser.
- **Plain language** everywhere — "New-lead alerts", "Going Cold", "Follow-ups", not CRM jargon.
- **Smart defaults** — statuses, templates and automation templates are ready from day one.
- **App language:** English, Hindi (हिन्दी) or Telugu (తెలుగు).

## Setup in 5 steps

### 1. Sign up (1 minute)
Sign up with email & password or **Google**. Mobile phone number + OTP login is also supported (via SMS/Watxio). Your workspace starts on a **14-day Starter trial**.

### 2. Connect a lead source (2–3 minutes)
Go to **Settings → Lead Sources** and pick one:
- **Facebook / Instagram Lead Ads** — click Connect, log in to Facebook, choose your Page. Done. New leads arrive in seconds. You can also **Sync Past Leads**.
- **Google Lead Form Ads** — copy the webhook URL + key into your Google Ads lead form.
- **Hosted web form** — build a form in the visual editor, share the link or paste the embed code into your website.
- **Android Call Sync** — install the Android app and grant call-log permissions so phone calls automatically sync with leads.
- **Website webhook / API** — for developers or tools like Zapier/Make/Pabbly.
- **CSV import** — upload your existing leads from Excel/Google Sheets.

### 3. Invite your team (1 minute)
**Settings → Users** → invite by email. Choose a role (Admin, Member, or a custom role).

### 4. Turn on auto-assignment & alerts (1 minute)
- Enable round-robin so each new lead goes to the next available rep.
- Allow **push notifications** on your mobile app so you hear about every lead instantly on dedicated high-priority channels.
- Optional: set **New-lead alerts** to email/WhatsApp managers or partners.

### 5. Set up your first templates & automation (2 minutes)
- Edit the ready-made WhatsApp/email templates ("Hi {{first_name}}, thanks for your enquiry…").
- Pick an **automation template** (e.g., "New lead → assign round-robin → schedule follow-up tomorrow" or "Call logged → auto-complete follow-up").

That's it. Every new lead now lands in Ridhzo, gets assigned, alerts the owner, and has a follow-up scheduled.

## A typical day in Ridhzo (sales rep)
1. Phone buzzes: *"New lead: Priya Sharma — 2BHK enquiry (Facebook)"*.
2. Tap the notification → lead profile opens → tap **WhatsApp** → template pre-filled with Priya's name → send. (Under 30 seconds.)
3. Or tap **Call** → make the call from your Android phone → Ridhzo automatically logs the call, duration, and answered status, and auto-completes any pending follow-up.
4. Review **AI Suggestions** on the lead profile: 1-click update status to *Qualified* and 1-click fill budget field from the call notes.
5. Open **My Dashboard** each morning: today's follow-ups, overdue tasks, new leads, meetings, and call answer rates.
6. Before leaving for a site visit, open the meeting → **Check in** with GPS on arrival → record outcome after.

## A typical week (owner/manager)
- **Executive Dashboard:** leads this week, conversion rate, revenue by source, call answer rates, pipeline.
- **Going Cold:** one click "Escalate all to High" to push neglected leads back into priority.
- **Insights:** which source gives the best win rate, which rep is closing, pipeline health grade.
- **Audit log:** who changed or deleted what.

## Ease-of-use features
| Feature | Why it makes life easier |
|---|---|
| **Quick Add** (global "+" button) | Add a lead from any screen in seconds, even offline with automatic conflict detection |
| **Command palette / global search** (Ctrl/⌘ + K) | Find any lead by name, phone (trigram search in any format), or email instantly |
| **One-tap actions** | Call, WhatsApp, SMS, email with one tap from the lead card |
| **Caller ID on Android** | Incoming lead calls display caller identity directly using pre-cached lead keys |
| **Automatic Call Logging** | Android device sync logs talk duration, answer status, and timestamps without manual input |
| **Live Next Best Action** | Real-time stream recommending the single next move to progress each lead |
| **1-Click AI Suggestions** | Auto-populate fields and update stage transitions with a single tap |
| **Saved views** | Save your favourite filters ("My hot leads from Facebook") |
| **Bulk actions** | Assign, tag, change status, message or export hundreds of leads at once |
| **Templates with auto-fill** | {{first_name}}, {{phone}}, custom fields filled automatically |
| **AI drafts** | Get a ready-to-send reply in the lead's language |
| **Automation templates** | Start from proven workflows instead of a blank screen |
| **Offline mode** | Leads added/edited without internet are saved and synced safely with version conflict protection |
| **Native mobile app & PWA** | Native Android APK or home-screen app with high-priority notification channels |
| **In-app Support Tickets** | File and track support requests directly inside Settings → Support |

## Support & onboarding
- In-app empty states tell you exactly what to do next ("Connect Facebook ads or your website so new leads land here automatically — or add one by hand to try it out.").
- **In-app Support Ticket Management:** Create, track, and manage support tickets right from Settings → Support, handled directly by the Ridhzo team.

---

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
- Global **Quick Add** button from any screen: name, phone (with country code), email, optional company, owner, custom fields.
- **Works offline** — saved on the device with version claiming and synced automatically with conflict detection when internet returns.

**Use case:** An agent at a property expo adds 40 walk-in visitors on their phone with patchy network — none are lost or overwritten.

### 8. Android Device Call Sync & Smart Missed-Calls
- **Automatic Android Call Logging:** Reps install the Ridhzo Android app; calls made, answered, or missed are synced automatically with timestamps and exact talk durations.
- **Caller ID Directory:** Ridhzo pre-downloads active lead phone keys to the rep's phone. When a lead calls, the rep sees the caller's lead name instantly before picking up.
- **Smart Missed-Call Alerts:** If a lead calls a rep and the rep misses it, the rep's phone already displayed the native missed-call alert. Ridhzo smartly suppresses redundant duplicate push alerts to that phone while logging the missed call on the timeline and triggering team automations.
- **Telephony Webhook Integration:** Connect virtual telephony numbers (Exotel, Knowlarity, Twilio, etc.) to Ridhzo's missed-call webhook. Missed calls automatically trigger instant WhatsApp replies so no inbound enquiry goes cold.

### 9. Inbound Email → Lead Timeline
- Email replies from leads can be logged automatically on their timeline, and can trigger automations (set in **Settings → Lead Intelligence**).

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

---

# Leads Management

## What it is
The **Leads** hub is where your team finds, sorts and works every lead. It is built for speed on both desktop and phone, and scales smoothly to tens of thousands of leads.

## Key capabilities

### Lead list
- **Faster-to-scan table:** Streamlined layout showing lead name, contact icons, source, stage, owner, **lead score badge directly in table**, next follow-up, and tags.
- **Server-side search with trigram indexing (`pg_trgm`):** Ultra-fast phone matching across any format (`9876543210`, `+91 98765 43210`, `98765 43210`), plus instant search by name, email, or company.
- **Sort:** By newest, last updated, name, status, owner, next follow-up, or score.
- **High-performance pagination:** Cursor-based and offset pagination ensuring instant page transitions even with tens of thousands of leads.

### Advanced filters
- Filter by **status, owner, team, source, tags, dates, score and any custom field**.
- Operators: equals, not equals, contains, does not contain, is empty, is not empty, before, after, between, greater than, less than.
- Combine conditions with **AND / OR**.
- Active filters shown as chips — remove one or clear all.
- Mobile-friendly filter drawer.

### Saved views
- Save any combination of search + filters + sort as a named view ("Facebook leads this week", "My untouched leads").
- Ready-made default views plus your own custom ones, shared across the workspace.

### Smart segments
One-tap segments that surface what needs attention: **hot leads**, **high-value deals at risk**, **unassigned new leads**, **stale high-priority deals**.

### Bulk actions (select up to hundreds at once)
- Assign / reassign owner
- Change status
- Add tags
- Send a WhatsApp **campaign** (up to 500 leads per send)
- Export to CSV
- Delete (to recycle bin) or purge (permanent deletion for authorized admins)

### Tags
- Unlimited free-form tags (e.g., "2BHK", "Budget 50L+", "Webinar-Sept").
- Tags can trigger automations ("Tag added: VIP → assign to senior rep").
- AI can auto-tag incoming replies (paid plans).

### Configurable Lead Fields (`Settings → Lead Fields`)
Admins have complete control over lead fields across the organisation:
- **Field visibility:** Toggle on/off standard fields (e.g. company, alternate phone) to keep forms and cards uncluttered. Note: the `company` field is completely optional and no longer requireable by default.
- **Required fields:** Designate mandatory fields for lead creation or stage progression.
- **Field ordering:** Reorder fields to match your sales reps' exact qualification flow.
- **Default values & validation:** Set standard fallback values and format checks.

### Custom fields
Capture the details that matter to *your* business. 10 field types:

| Type | Example |
|---|---|
| Text | Preferred location |
| Long text | Requirements |
| Number | Family size |
| Currency | Budget (defaults to ₹ INR, configurable per organization; stored as a clean number for summing and sorting) |
| Date | Expected move-in date |
| Date & time | Callback time |
| Dropdown (single) | Property type: Apartment / Villa / Plot |
| Multi-select | Interested courses |
| Checkbox | Loan required? |
| URL | LinkedIn profile |

Custom fields can be grouped into tabs, used in filters, web forms, imports, mobile app sync, API, and automations.

### Hot Leads (`Leads → Hot`)
Leads with the highest **lead score** surface automatically. The score calculates status stage, profile completeness, recent interactions, call durations, activity volume, and WhatsApp engagement, and decays over time if a lead goes quiet.

### Going Cold (`Leads → Cold`)
An automatic safety net: open leads with **no contact for 14+ days** (or never contacted 14 days after arriving).
- Shows how long each lead has been silent ("last contact 24 days ago" / "added 18 days ago, never contacted").
- One-tap **WhatsApp re-engagement message** and **click-to-call**.
- **"Escalate all to High"** — one click raises all cold leads to high priority and logs it on each lead.
- Cold leads get a suggested **4-step win-back plan** (WhatsApp → call → email → special offer).

### Duplicates (`Leads → Duplicates`)
- Finds leads sharing the same phone or email.
- **Merge** in one click — notes, activities, call logs, follow-ups, messages and tags are combined into one record.
- Optional **auto-merge** for new incoming duplicates.

### Recycle Bin & Lead Purge (`Leads → Recycle Bin`)
- Deleted leads are kept in the Recycle Bin for **30 days** and can be restored with one click.
- Deleted leads do not count towards plan lead limits.
- **Lead Purge:** Authorized admins with purge permission can permanently delete leads (either individually or in bulk via the purge endpoint) for strict data hygiene and privacy compliance.

### Export
Export all or filtered leads to CSV (permission-controlled).

## Real use cases
- **Morning triage:** A manager opens the saved view "Unassigned – today", bulk-assigns 25 leads across 3 reps in 10 seconds.
- **Campaign follow-up:** Filter "Source = Diwali Offer form AND Status = New", bulk-send a WhatsApp campaign with the offer brochure.
- **Clean-up:** A team that imported 3 spreadsheets merges 180 duplicates in minutes.
- **Mistake recovery:** A rep accidentally deletes a lead; the admin restores it from the Recycle Bin.

## Why it matters
- Reps spend time talking to leads, not hunting for them.
- Managers can see and act on the whole pipeline in seconds.
- No lead is lost to duplicates, deletions or silence.

---

# Lead Profile

## What it is
Every lead has one dedicated page that holds **everything** about them — contact details, form responses, every call and conversation, AI guidance, tasks, meetings, files, and next steps. Open it and you know the full story in 5 seconds.

## What's on the lead profile
| Section | What you see / do |
|---|---|
| **Organised Header** | Name, phone, email, priority, lead score badge, and source. Below it, **Owner, Stage, and Tags are organised in one clean labelled row** for instant recognition. |
| **One-tap actions** | Call, WhatsApp, SMS, Email — pre-filled with your templates. On Android, calls are auto-logged. |
| **Status & owner controls** | Change status or reassign in one tap (full history is recorded). |
| **Live Next Best Action (NBA)** | Real-time live recommendation of the immediate next move (e.g. "Send site visit brochure", "Call to confirm budget", "Close deal") updating automatically without full-page polling. |
| **1-Click AI Suggestions** | Smart suggestions panel powered by full lead context: **1-click fill missing fields**, **1-click change status**, and **next action apply**. |
| **Status Playbooks** | Stage-specific guidance showing key qualification questions, recommended talk tracks, and milestone checklists for the lead's current stage. |
| **Call Metrics & History** | Total calls, call answer rate %, total duration, timestamps, and audio playback/transcripts. Answered calls automatically complete matching scheduled follow-ups. |
| **"What they told you in the form"** | All original answers from the ad or web form. |
| **Configurable & custom fields** | Your business-specific fields, editable inline. Company field is optional. |
| **Activity timeline** | Chronological feed of every note, device call log, WhatsApp chat, email, status change, assignment, meeting, and system event. |
| **WhatsApp conversation** | Threaded chat view with delivery/read status (Business API mode). |
| **Follow-ups** | Upcoming and past reminders; auto-completes on answered calls or contact logs. |
| **Meetings** | Scheduled meetings/site visits, GPS check-in, and recorded outcomes. |
| **Sequences** | Which drip sequences the lead is enrolled in; enroll or pause in one tap. |
| **Attachments** | Upload and view files (quotes, ID proofs, brochures, call audio recordings). |
| **Shared content** | Tracked links/brochures you shared and whether the lead opened them. |
| **AI summary** | One-click AI brief of who the lead is, their requirements, and where things stand. |
| **AI reply draft** | Draft the next WhatsApp/email in a chosen tone and language. |
| **Best time to contact** | When this lead is most likely to answer calls and messages. |
| **Re-engagement plan** | For cold leads — a 4-step win-back schedule. |
| **Audit export** | Full chronological history export of the lead. |

## Mobile App Parity
The Ridhzo mobile app provides full parity with the web Lead Profile:
- View complete lead details, timeline, and custom fields.
- Access live Next Best Action and the mobile AI suggestions endpoint (`/api/mobile/leads/[id]/ai-suggestions`) to apply field updates and status changes with a single tap from your phone.
- Direct click-to-call with automatic background call sync.

## Real use cases
- **Call prep:** Before calling, a rep glances at the header (score 85, Stage: Site Visit Done), checks the live Next Best Action ("Confirm booking token"), and reviews the stage playbook.
- **Automatic call logging:** Rep taps Call → speaks for 6 minutes → hangs up → call log, talk duration, and auto-completion of the pending "Call lead" follow-up are already recorded.
- **AI 1-click update:** Rep opens AI Suggestions → AI notes that the customer mentioned a budget of ₹75 Lakhs on the call → rep taps "Apply" to save the budget field instantly.
- **Handover:** A rep goes on leave; the new owner reads the timeline, call history, and AI summary, continuing the conversation seamlessly.

## Why it matters
- No more "who spoke to this customer last and what did they say?"
- Eliminates manual call and note-taking overhead for sales reps.
- AI suggestions guide reps on the exact right action to close deals faster.
- Consistent, informed conversations across both web and mobile.

---

# Pipeline Board & Lead Statuses

## Pipeline Board (Kanban)
A visual board where each column is a lead status/stage and each card is a lead.

- **Drag and drop** a card to change its status — instantly saved, status history recorded, automations triggered, and real-time live refresh enabled.
- Each column loads leads in batches with **"Load more"**, so the board stays fast even with thousands of leads.
- Cards show name, source, owner, deal value, lead score, and next follow-up.
- Fully responsive on mobile with swipe navigation between stages.

## Custom statuses
Every business sells differently, so statuses are fully customisable in **Settings → General → Statuses**:
- Rename, add, reorder, and colour statuses (e.g., *New → Contacted → Site Visit Booked → Negotiation → Booked → Lost*).
- Each status belongs to a group (open, won, lost) so reports on win rate and conversion work automatically.
- **Loss reasons** — Insights groups lost leads by reason (price, competitor, product fit, ghosted…) based on the notes your team writes, for win/loss analysis.

## AI Lead Context & Stage Playbooks
Custom statuses and their transitions are deeply woven into Ridhzo's unified AI context engine:
- **Status Playbooks:** For each status stage, Ridhzo provides stage-tailored playbooks. When reps open a lead, the playbook provides exact qualifying questions, objection counters, and next milestone criteria for that stage.
- **1-Click AI Status Transitions:** When a rep logs notes or calls, AI analyses the conversation and can suggest moving the lead to the next status stage with a 1-click "Apply" button.
- **Status History in AI Prompts:** AI drafts and summaries factor in the complete history of how long a lead stayed in each stage, identifying stagnant leads or rapid movers.

## Status history
Every status change is stored with who and when — powering funnel velocity ("how many days from Contacted to Booked?"), rep velocity metrics, and conversion reports.

## Real use cases
- **Real estate:** New → Contacted → Site Visit Scheduled → Site Visit Done → Negotiation → Booked / Lost.
- **Education:** Enquiry → Counselling Done → Application Submitted → Fee Paid / Dropped.
- **Clinic:** New → Appointment Booked → Visited → Treatment Started / Not Interested.
- **Status Playbook in action:** An education counsellor opens a lead in "Counselling Done"; the stage playbook lists 3 essential eligibility questions to ask before advancing to "Application Submitted".
- **Manager's weekly review:** Opens the board, sees 40 leads stuck in "Negotiation" — filters by owner to coach the right rep.

## Why it matters
- See your entire sales funnel at a glance.
- Moving a lead is one gesture, not a form.
- AI guides reps on the exact right play for each stage.
- Stage data turns into real insights: bottlenecks, velocity and forecast.

---

# Lead Assignment & New-Lead Alerts

## Automatic assignment
The faster the right person calls, the higher the conversion. Ridhzo assigns every new lead automatically.

| Method | How it works | Best for |
|---|---|---|
| **Round-robin** | Leads go to the next rep in turn — fair and even. Race-safe even when many leads arrive together. | Teams with similar reps |
| **Team-based round-robin** | Rotate within a specific team (e.g., "Hyderabad team", "Telugu-speaking counsellors") | Multi-city or multi-language teams |
| **Capacity-based** | Each rep has a maximum number of active leads; new leads go to whoever has the most free capacity | Preventing overload |
| **Per-source assignment** | Leads from a given source go to a chosen person/team | Different teams per product/campaign |
| **Automation rules** | "IF city = Pune THEN assign to Rahul" — any condition | Territory, product, budget based routing |
| **Manual & bulk** | Reassign one lead or hundreds at once | Managers balancing workload |

Only active users receive leads; deactivated users are skipped automatically. Every assignment is logged on the lead timeline and notifies the new owner.

## New-lead alerts (Settings → New-lead alerts)
Send an alert about each new lead to anyone — **inside or outside** your team:
- **Email** — a clean summary of the lead with a link to open it.
- **In-app notification** to chosen team members.
- **WhatsApp** (with the Business API and an approved template).
- **Conditions:** only alert for certain sources, statuses or custom-field values (e.g., "Budget > ₹1 crore → alert the director").
- **Test** a rule before switching it on; see a **delivery log** for each rule.

## Instant alerts to the owner & sales rep
- **Dedicated High-Priority Mobile Push Channels:** On mobile devices, alerts use high-priority notification channels (New Leads, Calls, Reminders) with sound and badge counts, ensuring immediate delivery even in doze mode.
- **Direct Tap Routing:** Tapping a push notification deep-links straight into that lead's profile, so reps can call or message in one tap without finding the lead in a list.
- **Smart Missed-Call Filtering:** When a lead calls a rep and the rep misses the call, the device OS already shows a native missed-call alert. Ridhzo detects this and suppresses redundant duplicate push alerts to that same device, while keeping the activity logged and alerting other team channels if assigned.
- **Redis Device Registration Deduplication:** Device push tokens are deduplicated via Redis, pruning stale tokens and ensuring network reconnects never cause duplicate notifications.
- **In-app bell** with an alert sound for desktop and web sessions.
- Optional email notifications (each user controls their own preferences).

## Real use cases
- **Speed-to-lead:** Facebook lead arrives at 9:02 PM → assigned to the on-shift rep → high-priority push buzzes phone → rep taps notification → WhatsApp sent at 9:03 PM.
- **Smart Call Alert:** Customer misses rep call; Ridhzo logs the attempt without double-alerting the rep's phone, but triggers an automatic WhatsApp "Sorry we missed your call".
- **Channel partner / agency:** A marketing agency forwards every new lead to its client's sales head by email automatically.
- **VIP escalation:** Leads with budget above a threshold alert the owner on WhatsApp as well as the assigned rep.
- **Fairness:** Reps stop fighting over leads — round-robin is automatic and transparent.

## Why it matters
- Leads are contacted in minutes, not hours.
- Work is spread fairly; no rep is overloaded.
- Clean notification hygiene: reps get alerted to what matters without spam or duplicate buzzes.
- Managers and partners stay informed without logging in.

---

# Messaging: WhatsApp, Email, Templates, Campaigns & Content Sharing

## WhatsApp — two ways to use it

### 1. Personal WhatsApp mode (free, no setup)
- Tap **WhatsApp** on any lead → your own WhatsApp (phone or WhatsApp Web) opens with the chat and a pre-filled, personalised message.
- Also one-tap **Call**, **SMS** and **Email** links.
- Perfect for solo agents and small teams who use their own WhatsApp numbers.
- The message is logged on the lead's timeline.

### 2. WhatsApp Business API mode (automation)
Connect the official WhatsApp Business API (via Ridhzo's WhatsApp integration partners like Watxio or Meta Cloud API with organization tenant ID isolation) to unlock:
- **Send from inside Ridhzo** — conversation view with delivery and read receipts.
- **Incoming replies** land on the lead's timeline and can trigger automations (and AI auto-tagging on paid plans).
- **Approved templates** for messages outside WhatsApp's 24-hour window; free text inside it — Ridhzo picks the right one automatically.
- **Auto-send on new lead** (via automations), **sequences**, **campaigns**, **missed-call auto-reply** and **WhatsApp new-lead alerts**.
- **Direct billing:** Billed directly via Meta/your provider without artificial CRM message credits.

## Message templates (Settings → Templates)
- Create reusable WhatsApp and email templates.
- **Personalisation tokens** filled automatically: `{{first_name}}`, `{{name}}`, `{{phone}}`, `{{email}}`, and any custom field token like `{{custom_field_key}}` (the `{{company}}` token remains available if your team uses it).
- Currency amounts automatically format using your organization's configured currency (e.g. ₹50,000).
- Use templates from the lead profile, bulk campaigns, automations and sequences.
- Example: *"Hi {{first_name}}, thanks for your interest in Green Acres! When is a good time for a quick call?"*

## Bulk WhatsApp campaigns
- Select up to **500 leads** from the list → write one message → send.
- Per-lead failures (no phone, outside the 24-hour window) are counted and never stop the batch.
- In personal mode, a reminder note is logged on each lead to send manually.

## Email (Settings → Email)
- Connect your own **SMTP** (Gmail, Google Workspace, Zoho Mail, Outlook, Amazon SES, etc.) so emails go from *your* address.
- **Custom Reply-To:** Configure a dedicated reply-to address so customer responses route directly to your central inbox or support team.
- **Email Verification & Error Tracking:** Live connection test before saving, clear diagnostic error messages if credentials expire, and AES-256-GCM encryption.
- Used for one-off emails, sequences, meeting confirmations, new-lead alerts and notifications. A built-in fallback sender keeps system emails flowing.
- Replies can be logged back on the lead timeline (Lead Intelligence settings).

## Content sharing with open tracking
- Share a brochure, price list, property page, video or any link with a lead via a **tracked link**.
- You get notified when the lead **opens** it, and see view counts and last-viewed time on the lead.
- Safe by design — only normal web links are allowed.

**Use case:** An interior designer shares a portfolio link on WhatsApp; the moment the lead opens it, the designer gets a notification and calls while interest is hot.

## AI help for messages
- **Draft reply**: AI writes the next WhatsApp/email based on the conversation and the lead's form answers. Choose tone (friendly, professional, short) and language (auto-matches the lead, or Hindi, Hinglish, Tamil, Telugu, etc.). It never invents prices or offers.
- See [AI Features](14_AI_FEATURES.md).

## Real use cases
- **Instant first response:** Automation sends a WhatsApp welcome template the moment a Facebook lead arrives, even at 2 AM.
- **Festival offer:** Filter all "Interested – not booked" leads and send a Diwali offer campaign.
- **Missed call:** A customer calls the showroom during lunch; Ridhzo auto-sends "Sorry we missed your call — we'll call you back shortly."

## Why it matters
- Indian customers live on WhatsApp — Ridhzo meets them there.
- Personalised messages in seconds, without typing.
- Every message is recorded, so the team shares one history.

---

# Follow-ups & Reminders

## What it is
Most sales happen after the 5th follow-up — and most people stop after the 1st. Ridhzo's dedicated follow-up system makes sure every lead has an active next step and no callback falls through the cracks.

## Key capabilities
- **Create a follow-up** on any lead: title, date & time, notes, and type (Call, WhatsApp, Meeting, Task).
- **Auto-completion on Answered Calls:** When a sales call is logged or synced from the Android app, matching pending follow-ups are marked completed automatically.
  - **Smart Outcome Protection:** Unanswered or missed calls **do not** close follow-ups; the task remains open so the rep remembers to try again.
- **Callback Pile-up Prevention:** Dedicated **Today count** and grouping prevents tasks from snowballing into an unmanageable queue. Overdue tasks are cleanly segmented.
- **Reminders** delivered on time via high-priority push notifications with alert sounds, in-app bell, and optional email.
- **Follow-ups page** — clean views for Today, Upcoming, Overdue, and Completed.
- **Calendar view** — visualize follow-ups by day, week, or month.
- **One-tap completion** — completing updates the lead's "last contacted" and "next follow-up" timestamps instantly.
- **Overdue escalation** — overdue follow-ups are ranked by severity (24h+ = High, 48h+ = Critical) for manager oversight.
- **Automated follow-ups** — automations can schedule follow-ups (e.g., "New lead → follow up in 1 day", "Site visit completed → follow up in 2 days").
- **Business hours & timezone aware** — reminders respect your workspace timezone and working hours.
- **Mobile Idempotency (`Idempotency-Key`):** Mobile actions are strictly idempotent, preventing duplicate task completions or double-logging during spotty cellular connectivity.

## Real use cases
- **Automatic callback closure:** A rep calls a lead on their Android phone at the scheduled follow-up time; after a 4-minute conversation, Ridhzo syncs the call and automatically marks the follow-up as Completed.
- **Unanswered call protection:** A rep calls a lead, but the lead doesn't answer (0-second duration); Ridhzo logs the attempt on the timeline, but keeps the follow-up active so the rep calls back later.
- **Callback promised:** Lead says "call me Saturday 11 AM" → rep sets a follow-up → Saturday 11 AM phone buzzes with the lead's name and a one-tap call button.
- **Nurture after a site visit:** Follow-up set for 2 days after every site visit automatically.
- **Manager oversight:** Monday morning the manager views critical overdue follow-ups and redistributes them before leads turn cold.

## Why it matters
- Converts more leads with zero extra ad spend.
- Saves reps time by auto-completing tasks upon real phone conversations.
- Prevents callback pile-up and ensures reps start every day with a clean, focused to-do list.

---

# Meetings, Site Visits & Public Booking Page

## What it is
Ridhzo handles the step where leads become customers — the meeting. It supports online meetings and in-person visits, sends confirmations and reminders to the lead, and lets field staff check in on location.

## Meeting types
| Type | Example |
|---|---|
| **Online meeting** | Google Meet / Zoom demo — join link sent to the lead |
| **Site visit** | Property viewing, solar roof survey, interior site measurement |
| **Store / office visit** | Showroom visit, clinic appointment, admission counselling |
| **In person** | Meeting at the customer's location |

Durations: 15, 30, 45, 60, 90 or 120 minutes.

## Key capabilities
- **Schedule a meeting** from the lead profile: type, date/time, duration, assignee, location or meeting link, notes.
- **Saved locations** (Settings → Meetings) — your stores, offices, project sites with address and Google Maps link.
- **Confirmation to the lead** by WhatsApp/email: "Hi Asha, your site visit with Acme Homes is confirmed" with time (in the lead's local time), place, map link and the rep's name — or the join link for online meetings.
- **Automatic reminders:** the lead gets a reminder **24 hours** and **1 hour** before the meeting (only when the booking was made well in advance), and the assigned rep gets a heads-up close to the start time plus a prompt afterwards to record the outcome.
- **Reschedule and cancellation messages** to the lead (WhatsApp and/or email).
- **Daily team summary** each morning (8–11 AM in your timezone).
- **Add to Google Calendar** link, and automatic **Google Calendar sync** when connected.
- **GPS check-in** — field reps check in on arrival; location and time are recorded (proof of visit).
- **Outcomes** — mark Completed, No-show or Cancelled, write the outcome, and set the next follow-up in the same step. Optionally notify the lead.
- **Role-based meeting permissions** — control who can schedule, reassign, or log meeting outcomes.
- **Reopen** a meeting if plans change.
- **Customisable meeting message templates.**
- **Meetings page** — all upcoming and past meetings for you or the team.

## Public booking page (`/book/your-business`)
- A shareable link where leads **book a 30-minute slot themselves**, up to **14 days ahead**, only within your **business hours and working days**, in your timezone.
- Shows your business name, address and phone.
- Bookings create (or match) the lead and a meeting automatically, and appear on your Google Calendar if connected.

**Use case:** A dental clinic puts its booking link in its Instagram bio and Google Business profile; patients book consultation slots at night, and the front desk sees them in the morning.

## Real use cases
- **Real estate:** Site visit booked → lead gets WhatsApp confirmation with the Google Maps pin → reminder the morning of → rep checks in at the site → outcome "Interested in Tower B, 3BHK" → follow-up in 2 days.
- **Education counselling:** Parents book a campus visit via the booking page.
- **B2B demo:** Online meeting with a Meet link, logged on the timeline, outcome recorded.
- **No-show handling:** Mark "No-show" → automatically set a follow-up to reschedule.

## Why it matters
- Fewer no-shows thanks to confirmations and reminders.
- Managers get proof of field visits (GPS check-in).
- Leads can book 24/7 without back-and-forth calls.

---

# Automations (WHEN → IF → THEN)

## What it is
Automations do the repetitive work for your team, 24/7. You build a rule in plain language: **WHEN** something happens, **IF** conditions match, **THEN** do one or more actions. No coding.

## Triggers (WHEN)
| Trigger | Fires when |
|---|---|
| Lead created | A new lead arrives from any source (ads, forms, API, import, manual, missed calls) |
| Lead assigned | A lead's owner changes |
| Lead status changed | Status is updated (you can target a specific status) |
| Stage changed | Lead moves on the pipeline board |
| Tag added | A tag is added to a lead |
| Call logged (`call.logged`) | An incoming, outgoing, or missed call is recorded or synced from an Android phone |
| Follow-up scheduled | A follow-up is created |
| Follow-up completed | A follow-up is marked done (manually or auto-completed via call) |
| Follow-up overdue | A follow-up passes its due time |
| Task completed | A task is finished |

## Conditions (IF)
Match on any lead field — source, status, owner, tags, city, budget, any custom field — using equals, contains, is empty, greater than, before/after, etc. Combine with **AND / OR**.

## Actions (THEN)
| Action | What it does |
|---|---|
| Assign lead | Assign to a specific person |
| Round-robin (capacity-aware) | Assign to the rep with the most free capacity |
| Change status | Update the lead's status |
| Schedule follow-up | Create a follow-up X days later |
| Create task | Create an internal task X hours later |
| Add note | Write a note on the timeline |
| Send WhatsApp | Send a WhatsApp template (Business API mode) |
| Enroll in sequence | Start a multi-step drip sequence |

One automation can run several actions in order.

## Ready-made templates
Start from proven recipes instead of a blank screen, for example:
- **Speed-to-lead:** New Facebook lead → round-robin assign → send WhatsApp welcome → follow-up in 1 hour.
- **Missed Call Recovery:** Call logged (missed) → send instant WhatsApp "Sorry we missed your call" → schedule high-priority callback task.
- **High-value escalation:** New lead with budget > X → assign to senior rep → add note "VIP".
- **Nurture on status:** Status = "Interested" → enroll in "7-day nurture" sequence.
- **Overdue rescue:** Follow-up overdue → reassign or create task for the manager.

## Safety & reliability
- **Serverless Resilience:** Background execution queues and job handlers survive serverless cold starts and restarts without dropping events.
- **Idempotency & Loop protection:** Each automation step is strictly idempotent and prevents endless cascading loops.
- **Live UI Refresh:** Web and mobile sessions reflect state updates in real time as automations execute.
- **Partial failure tolerance:** If one action fails, the others still run and the failure is logged.
- **Pause / resume:** Any automation can be toggled on/off instantly with a switch.

## Real use cases
- **Call-driven follow-up:** Rep finishes an answered call synced via Android → automation moves status to "Contacted" and schedules a nurture task.
- **Real-estate developer:** Leads from "Project A" form go to the Project A team; leads from "Project B" go to Project B; all get a WhatsApp brochure instantly.
- **Coaching institute:** When a lead is tagged "Demo attended", status changes to "Hot" and a fee-reminder sequence starts.
- **Insurance advisor (solo):** Every new lead automatically gets a follow-up for tomorrow 10 AM, so none are forgotten.

## Plan limits
Free: 2 automations · Starter: 15 · Unlimited: unlimited. On downgrade, the oldest automations keep running; extra ones pause.

## Why it matters
- Every lead gets the same fast, professional treatment — even at night or on holidays.
- Saves each rep hours per week of manual assigning, tagging and scheduling.
- Your best sales process runs automatically, not just when your best rep remembers.

---

# Sequences (Automatic Drip Follow-ups)

## What it is
A **sequence** is a series of messages sent automatically over days — e.g., WhatsApp on Day 0, email on Day 2, WhatsApp with brochure on Day 5, check-in on Day 9. Leads receive consistent follow-up without your team having to remember.

## Key capabilities
- **Multi-step, multi-channel:** each step is WhatsApp or email, with a delay (Day 0, 2, 5…).
- **Personalisation tokens:** `{{first_name}}`, `{{name}}`, `{{phone}}`, `{{email}}`, and any custom field token `{{custom_field_key}}` (with `{{company}}` available for B2B).
- **Attachments/links** on steps — brochures, price sheets, decks.
- **AI Sequence Drafter:** type a goal — *"Nurture a new real-estate lead over two weeks toward booking a site visit"* — and AI drafts the full schedule, channels and messages. Edit and save.
- **AI "improve" for any message** to make it clearer or more persuasive.
- **Enroll leads** manually from the lead profile ("+ Add to sequence"), in bulk, or automatically via automations.
- **Auto-stop** when the lead replies or converts, so you never message someone who already said yes.
- **Pause / resume** a whole sequence with one click.
- **Visual funnel view:** see how many leads are on each step, how many completed, and how many were removed early (replied/converted).
- **Personal WhatsApp mode:** if you don't use the Business API, WhatsApp steps become reminders on the lead's timeline for the rep to send with one tap.

## Real use cases
- **Real estate:** "New enquiry nurture" — Day 0 welcome + project brochure, Day 2 amenities video, Day 5 site-visit invitation, Day 9 limited-offer reminder.
- **Education:** "Admission season" — course details, scholarship info, fee deadline reminder, counsellor call invite.
- **B2B services:** "Demo no-show" — reschedule link, case study, final check-in.
- **Win-back:** "Cold leads" — 4-touch sequence for leads silent for 30+ days.

## Plan limits
Free: 1 sequence · Starter: 10 · Unlimited: unlimited.

## Why it matters
- Persistent, polite follow-up is what closes deals — sequences make it automatic.
- Every lead gets your best messages, not whatever a rep types at 7 PM.
- AI drafting means you can launch a new nurture campaign in minutes.

---

# AI Features

Ridhzo uses AI to eliminate the repetitive friction that slows sales teams down: reading conversation history, typing manual notes, updating CRM fields, and crafting messages. **AI never sends a message to a customer without human approval — reps always retain full control.**

## Unified Lead-Context Engine
All Ridhzo AI features are powered by a single, comprehensive lead-context engine (`leadContext`). Before suggesting or drafting anything, the engine reads:
- Custom statuses, status stage progression, and complete status history.
- Every custom field key and current value.
- Original form submissions and questionnaire answers.
- The complete activity timeline: calls, notes, audio transcripts, emails, and WhatsApp chats.

## 1. 1-Click AI Suggestions on the Lead Profile
Instead of forcing reps to manually type updates after every call or conversation, Ridhzo provides actionable suggestions with a single **"Apply"** button:
- **1-Click Field Auto-fill:** Scans recent calls and conversation notes to detect missing data (e.g. Budget: ₹60 Lakhs, Preferred Location: Hitech City, Timeline: Immediate) and pre-populates fields for 1-click saving.
- **1-Click Status Transitions:** Recommends advancing the lead to the next logical stage (e.g. *New → Contacted* or *Contacted → Qualified*) once conversation milestones are reached.
- **Next Step Recommendations:** Suggests the immediate operational follow-up (e.g., "Schedule site visit for Saturday", "Send brochure via WhatsApp") with 1-click scheduling.

## 2. Live Next Best Action (NBA)
A real-time recommendation banner on the lead profile that streams the optimal next move for each lead without requiring full-page reloads. Reps know at a glance whether to call, send a specific template, or escalate.

## 3. Status Playbooks
Dynamic stage-specific guidance for sales reps:
- Provides essential qualification questions to ask during the current status stage.
- Common objection-handling scripts tailored to that phase of the conversation.
- Clear milestone exit criteria required to move the deal forward.

## 4. AI Assistant (Copilot)
A conversational assistant available from any screen (floating button) and on its own page (**Assistant**). It understands the exact lead you are viewing.

Ask in plain language, for example:
- "Show me today's new leads from Facebook."
- "What's the status of Ramesh Kumar?"
- "Move Priya to Site Visit Booked and remind me to call her Friday at 5 PM."
- "Assign all of Anil's untouched leads to Sneha."
- "Book a site visit with Asha tomorrow 11 AM at Green Acres."
- "Draft a WhatsApp to Rahul about the price revision."

What it can do:
| Capability | Notes |
|---|---|
| Search leads | By name, phone, email, company, or recent |
| Read full lead details & timeline | Powered by unified lead context |
| Change status | Reversible |
| Add tags | Reversible |
| Set follow-up reminders | |
| Assign / reassign leads | |
| Schedule meetings | Online (incl. Google Meet link), site visit, store visit, in person — confirmation is queued as a draft |
| Draft messages | Queued for **your approval** — never auto-sent |

Conversations are saved so you can continue later. The assistant only ever sees your own workspace's data.

## 5. AI Reply Drafts
On any lead, click **Draft with AI** to write the next WhatsApp or email:
- Deeply contextual: uses the lead's form answers, custom fields, and prior call notes.
- **Tone:** friendly, professional or short.
- **Language:** auto-matches the lead, or choose any language (Hindi, Hinglish, Telugu, Tamil, etc.).
- Ends with a clear call-to-action; never invents prices, offers or dates.

## 6. AI Lead Summary
One click produces a concise executive brief: who the lead is, their requirements, conversation history, and current status. Ideal before dialing a call or during lead handovers.

## 7. AI Sequence Generator
Describe a goal; AI drafts a complete multi-step WhatsApp/email follow-up sequence with timing. See [Sequences](13_SEQUENCES.md).

## 8. Mobile App AI Parity
The Ridhzo mobile app connects directly to the AI suggestions endpoint (`/api/mobile/leads/[id]/ai-suggestions`), letting reps in the field review AI recommendations, apply field updates, and transition statuses with one tap on their smartphone.

## 9. AI Auto-tagging (paid plans)
Incoming replies are automatically classified by intent (interested, price query, not interested, callback request) so teams can prioritize immediate revenue opportunities.

## Smart intelligence — included free
- **Lead score** visible in lead tables and profile.
- **Best time to contact** based on engagement history.
- **Going Cold** alerts and **4-step re-engagement plan**.

## AI credits & model architecture
Powered by high-throughput modern LLMs with fast inference.

| Plan | AI credits / month |
|---|---|
| Free | 15 |
| Starter | 300 |
| Unlimited | 2,000 |

1 credit = 1 generation via `consumeAiCredit` (draft, summary, assistant turn, sequence, or 1-click field extraction). Credits reset monthly. If an AI call fails or is unavailable, a standard template is provided and the credit is automatically refunded.

## Why it matters
- Eliminates manual typing and note-taking after customer interactions.
- Guides junior reps with proven stage playbooks and next-best actions.
- Empowers reps to reply in seconds in the customer's native language.
- Human-in-the-loop design ensures brand safety and accuracy.

---

# Dashboards & Insights

## 1. My Dashboard (for every salesperson)
Each rep's personal command centre for the day.

| Metric | Meaning |
|---|---|
| Total leads | Leads assigned to me |
| New leads | My leads not yet worked |
| Active leads | My leads in conversation |
| Win rate | Won ÷ (won + lost + unqualified) |
| Pipeline value | Value of my open deals (formatted in your workspace currency, e.g. ₹50.0K / ₹1.5L) |
| Due today | My follow-ups due today |
| Overdue | My missed follow-ups |
| Follow-up completion rate | How consistently I complete follow-ups |
| **Calls & Answer Rate** | Total calls made today, total talk time, and personal call answer rate % |

Plus: today's follow-ups and meetings, recent leads with lead scores, and quick actions.

**Use case:** A rep opens Ridhzo at 9:30 AM, sees 6 follow-ups due, their call answer rate at 65%, and clears priority callbacks first.

## 2. Executive Dashboard (for owners & managers)
The business at a glance, filterable by date range, team and source.

| Metric | Why it matters |
|---|---|
| **Average speed to first response** | Faster response = more sales |
| **Leads contacted within 5 minutes (%)** | The gold standard of speed-to-lead |
| **Median response time** | Fair benchmark, ignores outliers |
| **Call Answer Rate (%)** | Percentage of calls successfully answered across reps |
| **Total Call Duration & Volume** | Total phone activity logged automatically from Android devices |
| **SLA compliance & breaches** | Leads contacted within your target window (default 15 min) and how many were missed |
| Total / new / active leads | Funnel volume |
| Win rate | Sales efficiency |
| Pipeline value | Money in play (formatted in workspace currency) |
| Overdue & due-today follow-ups | Execution discipline |
| Follow-up completion rate | Team consistency |
| **Content opened (last 7 days)** | Buying intent from shared brochures/links |
| **Ignored content** | Shared links not opened after 24h — nudge those leads |
| **Revenue by source** | Which channel brings money |
| **Pipeline distribution** | Where deals sit by stage |
| **Today's priorities** | High-priority leads needing action now |

## 3. Insights (deep analytics)
For leaders who want to optimise the whole sales engine.

| Insight | What it answers |
|---|---|
| **Pipeline health grade (A–D)** | Overall score combining response SLA, engagement, stuck deals and momentum |
| **Source ROI** | Win rate and revenue per lead source/campaign — where to spend ad money |
| **Call Performance & Pickup Rates** | Answer rates, peak pickup hours of the day, and talk-time correlation to conversions |
| **Team leaderboard** | Leads handled, calls made, answer rate, win rate, revenue and follow-ups per rep |
| **Revenue forecast** | Pipeline value weighted by stage probability in your operational currency |
| **Win/loss analysis** | Win rate and grouped loss reasons (price, competitor, fit, ghosted) |
| **Funnel velocity** | Average time between stages; where deals slow down |
| **Stuck deals** | Deals sitting too long in one stage, with risk level |
| **Pipeline aging** | Open deals by age (0–7, 8–14, 15–30, 30+ days) and value at risk |
| **Engagement health** | Leads grouped Healthy / Needs attention / At risk / Critical |
| **Engagement momentum** | Leads heating up vs cooling down week over week |
| **Best contact times** | Hours and days when leads answer calls and respond most |
| **Channel mix** | Share of WhatsApp, calls, email, notes |
| **Territory / geography** | Leads, win rate and revenue by city/region |
| **Cohorts** | How each month's leads convert or drop over time |
| **Customer lifetime value & repeat rate** | Value of won customers, repeat buyers, top clients |
| **Qualification (BANT) score** | Budget, Authority, Need, Timeline readiness |
| **Rep capacity** | Free capacity per rep for fair assignment |
| **Overdue escalation queue** | Neglected follow-ups by severity |

## Real use cases
- **Ad budget decision:** Insights shows Google leads close at 18% vs Facebook at 6% — the owner moves budget to Google.
- **Coaching:** Leaderboard shows one rep has high volume but low win rate; manager reviews their calls.
- **Response time:** Executive Dashboard shows only 22% of leads contacted within 5 minutes; the team turns on round-robin + push alerts and reaches 70%.
- **Cash planning:** Revenue forecast gives a realistic expected-revenue number for next month.

## Why it matters
- Decisions based on data, not gut feel.
- Every rupee of ad spend can be traced to leads and revenue.
- Problems (slow response, stuck deals, cold leads) are visible early.

---

# Notifications, Mobile App & Offline

## Notifications
| Channel | What you get |
|---|---|
| **High-Priority Push Channels** (Android & iOS) | Dedicated channels for **New Leads** (high priority sound), **Calls**, and **Follow-up Reminders**. Includes app icon badge count and direct tap routing into the lead profile. |
| **Smart Missed-Call Filtering** | Suppresses duplicate push alerts if the phone itself already showed the missed-call notification. |
| **In-app bell** | Full notification drawer with alert chime for incoming leads. |
| **Email notifications** | User-controlled preferences (Profile → Notification preferences). |
| **New-lead alerts** | Admin-configured alert rules via email, in-app, or official WhatsApp (see [Assignment & Alerts](08_ASSIGNMENT_AND_ALERTS.md)). |

## Native Mobile App
- **Native Android APK & PWA:** Built for real-world sales teams. Install via the native Android APK or install from the browser on Android/iOS.
- **Mobile OTP Authentication:** Quick, secure sign-in with phone number + OTP (delivered via SMS/Watxio), plus Google and email/password login.
- **Device Management & Deduplication:** Push tokens are deduplicated via Redis, pruning inactive devices and ensuring rapid network switches never create ghost notifications.
- **Mobile Lead Profile Parity:** Mobile reps see all lead fields, form answers, activity timeline, and the mobile AI suggestions endpoint (`/api/mobile/leads/[id]/ai-suggestions`) to apply updates in 1 click.
- **One-tap communication:** WhatsApp, Phone Call, SMS, and Email directly from each lead card.
- **GPS check-in:** For on-site client meetings and field surveys.

## Android Automatic Call Sync & Caller ID
- **Zero-Manual Call Logging:** Incoming, outgoing, and missed calls on reps' Android devices are synced automatically (`/api/mobile/calls/sync`) with timestamps, talk durations, and audio call logs.
- **Caller ID Directory:** Ridhzo pre-downloads active lead phone keys to the rep's device (`/api/mobile/calls/phone-keys`). When a lead rings the rep's personal or work phone, the phone displays the lead's name and details before the rep picks up.
- **Auto-Complete Follow-ups:** Answered calls automatically mark matching pending follow-ups as Completed. Unanswered calls remain open so callbacks aren't lost.

## Offline Sync & Conflict Detection
- **Offline-First Lead Capture:** Add or edit leads with zero internet connection (at property expos, basement sites, or remote travels).
- **Incremental Lead Sync:** Only downloads leads that have changed since the last `sync_at` timestamp, saving bandwidth and battery.
- **Version Claiming & Conflict Detection:** If a lead was modified on the web dashboard while a rep edited it offline, Ridhzo flags the conflict and prevents silent data overwrites.
- **Mobile Idempotency (`Idempotency-Key`):** Network retries on notes, contact logs, or replies are strictly deduplicated.

## Multi-language app
Choose the app language in your profile:
- **English**
- **हिन्दी (Hindi)**
- **తెలుగు (Telugu)**

The menu, header, and phone notifications appear in your language. AI can draft customer messages in any language.

## Timezone & business hours
Set your workspace timezone, working days, and working hours — reminders, booking slots, and meeting schedules all follow them.

## Why it matters
- Sales reps spend their days on the phone and in the field — Ridhzo automates logging without getting in their way.
- Instant push notifications and Caller ID ensure every call is answered with complete context.
- Offline sync with conflict detection guarantees field data is never lost or overwritten.
- Teams across India can use the app in their preferred language.

---

# Team Management, Roles & Security

## Users & invitations (Settings → Users)
- **Invite teammates by email**; they set their password or sign in with Google or Mobile OTP.
- Activate/deactivate users at any time (deactivated users stop receiving leads; their data stays).
- **Seat calculation:** Seats are counted strictly for active members and pending invitations. Soft-deleted and deactivated team members are excluded, ensuring you never pay for past staff.
- **Teams** — group users (by city, product, language) for team-based lead rotation and reporting.
- Seat count follows your plan (Free 1 · Starter 3 · Unlimited unlimited).

## Roles & permissions
Two built-in roles plus unlimited **custom roles**:

| Role | Can do |
|---|---|
| **Admin** | Everything |
| **Member** (sales rep) | Create, edit, assign, call, and change status of their leads |
| **Viewer** (custom role without edit) | Read-only access |
| **Custom roles** | Any combination of the permissions below |

**Least-Privilege Role Defaults & Validation:**
Role assignment strictly verifies caller permissions on the server to prevent privilege escalation. Custom roles follow least-privilege principles by default.

**Permission catalog:**
| Permission | Allows |
|---|---|
| Manage users & teams | Invite, deactivate, organise teams |
| Manage roles & permissions | Create/edit roles |
| Edit organization settings | General settings, currency, statuses |
| Manage lead fields | Configure field visibility, required fields, and ordering |
| Manage lead sources & automatic assignment | Connect Facebook/Google/forms/calls, set assignment |
| Manage message templates | Create/edit templates |
| Manage automations | Build/edit automations |
| Manage sequences | Create/edit/delete sequences |
| Edit leads | Create, edit, assign, change status |
| Delete leads | Move leads to recycle bin (30-day soft delete) |
| Permanently purge leads | Hard-delete leads permanently via the purge endpoint |
| Merge duplicate leads | Merge records |
| Manage meetings | Schedule, check-in, and record meeting outcomes |
| View audit log | See who did what |
| Manage API keys, webhooks & new-lead alerts | Developer & alert settings |
| Manage billing & subscription | Plans, invoices, and payments |

**Lead privacy between reps:** sales reps see and work only the leads assigned to them (plus leads they are attending a meeting with). Admins and anyone with "Edit organization settings" see all leads. Reps can't open a colleague's lead even with a direct link.

Admins cannot accidentally lock themselves out (self-protection rules), and permission checks are enforced on the server — not just hidden buttons.

## In-App Support Ticket Management (Settings → Support)
- Built-in support ticketing allows workspace members to raise, track, and manage help tickets directly within Ridhzo.
- Tickets are processed in real time by the Ridhzo technical team from the central platform console, ensuring fast response times without leaving the CRM.

## Audit log (Settings → Audit)
A permanent record of important actions: who changed settings, roles, users, deleted/merged leads, created API keys, and more — with time and user. Exportable per lead as a full history.

## Login & Session Security
- Email & password (securely hashed)
- **Sign in with Google**
- **Mobile Phone number + OTP** (via SMS/Watxio)
- **Mobile Token Revocation:** Mobile sessions can be revoked on-demand (`/api/mobile/auth/token-revoke`), immediately invalidating device JWTs.
- **Session Caching & Token Pruning:** User sessions are securely cached; stale mobile push tokens are pruned automatically to maintain tight device security.

## Data protection & Billing
- **Complete workspace isolation** — every query is scoped to your organisation; one business can never see another's data.
- **Encryption** of sensitive secrets (SMTP passwords, API keys, integration tokens) with AES-256-GCM.
- **API keys** are hashed; full vs read-only scopes; rate-limited.
- **Signed webhooks** (HMAC-SHA256) in and out; protection against internal-network (SSRF) abuse.
- **Rate limiting** on public forms and webhooks to stop spam.
- **Recycle bin** (30 days) guards against accidental deletion.
- **Permanent Purge:** Compliant hard deletion for GDPR / right-to-be-forgotten requests.
- **GST Invoices & Payment Webhooks:** Automatic GST-compliant tax invoices generated via payment webhooks on Razorpay, with multi-currency handling.

## Why it matters
- Give every person exactly the access they need — no more, no less.
- Know who did what, always.
- Your customer data stays private and safe.

---

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

---

# Industry Use Cases & Playbooks

Each playbook shows a real workflow using Ridhzo features that exist today.

---

## 1. Real Estate (developers, brokers, channel partners)
**Challenge:** Hundreds of Facebook/Google leads per project, slow callbacks, site visits not tracked, brokers losing leads.

**Ridhzo setup:**
- Sources: Facebook Lead Ads (one form per project), Google Lead Form Ads, hosted form for hoardings via QR code, Android call sync.
- Custom fields: Budget (currency in INR), Configuration (2BHK/3BHK), Preferred location, Possession timeline.
- Statuses: New → Contacted → Site Visit Scheduled → Site Visit Done → Negotiation → Booked / Lost.
- Status Playbooks & AI: Stage-specific guidance for site visits, plus 1-click field updates for budget and preferred towers.
- Automatic Call Sync & Caller ID: Reps call buyers; Android sync logs talk time automatically and auto-completes follow-ups; incoming calls show buyer's lead name.
- Automation: New lead from "Project A" → assign round-robin within Project A team → WhatsApp brochure → follow-up in 1 hour.
- Meetings: Site visits with saved project locations, Google Maps pin in confirmation, GPS check-in.
- Sequence: 14-day nurture with walkthrough video, price sheet, offer deadline.
- Tracked links: know the moment a buyer opens the floor plan.

**Result story:** "Our response time dropped from 3 hours to 4 minutes, all rep calls are tracked automatically without paperwork, and site visits went up 2×."

---

## 2. Education & Coaching (institutes, universities, ed-tech, study abroad)
- Sources: Google Search lead forms, Instagram ads, website enquiry form, CSV from education fairs.
- Android Call Sync: Counsellor calls to students/parents logged with duration; answered calls automatically close pending callbacks.
- Custom fields: Course, Qualification, City, Intake (month/year), Parent phone.
- Teams: Counsellors by language (Hindi, Telugu, English) — team-based rotation.
- Booking page: Parents book campus visits or counselling slots.
- Sequence: Course info → scholarship → fee deadline → final reminder.
- Insights: Source ROI and call answer rate analytics to see which campaign brings enrolments, not just enquiries.

---

## 3. Insurance, Loans & Financial Advisors (solo or small teams)
- Free or Starter plan; personal WhatsApp mode.
- CSV import of existing contacts; hosted form link in WhatsApp status and Instagram bio.
- Custom fields: Policy type, Sum assured, Renewal date (date), Documents received (checkbox).
- Follow-ups for renewal dates; attachments for KYC documents.
- AI drafts in Hindi/Hinglish for quick, personal replies.

---

## 4. Clinics, Hospitals, Dental & Aesthetic Centres
- Sources: Instagram/Facebook ads, Google ads, website form, missed-call auto-WhatsApp from the reception number.
- Booking page for consultations within clinic hours.
- Statuses: New → Appointment Booked → Visited → Treatment Started / Not Interested.
- Meeting type "Store/office visit" with the clinic address and map.
- Sequence for post-consultation follow-up.

---

## 5. Gyms, Fitness Studios & Salons
- QR-code hosted form at the front desk: "Book a free trial".
- Automation: New lead → WhatsApp welcome + trial slot → follow-up day after trial.
- Going Cold list to win back members who enquired but never joined.

---

## 6. Interior Designers, Architects & Home Services
- Tracked portfolio link shared on WhatsApp — call when opened.
- Site visits with GPS check-in for measurements.
- Pipeline: Enquiry → Site Measurement → Design Presented → Quotation → Won.
- Attachments: floor plans, quotations.

---

## 7. Solar, EV & Home-Improvement Installers
- Facebook lead ads by district; team-based assignment by territory.
- Custom fields: Monthly electricity bill (currency), Roof type, Subsidy eligible (checkbox).
- Site survey meetings, check-in and outcome.
- Territory analytics: which cities convert best.

---

## 8. Automobile Dealers (cars, two-wheelers)
- Sources: OEM/website webhooks, Facebook ads, walk-ins via Quick Add.
- Test-drive meetings (store visit / in person).
- Sequence: offer → finance options → test-drive reminder.
- Leaderboard for sales executives.

---

## 9. Travel & Tour Operators
- Instagram ads + website form.
- Custom fields: Destination, Travel dates, Pax, Budget.
- AI drafts itineraries summaries in the lead's language; tracked link for itinerary PDF.

---

## 10. Marketing Agencies (lead generation for clients)
- Run ads for clients and deliver leads in Ridhzo.
- **New-lead alerts** email every lead to the client's sales head automatically.
- Meta Conversions API sends lead quality back to Meta to improve ad performance.
- Clients can be given a **complimentary plan** so they use Ridhzo free while the agency manages ads.
- Outbound webhooks to push leads to the client's own systems.

---

## 11. B2B Services, SaaS & Consultants
- Website webhook / REST API for demo requests.
- Online meetings with Google Meet links, synced to Google Calendar.
- Custom fields: Company size, Industry, Deal value.
- Revenue forecast and win/loss analysis.

---

## 12. Events, Exhibitions & Offline Sales
- Offline Quick Add at stalls with no network; auto-sync later.
- Tag leads by event ("Expo-Hyderabad-2026"), bulk WhatsApp thank-you campaign next day.

---

# Frequently Asked Questions

## General
**What is Ridhzo?**
Ridhzo is a simple, mobile-first lead CRM. It captures leads from Facebook, Instagram, Google, your website and more; alerts you instantly; and helps you reply on WhatsApp, follow up and close — all from your phone.

**Who is it for?**
Solo professionals and small-to-medium sales teams — real estate, education, insurance, clinics, gyms, agencies, home services, dealers and any business that runs lead-generation ads.

**Do I need technical knowledge?**
No. Connecting Facebook is a click-and-login. Forms are built visually. Automations are plain WHEN/IF/THEN choices.

**Does it work on mobile?**
Yes. Ridhzo has a native Android app (APK) with background call sync and caller ID, and can also be installed as a PWA from your browser on Android or iOS with high-priority push notification channels.

**Does Ridhzo track calls automatically?**
Yes. On Android, the app automatically syncs incoming, outgoing, and missed calls with exact talk duration and timestamps. Calls are matched to leads, call answer metrics are tracked, and answered calls automatically complete scheduled follow-up reminders.

**What is Caller ID in Ridhzo?**
Ridhzo pre-downloads active lead phone keys to the sales rep's phone. When an active lead calls, the phone displays the lead's name and details before the rep answers.

**Which languages?**
The app is available in English, Hindi and Telugu. AI can write messages to your customers in almost any language.

## Pricing
**Is there a free plan?** Yes — Free forever: 1 user, 300 leads, 1 source, 2 automations, 1 sequence, 15 AI credits/month.
**How much are paid plans?** Starter ₹249/month (3 users, 5,000 leads), Unlimited ₹449/month (unlimited users & leads). Yearly plans get 2 months free. GST extra.
**Are soft-deleted users counted as seats?** No. Seats are only counted for active team members and pending invites.
**Is there a trial?** Every new account gets a 14-day Starter trial, no card required.
**Can I cancel?** Any time. You keep your plan until the period ends, then move to Free without losing data.
**How do I pay?** UPI, cards or net banking via Razorpay. GST invoices provided.
**Do you have coupons or agency pricing?** Coupon codes are supported at checkout. Agencies can contact the Ridhzo team about complimentary plans for their clients.

## Leads & sources
**How fast do Facebook leads arrive?** Within seconds of the form being submitted.
**Can I import my old leads?** Yes — CSV import with column mapping and a preview before importing. You can also sync past Facebook leads.
**Will I get duplicates?** Ridhzo detects duplicates by phone/email and can merge them automatically.
**I don't have a website. Can I still capture leads?** Yes — use Ridhzo's hosted form link or QR code.
**Can I connect my website's contact form?** Yes — via the website webhook, the REST API, or by embedding a Ridhzo form.
**What if I lose internet while capturing or editing leads?** Leads added or edited offline are stored securely on your phone. When connection returns, Ridhzo performs incremental sync with conflict detection to ensure teammates don't overwrite each other.
**Is LinkedIn supported?** LinkedIn Lead Gen Forms are coming soon.

## WhatsApp & messaging
**Do I need the WhatsApp Business API?** No. Personal mode works with your own WhatsApp for free (one tap opens the chat with your message ready). The Business API is optional for automated sends, campaigns and sequences.
**Can Ridhzo send WhatsApp automatically?** Yes, in Business API mode (via Watxio or Meta Cloud API) — welcome messages, sequences, campaigns, missed-call replies and alerts.
**Can I send bulk messages?** Yes — up to 500 leads per campaign.
**Can I send emails from my own address?** Yes — connect your SMTP (Gmail, Zoho, Outlook, etc.) with custom reply-to support.

## Team & security
**Can I control what my team sees and does?** Yes — built-in Admin/Member roles and custom roles with granular permissions, enforcing least-privilege defaults.
**How are leads assigned?** Round-robin, team rotation, capacity-based, per-source, automation rules, or manually/in bulk.
**Is my data safe?** Each workspace is fully isolated, secrets are encrypted, deletions go to a 30-day recycle bin, and every important action is recorded in the audit log.
**Can I permanently delete leads?** Yes — authorized admins can permanently purge leads via the purge endpoint for GDPR compliance.
**How do I get technical support?** You can raise, track, and manage support tickets directly in **Settings → Support**, handled directly by the Ridhzo team.

## AI
**Will AI message my customers without me knowing?** Never. AI drafts; a human approves and sends.
**What are 1-click AI suggestions and live NBA?** On the lead profile, AI reads full lead context (status history, notes, custom fields) to recommend 1-click field auto-fills, 1-click status advances, stage playbooks, and real-time next best actions.
**What are AI credits?** One credit = one AI generation via `consumeAiCredit`. Free 15, Starter 300, Unlimited 2,000 per month; reset monthly.
**What can the AI Assistant do?** Search leads, show details, change status, add tags, set reminders, assign leads, schedule meetings and draft messages for approval.

## Integrations
**Does Ridhzo have an API?** Yes — REST API with full or read-only keys, plus outbound webhooks for lead events.
**Does it work with Zapier/Make/Pabbly?** Yes, through inbound webhooks, the API and outbound webhooks.
**Does it sync with Google Calendar?** Yes — meetings and booking-page appointments.
**Can Ridhzo improve my Facebook ad results?** Yes — Meta Conversions API (CAPI) sends lead-quality signals back to Meta with a built-in test ping tool in Settings.

---

# Website Copy Kit

Ready-to-use copy for the Ridhzo website, ads and social posts. All claims match real features.

## Brand
- **Name:** Ridhzo (app: Ridhzo CRM)
- **Tagline options:**
  - "Every lead. Instantly. On WhatsApp."
  - "Capture. Alert. Close."
  - "The lead CRM that lives in your pocket."
  - "Stop losing leads. Start closing them."
- **Short description:** Lead capture, instant alerts, and one-tap messaging.
- **Voice:** simple, confident, helpful, a little bold. Speak to business owners, not IT teams.

## Homepage hero
**Headline:** Never lose another lead.
**Sub-headline:** Ridhzo pulls leads from Facebook, Instagram, Google and your website into one place, alerts your team in seconds, and lets you reply on WhatsApp in one tap.
**Primary CTA:** Start free — no card needed
**Secondary CTA:** See how it works
**Trust line:** Free forever plan · 14-day Starter trial · Setup in 10 minutes

## "How it works" (3 steps)
1. **Connect your lead sources** — Facebook & Instagram Lead Ads, Google Ads, website forms, CSV. One click each.
2. **Get alerted instantly** — the right person gets a push notification the second a lead arrives.
3. **Reply & follow up** — one-tap WhatsApp, smart reminders and automatic sequences until the deal is closed.

## Feature blocks (headline + 1 line)
- **All your leads, one inbox** — Facebook, Instagram, Google, website, API, CSV, missed calls. No more spreadsheets.
- **Instant alerts & high-priority push** — Push notifications with sound on phone and desktop in seconds, with direct tap routing.
- **Automatic Android call sync** — Phone calls, talk time, and outcomes synced automatically without reps typing notes.
- **Smart Caller ID** — Incoming lead calls show the lead's name directly on the rep's phone before answering.
- **One-tap WhatsApp** — Personalised messages with the lead's name, ready to send.
- **Automatic assignment** — Round-robin, by team, by capacity or by rules. Fair and fast.
- **Never forget a follow-up** — Reminders, calendar, overdue escalation, and auto-complete on answered calls.
- **Live Next Best Action** — Real-time stream guiding reps on the exact next move to advance every deal.
- **1-Click AI Suggestions** — Auto-populate missing lead fields and advance stages with a single tap.
- **Status Playbooks** — Proven stage-specific talk tracks, qualification questions, and objection handling.
- **Drip sequences** — WhatsApp and email follow-ups that run themselves.
- **Automations** — WHEN a lead arrives or call is logged, IF it matches, THEN assign, message, tag, schedule. No code.
- **Meetings & site visits** — Confirmations with map links, GPS check-in, public booking page.
- **Hot & Going Cold lists** — See who's ready to buy and who's slipping away.
- **Dashboards that matter** — Response time, call answer rates, win rate, revenue by source, team leaderboard.
- **Works on your phone** — Native Android APK and PWA. Offline sync with conflict detection. Hindi & Telugu supported.
- **Secure by design** — Least-privilege roles, support tickets, audit log, encrypted secrets, 30-day recycle bin, permanent purge.

## Pricing page copy
**Headline:** Simple pricing. No per-user surprises.
**Sub:** Start free. Upgrade when you grow.
- **Free — ₹0 forever.** For individuals getting started. 1 user · 300 leads · 1 lead source · 2 automations · 1 sequence · 15 AI credits/month.
- **Starter — ₹249/month** (₹2,490/year). For solo agents & growing teams. 3 users · 5,000 leads · 5 sources · 15 automations · 10 sequences · 300 AI credits · no Ridhzo branding on forms.
- **Unlimited — ₹449/month** (₹4,490/year). Unlimited leads, users & full access. Unlimited sources, automations and sequences · 2,000 AI credits.
**Footnote:** Prices exclude 18% GST. Yearly plans include 2 months free. Dynamic currency support. Cancel anytime.

## Social proof / outcome lines (use with real customer data when available)
- "From 3-hour callbacks to 3-minute replies."
- "Our reps' calls and talk times are tracked automatically — no more end-of-day spreadsheets."
- "One extra closed deal pays for Ridhzo for years."
- "Our reps finally know what to do every morning with live next best actions."

## Objection handling
| Objection | Answer |
|---|---|
| "We already use Excel / Google Sheets." | Sheets don't alert you, sync phone calls, assign leads, remind you or message customers. Import your sheet into Ridhzo in 5 minutes. |
| "CRMs are complicated." | Ridhzo is built for the phone and set up in 10 minutes. No training needed. |
| "It's expensive." | Free forever plan. Unlimited users for ₹449/month — less than one lead's ad cost. |
| "My team only uses WhatsApp and phone calls." | Perfect — Ridhzo is WhatsApp-first and auto-syncs Android phone calls and durations. |
| "I'm worried about data." | Every workspace is isolated, secrets are encrypted, and you control access with roles. |
| "We have a website developer's form already." | Connect it with our webhook or API — or embed a Ridhzo form. |

## CTA variations
- Start free
- Try Starter free for 14 days
- Connect Facebook leads now
- Get your first lead in 10 minutes
- Book a demo

## SEO keywords (by intent)
- **Core:** lead management software, lead CRM, CRM for small business India, simple CRM app, sales CRM for WhatsApp
- **Call Tracking & Mobile:** Android call sync CRM, automatic call logging CRM, sales caller ID app, mobile sales CRM India
- **Source-specific:** Facebook lead ads CRM, Facebook leads to WhatsApp, Instagram lead ads integration, Google lead form ads CRM
- **Feature:** lead auto assignment round robin, WhatsApp CRM, lead follow-up reminder app, drip WhatsApp sequence, missed call to WhatsApp, live next best action CRM
- **Industry:** real estate CRM India, CRM for education institutes, CRM for insurance agents, clinic lead management, CRM for interior designers
- **Comparison:** Privyr alternative, affordable Zoho CRM alternative, simple HubSpot alternative for small business

## Suggested website pages
1. Home
2. Features (overview) + one page per major feature: Lead Capture, WhatsApp, Automations, Sequences, Follow-ups, Meetings, AI, Dashboards, Mobile App
3. Integrations: Facebook Lead Ads, Google Lead Form Ads, WhatsApp, Google Calendar, API & Webhooks
4. Industries: Real Estate, Education, Insurance & Finance, Clinics, Agencies, Home Services
5. Pricing
6. FAQ
7. Security & Privacy
8. Blog / Guides (e.g., "How to reply to Facebook leads in under 5 minutes")
9. Sign up / Log in

---

# Ridhzo Mobile App (Android & iOS)

## What it is
The **Ridhzo Mobile App** is a dedicated mobile sales command centre built for sales executives, field reps, and business owners who work from their phones. Rather than treating mobile as an afterthought or a stripped-down dashboard, Ridhzo puts the full power of lead capture, automatic call tracking, caller ID, and AI suggestions directly in your pocket.

Available as:
- **Native Android App (APK):** Built with React Native & Expo, featuring background call sync and caller ID directory.
- **Progressive Web App (PWA):** Installable on Android and iPhone ("Add to Home Screen") with high-priority push notifications and full offline capabilities.

---

## 1. Getting Started & Sign-in

### Fast login options
- **Mobile Number + OTP:** One-tap login via SMS/Watxio OTP verification (`/api/mobile/auth/send-otp` & `/api/mobile/auth/verify-otp`).
- **Google Sign-In:** One-click OAuth sign-in.
- **Email & Password:** Standard secure sign-in.

### Device registration & security
- **Device Registration Deduplication:** Device push tokens are registered and deduplicated using Redis, pruning stale tokens and ensuring network reconnects never cause duplicate notifications.
- **Token Revocation:** User sessions and device JWTs can be revoked instantly (`/api/mobile/auth/token-revoke`) from web settings or upon sign-out.
- **Multi-Tenant Data Isolation:** Local data is strictly partitioned per organization; switching accounts or signing out securely clears local cache.

### Required Android permissions (for native features)
- **Call Log (`READ_CALL_LOG`):** Required to automatically sync incoming, outgoing, and missed sales calls.
- **Phone State (`READ_PHONE_STATE`):** Enables incoming call detection for Caller ID.
- **Notifications:** Delivers high-priority sound alerts for new leads, calls, and reminders.

---

## 2. Automatic Android Call Sync

Sales reps make dozens of calls every day. In traditional CRMs, reps forget to log calls or spend an hour at the end of the day typing manual reports. Ridhzo automates this completely.

### How it works
1. **Background Sync:** The native Android call-log module runs in the background and syncs calls directly via `/api/mobile/calls/sync`.
2. **Data Captured Automatically:**
   - Call direction: Outgoing, Incoming, or Missed.
   - Exact talk duration in seconds.
   - Precise call start and end timestamps.
   - Lead matching and audio recording logs (if enabled).
3. **Smart Follow-up Auto-Completion:**
   - **Answered calls:** When an outgoing or incoming call is answered and completed, Ridhzo marks matching pending follow-ups for that lead as **Completed** automatically.
   - **Unanswered calls:** If a call is missed or rings out (0-second duration), the call attempt is logged on the timeline, but the follow-up task remains **Open** so the rep remembers to call back.
4. **Smart Missed-Call Filtering:**
   - If a customer calls a sales rep and the rep misses it, the phone's native dialer already alerts the rep. Ridhzo detects this and suppresses redundant CRM push notifications to that rep's device, while logging the missed call on the timeline and alerting other team channels if assigned.

---

## 3. Smart Caller ID Directory

Sales reps often receive calls from leads whose numbers are not saved in their personal phone contacts.

### How it works
- **Local Phone Key Pre-Caching:** The mobile app pre-downloads active lead phone keys and names via `/api/mobile/calls/phone-keys` and `/api/mobile/caller-id`.
- **Live Caller Identification:** When an incoming call arrives, Ridhzo matches the phone number locally in milliseconds using high-speed trigram search.
- **Caller Context:** The phone displays the lead's name, deal stage, and requirements before the rep answers, allowing the rep to greet the customer personally.

---

## 4. Mobile Lead Profile & 1-Click AI Actions

The mobile app provides complete parity with the web Lead Profile:

### Streamlined layout
- **Organised Header:** Lead name, phone, email, priority badge, and lead score. Below it, **Owner, Stage, and Tags** are displayed in one clear row.
- **One-Tap Actions:** Dedicated quick-action buttons:
  - **WhatsApp:** Opens WhatsApp or WhatsApp Web with pre-filled personalised template.
  - **Call:** Dials through native phone dialer with background call sync.
  - **SMS & Email:** Pre-filled draft messages.
- **Activity Timeline:** Complete chronological feed of notes, calls, WhatsApp messages, emails, status changes, and meetings.
- **Custom Fields:** View and edit all organization custom fields inline. Company field is optional.

### 1-Click AI Suggestions (`/api/mobile/leads/[id]/ai-suggestions`)
Powered by Ridhzo's unified lead-context engine:
- **1-Click Field Auto-fill:** Suggests extracting data from recent calls or notes (e.g. Budget: ₹75L, Preferred Location: Gachibowli) with a single "Apply" tap.
- **1-Click Status Transitions:** Recommends moving the lead to the next status stage based on conversation milestones.
- **Live Next Best Action (NBA):** Real-time streamed recommendation guiding the rep on the immediate next move.
- **Stage Playbooks:** Displays stage-specific qualifying questions and objection-handling scripts directly on the phone.

---

## 5. Offline Sync & Conflict Detection

Sales reps often work in basements, construction sites, client premises, or remote areas with poor connectivity.

### How offline mode works
- **Offline Lead Capture:** Use **Quick Add** to capture new leads offline. Leads are saved to local encrypted device storage.
- **Offline Editing:** Update notes, change statuses, or reschedule follow-ups with zero network.
- **Incremental Sync:** When internet is restored, the app calls `/api/mobile/leads/sync`, downloading only leads modified since the last `sync_at` timestamp.
- **Version Claiming & Conflict Detection:** If a lead was updated on the web while being edited offline on mobile, Ridhzo flags the conflict and prevents accidental data overwrites.
- **Mobile Idempotency (`Idempotency-Key`):** Mobile mutations include unique idempotency headers so cellular network reconnects never create duplicate notes or tasks.

---

## 6. Field Meetings & GPS Check-in

- **Meeting Schedule:** View upcoming site visits, showroom appointments, and client demos.
- **GPS Check-in:** Field reps tap "Check In" upon arriving at a site visit or client office. Location coordinates and timestamp are verified and logged as proof of visit.
- **Meeting Outcomes:** Mark Completed, No-show, or Cancelled, record outcome notes, and schedule the next follow-up in a single step.

---

## 7. Push Notification Channels & Speed-to-Lead

- **High-Priority Channels:**
  - **New Leads:** High-priority sound and vibration channel ensures reps hear alerts immediately even when phone is in doze mode.
  - **Calls & Reminders:** Urgent alerts for upcoming meetings and scheduled callbacks.
- **Direct Tap Routing:** Tapping a notification routes directly into the lead's profile, enabling reps to reply on WhatsApp in under 30 seconds.
- **App Badges:** Real-time badge counter on the app icon indicates unworked leads and overdue follow-ups.

---

## 8. Multi-Language & Regional Customization

- Available in **English**, **हिन्दी (Hindi)**, and **తెలుగు (Telugu)**.
- Formats currency and deal values in workspace currency (default Indian Rupees ₹ INR with Lakhs / Crores notation, or custom organization currency).

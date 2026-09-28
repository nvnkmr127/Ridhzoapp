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

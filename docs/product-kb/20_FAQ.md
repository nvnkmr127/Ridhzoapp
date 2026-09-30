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

**Can I sign in with my mobile number?**
Yes. You can sign in using your mobile phone number (with country code) and password or OTP, as well as with Google or Email.

## Pricing
**Is there a free plan?** Yes — Free forever: 1 user, 300 leads, 1 source, 2 automations, 1 sequence, 15 AI credits/month.
**How much are paid plans?** Starter ₹249/month (3 users, 5,000 leads), Unlimited ₹449/month (unlimited users & leads). Yearly plans get 2 months free. GST extra.
**Are soft-deleted users counted as seats?** No. Seats are only counted for active team members and pending invites.
**Is there a trial?** Every new account gets a 14-day Starter trial, no card required.
**Can I cancel?** Any time. You keep your plan until the period ends, then move to Free without losing data.
**How do I pay?** UPI, cards or net banking via Razorpay. GST invoices provided with 1-click PDF download/print.
**Do you have coupons or agency pricing?** Coupon codes are supported at checkout. Agencies can contact the Ridhzo team about complimentary plans for their clients.

## Leads & sources
**What is a Customer Reference Number (CRN)?**
Every lead is assigned a unique, sequential Customer Reference Number (`CRN-xxxx`) and `displayId` so reps and customers can refer to specific deals unambiguously on calls or in messages.
**What is the Pre-Call Brief?**
A 1-click dossier button on the lead profile that summarizes lead requirements, budget, timeline, past objections, and suggested opening talking points right before dialing.
**How fast do Facebook leads arrive?** Within seconds of the form being submitted.
**Can multiple organizations connect to the same Facebook Page?**
Yes. Ridhzo supports multi-tenant Facebook Page sharing, copying incoming leads to all connected accounts automatically.
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
**Can I send emails from my own address?** Yes — connect your SMTP (Gmail, Zoho, Outlook, etc.) with custom reply-to support. Inbound replies filter out automated bounce/OOO messages automatically.

## Team & security
**How do team invites work?**
Admins can invite teammates via Email, direct WhatsApp share, or copyable invite link. The guided Profile Gaps banner alerts new users to complete their phone, WhatsApp, and timezone details.
**Can I control what my team sees and does?** Yes — built-in Admin/Member roles and custom roles with granular permissions, enforcing least-privilege defaults.
**How are leads assigned?** Round-robin, team rotation, capacity-based, per-source, automation rules, or manually/in bulk.
**Is my data safe?** Each workspace is fully isolated, secrets are encrypted, deletions go to a 30-day recycle bin, and every important action is recorded in the audit log.
**Can I permanently delete leads?** Yes — authorized admins can permanently purge leads via the purge endpoint for GDPR compliance.
**What is the Super-Admin Platform Console?** A centralized administrative portal (`/admin`) for platform operators to manage multi-tenant accounts, subscription overrides, system health, and customer assistance.
**How do I get technical support?** You can raise, track, and manage support tickets directly in **Settings → Support**, handled directly by the Ridhzo team.

## AI
**Will AI message my customers without me knowing?** Never. AI drafts; a human approves and sends.
**What is AI Business Profile Context?**
You can define your company's core pitch, offerings, target audience, and brand tone guidelines so AI suggestions, pre-call briefs, and reply drafts match your brand perfectly.
**What are 1-click AI suggestions, NBA and Insights Popovers?** On the lead profile, AI reads full lead context (status history, notes, custom fields) to recommend 1-click field auto-fills, 1-click status advances, stage playbooks, real-time next best actions, and compact contextual popovers.
**What are AI credits?** One credit = one AI generation via `consumeAiCredit`. Free 15, Starter 300, Unlimited 2,000 per month; reset monthly.
**What happens if an AI response fails or is invalid?**
If an AI generation fails or encounters network errors, the credit is refunded automatically and a graceful fallback is provided.
**What can the AI Assistant do?** Search leads, show details, change status, add tags, set reminders, assign leads, schedule meetings and draft messages for approval.

## Integrations
**Does Ridhzo have an API?** Yes — REST API returning CRN and activity sequence tracking with full or read-only keys, plus outbound webhooks for lead events.
**Does it work with Zapier/Make/Pabbly?** Yes, through inbound webhooks, the API and outbound webhooks.
**Does it sync with Google Calendar?** Yes — meetings and booking-page appointments.
**Can Ridhzo improve my Facebook ad results?** Yes — Meta Conversions API (CAPI) sends lead-quality signals back to Meta with live delivery status tracking (sent/pending/failed) and a built-in test ping tool in Settings.

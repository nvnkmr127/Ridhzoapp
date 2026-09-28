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

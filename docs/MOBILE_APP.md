# Ridhzo Mobile App Guide

> Endpoints below were corrected to the real `/api/v1/*` routes (2026-10-02). The mobile client lives in the separate `ridhzo-mobile` repo; there is no PWA build and iOS is not yet shipped.

This document is the complete product and architectural reference for the **Ridhzo Mobile App** (Android & iOS).

---

## 1. Overview
The Ridhzo Mobile App is built to empower sales reps and business owners to manage leads on the move with:
- **Zero manual logging:** Android calls, talk duration, and timestamps are synced automatically in the background.
- **Smart Caller ID:** Pre-cached lead phone keys identify incoming callers before picking up.
- **Instant speed-to-lead:** High-priority push notifications with direct deep-linking to lead profiles.
- **One-tap outreach:** WhatsApp, phone call, SMS, and email with auto-populated templates.
- **1-Click AI Suggestions:** Auto-fill fields, update stages, and view stage playbooks on mobile.
- **Conflict-safe offline mode:** Add and edit leads with zero connectivity using incremental sync and version conflict detection.
- **GPS Check-in:** Location-verified check-ins for site visits and field meetings.

---

## 2. Platforms & Technology Stack
- **Native Android App (APK):** Built with React Native and Expo (`nvnkmr127/ridhzo-mobile`), custom native Android call log module (`modules/call-log`), Keystore AES-GCM encrypted caller ID directory, and Android notification channels.
- **iOS Readiness:** Native iOS support in preparation (there is no PWA build).
- **State Management & Caching:** TanStack React Query with encrypted SQLite offline cache and token revocation.
- **Backend APIs:** Dedicated high-performance `/api/v1/*` endpoints with session caching and Redis-backed device deduplication.

---

## 3. Mobile Authentication & Onboarding
Ridhzo supports three fast login methods on mobile:
1. **Mobile Phone + OTP:** SMS/Watxio OTP verification via `/api/v1/auth/otp/send` and `/api/v1/auth/otp/verify`.
2. **Google OAuth:** Fast single-sign-on.
3. **Email & Password:** Standard credentials with secure JWT issuance.

### Session Security & Device Management
- **Token Revocation:** User sessions and device JWTs can be revoked instantly (`/api/v1/auth/logout`) from web settings or upon sign-out.
- **Redis Device Registration Deduplication:** Rapid device registration requests during network reconnection are deduplicated via Redis, pruning stale push tokens and preventing duplicate delivery.
- **In-App Account Deletion (`DELETE /api/v1/me`):** Stores require in-app account deletion. Users can permanently delete their account with explicit confirmation (`{ confirm: "DELETE" }`), soft-deleting user details, reassigning open leads, ending active sessions, and removing device push tokens.

---

## 4. Automatic Android Call Sync & Follow-up Completion

### Background Call Sync
- **Module:** Native Android module (`modules/call-log`) detects phone calls and batches logs to `/api/v1/calls/sync`.
- **Captured Data:** Call direction (Incoming, Outgoing, Missed), caller phone number, timestamp, and talk duration in seconds.
- **Trigram Matching:** The backend leverages PostgreSQL trigram indexing (`pg_trgm`) to match phone numbers instantly across any international or local format (`+91 98765 43210`, `9876543210`).
- **Call Recording Uploads:** Call recording uploads (`/api/v1/leads/{id}/attachments`) support standard audio containers (MP3, M4A, AAC, 3GP, WAV) even when hardware recorders save streams with mismatched file extensions.

### Smart Follow-up Auto-Completion
- **Answered calls:** When an outgoing or incoming call is completed, Ridhzo automatically marks any pending follow-up reminder for that lead as **Completed**.
- **Unanswered calls:** If a call is unanswered or missed, the attempt is recorded in the activity timeline, but the follow-up reminder remains **Open** so the rep remembers to call back.
- **Smart Missed-Call Filtering:** Suppresses redundant push notifications to the phone that already displayed the native missed-call alert.

---

## 5. Smart Caller ID Directory
- **Pre-downloading Phone Keys:** The app fetches active lead phone keys via `/api/v1/calls/numbers` and `/api/v1/calls/caller-id`.
- **Encrypted Local Storage:** Caller-ID lookup keys and records are encrypted on device via Android Keystore AES-GCM with hashed lookup keys.
- **Incoming Call Overlay:** When a lead rings the rep's personal or business phone, the phone displays the lead's name, deal stage, and requirements before answering.

---

## 6. Mobile Lead Profile, Bulk Actions & AI Suggestions
- **Clean Mobile Header:** Displays lead name, phone, email, priority, lead score, and an organized row for Owner, Stage, and Tags.
- **Live Next Best Action:** Streams the optimal next step in real time.
- **Bulk Actions (`/api/v1/leads/bulk`):** Multi-select leads for batch status transitions, reassignments, deletion, or contact creation (up to 100 leads per request, with idempotency).
- **Lead CSV Export (`/api/v1/leads/export`):** Mobile users with `leads.export` permission can export their assigned leads to CSV.
- **Mobile AI Suggestions (`/api/v1/leads/[id]/ai/suggestions/[suggestionId]`):**
  - **1-Click Field Auto-fill:** Extracts budget, location, and requirements from call notes with 1-click apply.
  - **1-Click Status Transitions:** Advances lead stage based on qualification milestones.
  - **Status Playbooks:** Guides reps with stage-specific qualifying questions and objection-handling scripts.

---

## 7. Offline Mode & Conflict Resolution
- **Offline Lead Capture:** New leads created via Quick Add are saved locally with unique client IDs.
- **Incremental Sync (`/api/v1/leads?sync=1`):** When connectivity returns, the app syncs only leads modified since the last `sync_at` timestamp.
- **Conflict Detection:** If a lead was edited concurrently on web and mobile, Ridhzo flags the conflict and prevents silent data overwrites.
- **Mobile Idempotency (`Idempotency-Key`):** Mobile mutations include unique idempotency headers to ensure flaky cellular connections never produce duplicate records.

---

## 8. Field Meetings & GPS Check-in
- **Schedule Overview:** View today's site visits, client consultations, and property viewings.
- **GPS Check-in:** Reps verify their presence on location with timestamped GPS coordinates.
- **Outcomes & Next Steps:** Record outcome notes (Completed, No-show, Rescheduled) and set subsequent follow-ups in a single step.

---

## 9. Notification Channels & Preferences
- **High-Priority Push Channels:** Dedicated Android channels for New Leads (loud alert sound), Calls, and Reminders.
- **Channel Opt-Out Preferences (`/api/v1/notification-prefs`):** Users can customize which push channels notify them (`leads`, `reminders`, `meetings`, `updates`), backed by `users.push_opt_out`.
- **Direct Tap Routing:** Tapping alerts deep-links straight into the relevant lead profile.
- **Languages:** English, हिन्दी (Hindi), and తెలుగు (Telugu).
- **Currencies:** Formatted in workspace currency (default INR / ₹ with Lakhs and Crores formatting).

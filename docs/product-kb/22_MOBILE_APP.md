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

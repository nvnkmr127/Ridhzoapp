# Mobile App

Mobile app overview, audit, pre-marketing QA, and notifications / offline behaviour.

> Consolidated from 5 source file(s). Content is verbatim; headings are nested two levels deeper under each section. Edit the original files if they still exist, then regenerate.

## Contents

1. [Ridhzo Mobile App Guide](#1-ridhzo-mobile-app-guide) — `docs/MOBILE_APP.md`
2. [Ridhzo Mobile App — Audit (2026-09-27)](#2-ridhzo-mobile-app--audit-2026-09-27) — `docs/MOBILE_APP_AUDIT_2026-09-27.md`
3. [Ridhzo Mobile — Pre-Marketing QA (2026-10-01)](#3-ridhzo-mobile--pre-marketing-qa-2026-10-01) — `docs/MOBILE_PRE_MARKETING_QA_2026-10-01.md`
4. [Notifications, Mobile App & Offline](#4-notifications-mobile-app--offline) — `docs/product-kb/16_NOTIFICATIONS_MOBILE_OFFLINE.md`
5. [Ridhzo Mobile App (Android & iOS)](#5-ridhzo-mobile-app-android--ios) — `docs/product-kb/22_MOBILE_APP.md`

---

## 1. Ridhzo Mobile App Guide

> Source: `docs/MOBILE_APP.md`

### Ridhzo Mobile App Guide

This document is the complete product and architectural reference for the **Ridhzo Mobile App** (Android & iOS).

---

#### 1. Overview
The Ridhzo Mobile App is built to empower sales reps and business owners to manage leads on the move with:
- **Zero manual logging:** Android calls, talk duration, and timestamps are synced automatically in the background.
- **Smart Caller ID:** Pre-cached lead phone keys identify incoming callers before picking up.
- **Instant speed-to-lead:** High-priority push notifications with direct deep-linking to lead profiles.
- **One-tap outreach:** WhatsApp, phone call, SMS, and email with auto-populated templates.
- **1-Click AI Suggestions:** Auto-fill fields, update stages, and view stage playbooks on mobile.
- **Conflict-safe offline mode:** Add and edit leads with zero connectivity using incremental sync and version conflict detection.
- **GPS Check-in:** Location-verified check-ins for site visits and field meetings.

---

#### 2. Platforms & Technology Stack
- **Native Android App (APK):** Built with React Native and Expo (`nvnkmr127/ridhzo-mobile`), custom native Android call log module (`modules/call-log`), and Android notification channels.
- **Progressive Web App (PWA):** Works seamlessly on iOS and Android browsers with "Add to Home Screen" support.
- **State Management & Caching:** TanStack React Query with encrypted SQLite offline cache and token revocation.
- **Backend APIs:** Dedicated high-performance `/api/mobile/*` endpoints with session caching and Redis-backed device deduplication.

---

#### 3. Mobile Authentication & Onboarding
Ridhzo supports three fast login methods on mobile:
1. **Mobile Phone + OTP:** SMS/Watxio OTP verification via `/api/mobile/auth/send-otp` and `/api/mobile/auth/verify-otp`.
2. **Google OAuth:** Fast single-sign-on.
3. **Email & Password:** Standard credentials with secure JWT issuance.

##### Session Security & Device Management
- **Token Revocation:** User sessions and device JWTs can be revoked instantly (`/api/mobile/auth/token-revoke`) from web settings or upon sign-out.
- **Redis Device Registration Deduplication:** Rapid device registration requests during network reconnection are deduplicated via Redis, pruning stale push tokens and preventing duplicate delivery.

---

#### 4. Automatic Android Call Sync & Follow-up Completion

##### Background Call Sync
- **Module:** Native Android module (`modules/call-log`) detects phone calls and batches logs to `/api/mobile/calls/sync`.
- **Captured Data:** Call direction (Incoming, Outgoing, Missed), caller phone number, timestamp, and talk duration in seconds.
- **Trigram Matching:** The backend leverages PostgreSQL trigram indexing (`pg_trgm`) to match phone numbers instantly across any international or local format (`+91 98765 43210`, `9876543210`).

##### Smart Follow-up Auto-Completion
- **Answered calls:** When an outgoing or incoming call is completed, Ridhzo automatically marks any pending follow-up reminder for that lead as **Completed**.
- **Unanswered calls:** If a call is unanswered or missed, the attempt is recorded in the activity timeline, but the follow-up reminder remains **Open** so the rep remembers to call back.
- **Smart Missed-Call Filtering:** Suppresses redundant push notifications to the phone that already displayed the native missed-call alert.

---

#### 5. Smart Caller ID Directory
- **Pre-downloading Phone Keys:** The app fetches active lead phone keys via `/api/mobile/calls/phone-keys` and `/api/mobile/caller-id`.
- **Incoming Call Overlay:** When a lead rings the rep's personal or business phone, the phone displays the lead's name, deal stage, and requirements before answering.

---

#### 6. Mobile Lead Profile & 1-Click AI Suggestions
- **Clean Mobile Header:** Displays lead name, phone, email, priority, lead score, and an organized row for Owner, Stage, and Tags.
- **Live Next Best Action:** Streams the optimal next step in real time.
- **Mobile AI Suggestions (`/api/mobile/leads/[id]/ai-suggestions`):**
  - **1-Click Field Auto-fill:** Extracts budget, location, and requirements from call notes with 1-click apply.
  - **1-Click Status Transitions:** Advances lead stage based on qualification milestones.
  - **Status Playbooks:** Guides reps with stage-specific qualifying questions and objection-handling scripts.

---

#### 7. Offline Mode & Conflict Resolution
- **Offline Lead Capture:** New leads created via Quick Add are saved locally with unique client IDs.
- **Incremental Sync (`/api/mobile/leads/sync`):** When connectivity returns, the app syncs only leads modified since the last `sync_at` timestamp.
- **Conflict Detection:** If a lead was edited concurrently on web and mobile, Ridhzo flags the conflict and prevents silent data overwrites.
- **Mobile Idempotency (`Idempotency-Key`):** Mobile mutations include unique idempotency headers to ensure flaky cellular connections never produce duplicate records.

---

#### 8. Field Meetings & GPS Check-in
- **Schedule Overview:** View today's site visits, client consultations, and property viewings.
- **GPS Check-in:** Reps verify their presence on location with timestamped GPS coordinates.
- **Outcomes & Next Steps:** Record outcome notes (Completed, No-show, Rescheduled) and set subsequent follow-ups in a single step.

---

#### 9. Notification Channels & UI Customization
- **High-Priority Push Channels:** Dedicated Android channels for New Leads (loud alert sound), Calls, and Reminders.
- **Direct Tap Routing:** Tapping alerts deep-links straight into the relevant lead profile.
- **Languages:** English, हिन्दी (Hindi), and తెలుగు (Telugu).
- **Currencies:** Formatted in workspace currency (default INR / ₹ with Lakhs and Crores formatting).

---

## 2. Ridhzo Mobile App — Audit (2026-09-27)

> Source: `docs/MOBILE_APP_AUDIT_2026-09-27.md`

### Ridhzo Mobile App — Audit (2026-09-27)

**Scope:** the Expo / React Native app at `../ridhzo app` (repo `nvnkmr127/ridhzo-mobile`, commit `ead1cd7`), its native Android module (`modules/call-log`), and the `/api/v1` backend routes it calls in this repo.

**Method:** I read every source file in `app/`, `components/`, `lib/` and `modules/call-log`, then traced each workflow into the backend route it hits. I also ran `tsc --noEmit` (clean) and the five `lib/*.test.ts` files (all pass).

**Not done:** I did not run the app on a device or simulator. Every finding comes from reading the code, plus TypeScript, the unit tests, and one regex test run in Node. I did not open the Firebase service-account file (see C1).

**Paths:** mobile paths are relative to `ridhzo app/`. Backend paths start with `src/`.

**Severity counts:** 3 Critical · 10 High · 23 Medium · 21 Low.

---

#### Critical

##### C1 · Firebase Admin service-account key is committed and pushed to GitHub
- **Where:** `ridhzo-firebase-adminsdk-fbsvc-8c679a289e.json` (repo root; added in commit `51c66a0`; remote `github.com/nvnkmr127/ridhzo-mobile`)
- **Category:** Security / Configuration · **Severity:** Critical · **Layer:** Configuration
- **Current:** A file with Google's standard service-account key name is tracked in git and pushed. `.gitignore` does not exclude it. I didn't open it, so its contents are unverified.
- **Expected:** Admin credentials never ship in a client repo. The app only needs `google-services.json` / `GoogleService-Info.plist`.
- **Root cause:** The file was dropped into the project root and added with the rest of the project.
- **Fix:** (1) Revoke the key now in GCP → IAM → Service accounts → Keys, and create a new one only on the server that sends pushes. (2) Remove the file from git history (`git filter-repo --path <file> --invert-paths`) and force-push. (3) Add `*adminsdk*.json` to `.gitignore`. (4) If the repo was ever public or shared, check the project's audit logs.
- **Related:** `.gitignore`, backend push sender (`src/lib/push/mobile.ts`)

##### C2 · Settings tab crashes on Android ("Rendered more hooks than during the previous render")
- **Where:** `components/CallSyncSettings.tsx:33` (early return) and `:48` (`useState` after it)
- **Category:** Runtime error · **Severity:** Critical · **Layer:** Frontend
- **Current:** On the first render `state` is `null`, so the component returns before `useState(false)` runs. Once `refresh()` sets `state`, the next render calls one more hook than before and React throws. This affects Android builds with the native module, for any user with `leads.edit`. The comment on line 18 describes exactly this rule.
- **Expected:** The Settings screen renders.
- **Root cause:** `const [syncing, setSyncing] = useState(false)` sits below `if (!callLogAvailable || state === null) return null;`.
- **Fix:** Move the `syncing` state above the early return.
- **Related:** `app/(tabs)/settings.tsx:78`

##### C3 · Plaintext SQLite lead store survives sign-out and leaks across workspaces
- **Where:** `lib/sqlite.ts` (whole file; `clearDatabase` is never called), `lib/leadCache.ts:29-37`, `lib/auth.tsx:113-123`, `app/(tabs)/index.tsx:138-143`
- **Category:** Security / Privacy / Data · **Severity:** Critical · **Layer:** Frontend
- **Current:** Every loaded leads page (name, phone, email, company, full JSON) is written to `ridhzo_<orgId>.db` unencrypted. Sign-out clears the encrypted React Query cache but never this database. The next person on the phone can read it: offline, the Leads list shows it (`sqlite.getLeads`) and lead previews come from it. `leadPreview` is called without an org id, so it opens a `ridhzo_default.db`, finds nothing, and then **searches every other open workspace database** (`sqlite.ts:172-178`). The README says the offline data is encrypted and wiped on sign-out; the SQLite store is neither.
- **Expected:** Offline data is encrypted or scoped, and wiped on sign-out. It is never read across workspaces.
- **Root cause:** The SQLite store was added alongside the encrypted persister without wiring it into sign-out or the encryption design.
- **Fix:** On sign-out, call `sqlite.clearDatabase(orgId)` and delete the db files. Pass `user.organizationId` into `leadPreview`. Delete the fallback that scans other databases. Either remove the SQLite layer (the encrypted query cache already covers offline) or open it with SQLCipher and a key from the keystore.
- **Related:** `lib/queryClient.ts:77-81`, `lib/encryptedStorage.ts`

---

#### High

##### H1 · Email validation rejects any address containing the letter "s"
- **Where:** `components/lead/LeadForm.tsx:31`
- **Category:** Logic / Validation · **Severity:** High · **Layer:** Frontend
- **Current:** `EMAIL_RE = /^[^s@]+@[^s@]+.[^s@]+$/`. Tested in Node: `suresh@gmail.com` → false, `sales@acme.in` → false, and `a@bcd` → true. Creating or editing a lead with such an email fails with "Enter a valid email".
- **Expected:** Standard email validation.
- **Root cause:** `\s` lost its backslash, so `[^s@]` excludes the letter "s" instead of whitespace. The `.` is also unescaped.
- **Fix:** `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`, plus a test in `lib/` for it.
- **Related:** `app/lead/new.tsx`, `app/lead/edit/[id].tsx`

##### H2 · Budget, Location, Industry, Company size and Website are never saved
- **Where (backend):** `src/app/api/v1/leads/route.ts:131-138` (create), `src/app/api/v1/leads/[id]/route.ts:210-236` (edit), `src/domains/customFields/service.ts:287-373` (`validateWith` returns only defined custom-field keys)
- **Category:** Incomplete feature / Data loss · **Severity:** High · **Layer:** Backend (API)
- **Current:** The mobile form sends these five workspace-configurable fields, and the server merges them into `customData`. `CustomFieldService.validate` then keeps only keys that are defined custom fields, so they are dropped. On edit, the loop that restores "stored non-editable keys" puts the **old** value back. The API returns 200 and the app shows "Changes saved" or "Lead created", but nothing is stored. The client blocks saving until "mandatory" ones are filled, and that input is then discarded.
- **Expected:** These fields persist, just like `company` (which has its own column).
- **Root cause:** The configurable fields live in `customData` but go through the custom-field validator, which only knows org-defined fields.
- **Fix:** Validate the five keys separately (string, max 255), merge them into `validated` after `CustomFieldService.validate`, and allow `null` to clear. Apply this to both POST and PATCH. Add an API test for create, edit, and clear.
- **Related:** `components/lead/LeadForm.tsx:95-112`, `components/lead/OverviewTab.tsx:624-631`

##### H3 · One phone call can open two "How did the call go?" sheets and be logged twice
- **Where:** `lib/useDialer.ts`, `app/lead/[id].tsx:145-149`, `app/call-queue.tsx:39-43`, `components/CallPopupHandler.tsx:94-110`, `modules/call-log/.../CallerIdReceiver.kt:145-156`
- **Category:** Logic / Race condition / UX · **Severity:** High · **Layer:** Frontend + Native
- **Current:** For a call to a lead placed from inside the app, up to four paths react to the same call:
  1. `useDialer` opens the lead screen's sheet (or the call queue's).
  2. The native `onCallEnded` event opens `CallPopupHandler`'s global sheet.
  3. The app-resume scan can open it again.
  4. A native "Call ended" notification is posted.

  `handledRefs` is only known to `CallPopupHandler`. Each sheet logs with its own idempotency key, and "Answered" can mark the follow-up complete twice.
- **Expected:** One prompt per call, whichever path sees it first.
- **Root cause:** Several call-detection paths were added without a shared "handled" registry.
- **Fix:** Move the handled-`externalRef` set into `lib/callLog.ts`. Check and mark it in `useDialer` before `onBack`, and in `CallPopupHandler`. Skip the native completed-call notification while the app is in the foreground.
- **Related:** `components/lead/sheets.tsx:45-250`

##### H4 · Offline-queued actions can be silently lost
- **Where:** `lib/offline.ts:33-91`, `lib/queryClient.ts:26-31`
- **Category:** Error handling / Data loss · **Severity:** High · **Layer:** Frontend
- **Current:**
  - A queued call, note, status, or reply that later fails for good (4xx, such as a deleted lead or a lost permission, or three failed retries) is dropped. The component that queued it is usually gone, and `MutationCache` has no `onError`. The rep was already told "saved — it'll sync".
  - When NetInfo reports "connected" but nothing gets through (lifts, captive portals), the action is not queued. It spins through three 15-second timeouts and then fails.
- **Expected:** A queued action either reaches the server or the user is told it failed, with a retry option.
- **Root cause:** No global failure handler for replayed mutations. "Queued" is decided by `onlineManager` only.
- **Fix:** Add `MutationCache({ onError })`. For mutations whose key starts with `"queue"`, show a persistent toast or banner ("1 change couldn't sync — tap to retry or discard") and keep the failed variables. On a network-type error, treat the action as paused and re-queue it.
- **Related:** `components/OfflineBar.tsx`

##### H5 · Call-log sync is on by default, including for the next user on the phone
- **Where:** `lib/callLog.ts:63-96`, `lib/callLog.ts:175-187`, `lib/callLog.ts:243-247`
- **Category:** Privacy / Consent · **Severity:** High · **Layer:** Frontend
- **Current:**
  - Granting call-log access (asked on first tap-to-call) turns sync on and chains two more prompts, for phone state and for audio media.
  - On every launch, `ensureBackgroundSync` turns sync on whenever the permission is granted and the flag isn't explicitly `"0"`.
  - Sign-out removes the flag (`resetCallSync`), so the **next person who signs in** starts syncing call metadata right away, with a 7-day backfill. The comment says they should "start with it off".
  - The Settings copy calls it "opt-in".
- **Expected:** Explicit opt-in per user, with each permission explained when it's asked for.
- **Root cause:** An "auto-enable if permission present" shortcut in `ensureBackgroundSync` and `requestCallLogPermission`.
- **Fix:** Only `CallSyncSettings.turnOn` sets the flag. `ensureBackgroundSync` registers the task only when the flag is `"1"`. Sign-out writes `"0"` instead of removing the flag. Ask for audio and phone-state permissions only when the user enables recordings or caller ID.
- **Related:** `components/CallSyncSettings.tsx`, `app/_layout.tsx:52-67`

##### H6 · Call-recording detection can upload unrelated personal audio to the CRM
- **Where:** `modules/call-log/android/.../CallLogModule.kt:128-237`, `components/lead/sheets.tsx:70-171`
- **Category:** Privacy / Logic · **Severity:** High · **Layer:** Native + Frontend
- **Current:**
  - The recording for a call is picked by a heuristic: any audio file whose name contains the number's digits, or whose modified time falls in the call window and whose name contains "rec" or "call". The folder fallback accepts **any** file in the time window.
  - "Upload" is on by default (`attachRecording = true`). Tapping any outcome uploads the file as a lead attachment.
  - The note gets `[Call recording: …]` even if the upload fails, and failures are swallowed (`.catch(() => {})`), including when offline.
  - Each lookup scans the whole MediaStore audio library.
- **Expected:** Only confirmed call recordings, uploaded only after an explicit tap, with upload success reported.
- **Root cause:** A best-effort matcher plus opt-out upload.
- **Fix:** Default `attachRecording` to false and show the file name and date before uploading. Require a number match (drop the time-only fallback). Add the note marker only after the upload succeeds, and show errors. Add a selection clause and date bound to the MediaStore query.
- **Related:** `lib/callLog.ts:294-341`, `components/CallPopupHandler.tsx:85`

##### H7 · WhatsApp Business (BSP) templates are sent as free text, not as approved templates
- **Where:** `components/lead/WhatsAppTab.tsx:73-81`, `lib/api.ts:437-438`
- **Category:** Incomplete feature / API · **Severity:** High · **Layer:** Frontend
- **Current:** Tapping a template chip copies the rendered body into the text box, and sending posts `{ body }`. Outside the 24-hour window, Meta rejects free text. The screen's own hint says only approved templates go through there. The API already accepts `templateName`, but the app never sends it.
- **Expected:** Template chips send `{ templateName }`, and free text is offered only when the window is open.
- **Root cause:** The template chip reuses the personal-mode fill-the-box behaviour.
- **Fix:** Make the template chip send `api.sendWhatsApp(id, { templateName: t.name })` (with a confirm). Keep free text as a separate path.
- **Related:** `src/app/api/v1/leads/[id]/whatsapp/route.ts`

##### H8 · Call Logs screen is broken on iOS but reachable from two places
- **Where:** `app/call-logs.tsx:104-114, 250-264`, `app/(tabs)/index.tsx:174`, `app/(tabs)/settings.tsx:86`
- **Category:** Incomplete feature / Platform · **Severity:** High · **Layer:** Frontend
- **Current:** On iOS, `callLogAvailable` is false, so the screen shows "Call Log Permission Required" with an "Allow" button that does nothing. `requestCallLogPermission` returns false. View-only roles also see the entry points.
- **Expected:** The entry points are hidden where the feature can't work.
- **Fix:** Show the header icon and the Settings row only when `callLogAvailable`. On the screen itself, add an explicit "Not available on iPhone" state.

##### H9 · Offline list shows leads the user can no longer open (deleted or reassigned)
- **Where:** `lib/sqlite.ts:80-127`, `app/(tabs)/index.tsx:151-153`, `lib/leadCache.ts`
- **Category:** State sync / Authorization · **Severity:** High · **Layer:** Frontend
- **Current:** SQLite only ever upserts. Rows for leads that were deleted, reassigned away, or moved out of the rep's scope are never removed. Offline, they appear in the list, and leads can be previewed that the server would return 404 for.
- **Expected:** The local store matches what the server currently returns for this user.
- **Fix:** On a successful first-page refetch with no filter, replace (don't merge) the rows for that scope. Delete the local row on lead delete or reassign-away (`patchLeadInListCaches(…, null)` call sites). Better still, drop SQLite; see C3.

##### H10 · Release configuration isn't ready for the Play Store
- **Where:** `eas.json` (`production.android.buildType: "apk"`), `modules/call-log/android/src/main/AndroidManifest.xml:2-7`, `app.json → android.permissions`
- **Category:** Configuration / Store compliance · **Severity:** High · **Layer:** Configuration
- **Current:**
  - Production builds an APK, but Play requires an AAB.
  - The manifest declares `READ_CALL_LOG`, `READ_PHONE_STATE`, `SYSTEM_ALERT_WINDOW` and `READ_MEDIA_AUDIO`. Its own comment says it's "fine for the sideloaded APK".
  - Play requires a Permissions Declaration for call log (CRM exception) and a justification for `READ_MEDIA_AUDIO`.
  - There's no privacy-policy link in the app (see M20).
- **Fix:** `buildType: "app-bundle"` for production. Prepare the Play declarations, or gate these permissions behind a sideload/enterprise flavour.

---

#### Medium

##### M1 · Queued actions call `onSuccess` twice, and the second call wipes new input
- **Where:** `lib/offline.ts:79-89`, `components/lead/NotesTab.tsx:23-30`, `components/lead/sheets.tsx:107-114`
- **Category:** State management · **Severity:** Medium · **Layer:** Frontend
- **Current:** Offline, `run()` calls `onSuccess(true)` immediately. When the mutation later succeeds and the screen is still mounted, `useMutation`'s `onSuccess` calls `onSuccess(false)` again. In Notes, this clears whatever the rep is typing (`setDraft("")`). Elsewhere it causes a second toast and a second `onClose()`.
- **Fix:** Track "already reported" per `requestId`, or don't pass `onSuccess` to `useMutation` when the action was queued.

##### M2 · Status change isn't optimistic, and its feedback contradicts itself
- **Where:** `app/lead/[id].tsx:152-164`, `lib/offline.ts:38-58`
- **Category:** UX / State · **Severity:** Medium · **Layer:** Frontend
- **Current:**
  - Offline: the toast says "Status saved" while the badge still shows the old status until sync. `onMutate` only patches `completeFollowUp`.
  - Online: "Status: X" appears before the server confirms, followed by an error alert if it fails.
- **Fix:** In `onMutate`, patch `["lead", id]` and the list rows for `status` too, and roll back on error. Show the toast from `onSuccess`.

##### M3 · Most edits aren't offline-aware and just spin forever
- **Where:** `components/lead/sheets.tsx:517` (NextFollowUpSheet), `NotesTab.tsx:31-47` (edit/delete), `app/lead/new.tsx`, `app/lead/edit/[id].tsx`, `OverviewTab.tsx` (tags, stage, value, assign), `MeetingSheet.tsx`, `app/lead/meeting/[id].tsx`
- **Category:** Missing loading and offline states · **Severity:** Medium · **Layer:** Frontend
- **Current:** With `networkMode: "online"`, these mutations pause with no message. The button stays in "loading" and the sheet stays open. By contrast, "Call back" is queued but "Follow-up" isn't.
- **Fix:** Either queue them through `ACTIONS` (follow-up, tag, and note edit are simple), or check `onlineManager.isOnline()` and show "You're offline — try again when connected".

##### M4 · Double-tap creates duplicates
- **Where:** `components/lead/sheets.tsx:235-245` (outcome rows stay tappable while pending), `sheets.tsx:534-538` (follow-up presets), `FilesTab.tsx:74-80`, `OverviewTab.tsx:494-512` (sequence actions), `app/lead/[id].tsx:165` (delete)
- **Category:** Race condition · **Severity:** Medium · **Layer:** Frontend
- **Fix:** Disable the rows while `isPending`. Each `run()` generates a new idempotency key, so the server can't dedupe these.

##### M5 · View-only roles see edit actions that fail silently
- **Where:** `components/lead/OverviewTab.tsx:277-283` (Next Best Action buttons: Set follow-up, Book meeting, Add phone/email), `OverviewTab.tsx:176-180`, `components/lead/sheets.tsx:317-322` (`logSent` has no `onError`)
- **Category:** Authorization / UX · **Severity:** Medium · **Layer:** Frontend
- **Current:** The header disables Follow-up and Meeting for view-only users, but the Next Best Action card still offers them. Composer sends call `/contact`, which returns 403, and the error is swallowed.
- **Fix:** Pass `canEdit` into `nbaButtons` and filter out `followup`, `meeting` and `edit`. Add `onError` to `logSent`.

##### M6 · Calls and WhatsApp sent from some screens aren't logged
- **Where:** `app/(tabs)/follow-ups.tsx:238`, `app/cold.tsx:59-60`, `app/call-logs.tsx:372`
- **Category:** Consistency / Business logic · **Severity:** Medium · **Layer:** Frontend
- **Current:** These screens use raw `tel:` / `wa.me` links. There's no outcome prompt and no `/contact` log, so a lead messaged from "Going cold" stays cold. The lead screen and the call queue use `useDialer` and log correctly.
- **Fix:** Use one shared `useDialer` path and one "open WhatsApp and log it" helper everywhere.

##### M7 · Call logged from the "Call ended" notification gets the wrong start time
- **Where:** `app/lead/[id].tsx:131-137`, `CallerIdReceiver.kt:193`
- **Category:** Data correctness · **Severity:** Medium · **Layer:** Frontend + Native
- **Current:** `startedAt: new Date().toISOString()` records the time the notification was tapped, not when the call happened. The deep link carries `ref`, `dur` and `dir`, but no start time.
- **Fix:** Add `&at=<startedAt>` to the intent URI and use it.

##### M8 · Back button dead-ends when a screen was opened from a push or deep link
- **Where:** `components/ui.tsx:147,155` (`router.back()`), `app/lead/[id].tsx:171`
- **Category:** Navigation · **Severity:** Medium · **Layer:** Frontend
- **Current:** Opening a lead from a push on cold start leaves no history, so Back and Close do nothing.
- **Fix:** `router.canGoBack() ? router.back() : router.replace("/(tabs)")`.

##### M9 · New and Edit lead forms reset while the user is typing
- **Where:** `app/lead/new.tsx:45` (`key={defs.length-me.id}`), `app/lead/edit/[id].tsx:45`
- **Category:** State management · **Severity:** Medium · **Layer:** Frontend
- **Current:** If custom fields or `/me` finish loading after the form opens (cold cache), the key changes, the form remounts, and typed input is lost.
- **Fix:** Show a loader until `defs` and `me` are ready, or seed new fields into the existing state instead of remounting.

##### M10 · Theme bugs: Play button invisible in dark mode; missing color tokens
- **Where:** `components/lead/ActivityTab.tsx:104-114`, `app/call-logs.tsx:253`
- **Category:** UI / Theme · **Severity:** Medium · **Layer:** Frontend
- **Current:**
  - `bg-primary` is `#f5f5f5` in dark mode, with a white icon and white text, so the button is invisible.
  - The "playing" state uses `bg-destructive`, which is grey (`#2b2b2b` / `#e5e5e5`), not red.
  - `bg-warning/20` isn't a palette token, so it renders nothing.
- **Fix:** Use `colors["primary-foreground"]` for the icon and text, use `bg-danger` for stop, and add `warning` to `lib/palettes.js` or drop it.

##### M11 · Recordings are attached to the wrong calls, and playback URLs expire
- **Where:** `components/lead/ActivityTab.tsx:140-197`
- **Category:** Logic · **Severity:** Medium · **Layer:** Frontend
- **Current:**
  - Any audio attachment created within 15 minutes of a call is treated as that call's recording.
  - It plays `profile.attachments[].url`, a signed link that expires after 10 minutes (`FilesTab.tsx:36`), so playback fails on a lead screen left open.
- **Fix:** Store the attachment id on the call activity (`externalRef`) and fetch a fresh link on play via `api.attachmentLink`.

##### M12 · AI recap spends credits automatically on lead open
- **Where:** `components/lead/OverviewTab.tsx:241`, `src/lib/ai/leadAssist.ts:101-108`
- **Category:** Performance / Cost · **Severity:** Medium · **Layer:** Frontend + Backend
- **Current:** Opening a lead whose activity changed since the last recap generates a new one and calls `consumeAiCredit`, even if the rep never looks at it. Busy reps drain the monthly credits just by browsing.
- **Fix:** Serve only the cached recap on GET, and generate on an explicit "Summarize" tap. Alternatively, don't charge credits for automatic recaps.

##### M13 · Sign-out may not revoke the server token
- **Where:** `lib/auth.tsx:113-115`, `lib/api.ts:15-30`
- **Category:** Auth / Race condition · **Severity:** Medium · **Layer:** Frontend
- **Current:** `api.logout()` is fired without `await`, and `clearToken()` runs right after. If the in-memory token cache is older than 60 seconds, `getToken()` is still reading SecureStore when the delete runs. The logout can then go out without a bearer, and the token stays valid for up to 30 days.
- **Fix:** `const t = await getToken(); await api.logout().catch(()=>{})` (with a short timeout), then clear.

##### M14 · Heavy synchronous work on the JS thread
- **Where:**
  - `app/(tabs)/index.tsx:138-143`: every page load or refetch re-stringifies and upserts **all** loaded pages synchronously.
  - `index.tsx:151-152`: offline, `sqlite.getLeads` runs synchronously during render, on every keystroke.
  - `lib/queryClient.ts:56-74`: `recentLeadIds()` re-sorts every lead query once per query during each persist, which is O(n²).
  - `CallLogModule.kt:150-155`: an unfiltered full MediaStore scan.
- **Category:** Performance · **Severity:** Medium · **Layer:** Frontend + Native
- **Fix:** Upsert only the newest page, from `onSuccess`, off the render path. Memoize the offline query on `[search, status, mine, online]`. Compute `recentLeadIds` once per dehydrate. Add a date selection to the MediaStore query.

##### M15 · Caller-ID overlay covers the incoming-call screen and can't be dismissed
- **Where:** `modules/call-log/.../CallerIdReceiver.kt:288-320`
- **Category:** UX (native) · **Severity:** Medium · **Layer:** Native
- **Current:** A full-width `TextView` with 120 px top padding sits over the top of the dialer UI and ignores touches. On top of that, every call with a lead posts a heads-up "Call ended" notification.
- **Fix:** Use a compact card with a close button and auto-hide. Make the completed-call notification low-priority, or skip it when the app is in the foreground.

##### M16 · Call Logs filter chips overflow on narrow phones
- **Where:** `app/call-logs.tsx:242-247`
- **Category:** UI / Responsive · **Severity:** Medium · **Layer:** Frontend
- **Fix:** Wrap the chips in a horizontal `ScrollView`, as the Leads status chips already do.

##### M17 · File upload has no timeout or progress, and a malformed success is treated as success
- **Where:** `lib/api.ts:448-488`
- **Category:** Error handling · **Severity:** Medium · **Layer:** Frontend
- **Current:** `xhr.timeout` is never set, so a stalled upload spins forever. A 2xx response with an unparsable body resolves as `{ id: "" }`.
- **Fix:** Set `xhr.timeout` (e.g. 120 s) with `ontimeout`, report `upload.onprogress`, and treat an unparsable body as an error.

##### M18 · Past times can be picked for follow-ups and reschedules on Android
- **Where:** `components/WhenPicker.tsx:48`
- **Category:** Validation · **Severity:** Medium · **Layer:** Frontend
- **Current:** `minimumDate` only limits the date step. The Android time step accepts earlier times today, so a follow-up can be "moved" into the past. The booking screen guards against this (`inPast`), but these pickers don't.
- **Fix:** Reject or clamp `next < now` before calling `onChange`.

##### M19 · Rehydrated session has no refresh-failure path
- **Where:** `lib/auth.tsx:55-77`
- **Category:** Auth / Session · **Severity:** Medium · **Layer:** Frontend
- **Current:** If the token exists but `ridhzo.user` is missing, `user` stays null and the login screen shows while a valid token sits in the keystore. A refresh that fails with a network error is silently dropped, and nothing retries it before the 30-day expiry.
- **Fix:** Fall back to `api.me()` to rebuild the user. Retry the refresh on the next foreground.

##### M20 · No privacy policy, terms or data-deletion entry in the app
- **Where:** `app/(tabs)/settings.tsx`, `app/login.tsx:199`
- **Category:** Missing functionality / Compliance · **Severity:** Medium · **Layer:** Frontend
- **Current:** The app handles call logs, recordings and location but has no privacy link. The backend already has `/data-deletion`. The "Create your workspace at app.ridhzo.com" line isn't tappable.
- **Fix:** Add Privacy, Terms and Data deletion rows (opening the web pages), and make the web link tappable.

##### M21 · Tests exist but nothing runs them
- **Where:** `package.json` (no `test` script, no jest), `.github/workflows/eas-build.yml` (build only)
- **Category:** Code quality · **Severity:** Medium · **Layer:** Configuration
- **Current:** Five `lib/*.test.ts` files pass under `npx tsx`, but CI never runs them. Nothing covers `LeadForm` validation (H1) or `CallSyncSettings` (C2).
- **Fix:** Add `"test": "for f in lib/*.test.ts; do tsx $f || exit 1; done"` and `"typecheck": "tsc --noEmit"`, and add a CI job that runs both on push.

##### M22 · Build artifacts with signed URLs are committed
- **Where:** `eas_logs.txt` (360 KB), `build.json`, `.idea/`, `modules/call-log/android/.gradle/`
- **Category:** Configuration / Hygiene · **Severity:** Medium · **Layer:** Configuration
- **Current:** `.gitignore` lists these files, but they were committed before the rule existed, so they're still tracked.
- **Fix:** `git rm --cached` them. Add `.idea/` and `**/.gradle/` to `.gitignore`.

##### M23 · Production crash reports have unreadable stack traces
- **Where:** `eas.json` (`SENTRY_DISABLE_AUTO_UPLOAD=true` in every profile), `app.json` (`autoUploadSourceMaps: false`)
- **Category:** Observability · **Severity:** Medium · **Layer:** Configuration
- **Fix:** Enable upload for `production` with `SENTRY_AUTH_TOKEN` as an EAS secret.

---

#### Low

| # | Issue | Where | Category | Fix | Layer |
|---|---|---|---|---|---|
| L1 | Dead code: SQLite `follow_ups` / `sync_queue` tables and 5 functions; 9 unused UI state components (`OfflineState`, `TimeoutState`, `NoResultsState`, `ValidationErrorsState`, `PermissionDeniedState`, `UnauthorizedState`, `InitialBootLoader`, `ScreenRefreshControl`, `ListFooterLoader`); unused imports `cachedLeads`, `filterLeads`, `UserPlus`; unused `pauseRecording`, `getPlaybackStatus`, `span`, `getPerfLog` | `lib/sqlite.ts:52-289`, `components/ui.tsx:461-597`, `app/(tabs)/index.tsx:13`, `app/call-logs.tsx:23` | Code quality | Delete | FE |
| L2 | `fieldFromError` "company size" branch is unreachable because "company" matches first | `components/lead/LeadForm.tsx:201-205` | Logic | Check "company size" first | FE |
| L3 | No "Forgot password" on email sign-in | `app/login.tsx:147-180` | Missing feature | Link to the web reset page | FE |
| L4 | After re-login, the `next=` redirect drops its query (`compose=missed_call`, `callAction=log`) | `app/_layout.tsx:41` | Navigation | Pass the full href with params | FE |
| L5 | Tab labels show "WhatsApp (0)" and "Files (0)" while the profile is still loading | `app/lead/[id].tsx:375-378` | UI state | Omit counts until loaded | FE |
| L6 | Inconsistent names: empty states say "a lead's Tasks tab" but the tab is "Follow-ups"; "Call Logs" vs "Call logs"; README says SDK 54 (package is 57); package name is `privyr-mobile` | `follow-ups.tsx:223`, `meetings.tsx:162`, `call-logs.tsx:223`, `README.md`, `package.json` | Consistency | Align wording | FE |
| L7 | Duplicated logic: the `wa.me` builder appears in 5 places, `tel:` dialing in 5, an audio player in 3, plus repeated `onError` alert helpers | `sheets.tsx`, `OverviewTab.tsx`, `cold.tsx`, `follow-ups.tsx`, `meeting/[id].tsx`, `call-logs.tsx`, `ActivityTab.tsx` | Duplication | One `lib/contact.ts` helper | FE |
| L8 | Bulk selection survives filter and search changes, so hidden leads get bulk-edited | `app/(tabs)/index.tsx:89` | Logic / UX | Clear selection on filter change | FE |
| L9 | App opens in the system theme before the saved preference loads | `lib/theme.tsx:37-45` | UI | Hold the splash until the preference is read | FE |
| L10 | Hard-coded colors (`#8b5cf6`, `#f97316`, `#16a34a`, `#22c55e`, `#3b82f6`, `#ef4444`) bypass the monochrome palette | `OverviewTab.tsx`, `ActivityTab.tsx`, `call-logs.tsx`, `[id].tsx:76` | Consistency | Add semantic tokens | FE |
| L11 | `console.warn` logs the full request URL, including search text (names, phones), in release builds | `lib/api.ts:68` | Privacy | Log the path only, or `__DEV__` only | FE |
| L12 | The assignee picker renders every user as a chip, and there's no "Unassigned" option | `OverviewTab.tsx:386-393` | UX | Use a sheet list with search | FE |
| L13 | Opportunity value accepts `1.2.3` | `OverviewTab.tsx:435` | Validation | Allow a single decimal point | FE |
| L14 | `setupNotifications` sets `configured = true` before creating channels, so a failure is never retried | `lib/push.ts:36-64` | Error handling | Set the flag after success | FE |
| L15 | `CallPopupHandler.handleCallEnded` reads a stale `activeCall` from its first-render closure | `components/CallPopupHandler.tsx:54, 95-100` | Logic | Use a ref | FE |
| L16 | The Leads header has 4 icons plus Add next to the title, which is crowded on small phones | `app/(tabs)/index.tsx:172-179` | UI | Move Call logs and Going cold into a menu | FE |
| L17 | The Notifications inbox has no pagination; tapping a notification without a route only marks it read | `app/notifications.tsx` | Missing feature | Keyset paging; a detail sheet | FE+API |
| L18 | Per-lead follow-ups can only be completed; cancel and reschedule exist only in the Follow-ups tab | `components/lead/TasksTab.tsx:51-75` | Inconsistency | Reuse the Follow-ups sheet | FE |
| L19 | Call Logs doesn't offer "Add as lead" for unknown numbers (the `UserPlus` icon is imported but unused) | `app/call-logs.tsx` | Incomplete feature | Prefill `/lead/new?phone=` | FE |
| L20 | `useDialer` keeps polling the call log every 5 s for up to 1 h while the lead screen is open | `lib/useDialer.ts:6-48` | Performance / battery | Stop after the first foreground check, or listen for `onCallEnded` | FE |
| L21 | The recycle bin can't purge permanently, unlike the web (`leads.purge`) | `app/recycle-bin.tsx` | Parity | Add behind the permission | FE |

---

#### Summary views

##### Critical issues
- **C1:** Firebase admin key in git
- **C2:** Settings crash on Android
- **C3:** Plaintext SQLite not wiped on sign-out, and read across workspaces

##### High-priority issues
- **H1:** Email regex rejects addresses with "s"
- **H2:** Five default lead fields are never saved (backend)
- **H3:** Duplicate call-outcome sheets and double logging
- **H4:** Queued offline actions lost silently
- **H5:** Call sync on by default, including for the next user
- **H6:** Recording heuristic uploads unrelated audio
- **H7:** BSP templates sent as free text
- **H8:** Call Logs broken on iOS
- **H9:** Stale leads in the offline list
- **H10:** APK plus restricted permissions block the Play Store

##### Missing functionality
- Forgot password (L3)
- Privacy, Terms and Data deletion links (M20)
- Offline failure feedback and retry (H4)
- Offline handling for most edits (M3)
- "Add as lead" from Call Logs (L19)
- Unassign a lead (L12)
- Notifications paging (L17)
- Per-lead follow-up cancel and reschedule (L18)
- Permanent purge (L21)
- Upload progress and timeout (M17)

##### Incomplete features
- **Configurable default fields:** the UI works, but the backend drops them (H2)
- **WhatsApp BSP templates:** API ready, UI doesn't use it (H7)
- **Call recordings:** heuristic matching, privacy risk, expiring playback links (H6, M11)
- **Call Logs:** Android only, yet exposed on iOS (H8)
- **SQLite offline store:** unencrypted, never pruned, half-built outbox (C3, H9, L1)
- **The `ui.tsx` state components:** built but never used (L1)

##### UI issues
- M10 (invisible Play button, missing color tokens)
- M15 (caller-ID overlay)
- M16 (chip overflow)
- L5, L9, L10, L16

##### UX issues
- H3, M2, M5, M6, M8, M9, M18, L3, L8, L12, L18

##### Code quality issues
- C2, M21, M22, M23, L1, L2, L7, L11, L14, L15

##### Logic issues
- H1, H2, H9, M1, M4, M7, M11, M13, L2, L8

---

#### Recommended fix order

1. **Today:**
   - C1: revoke the key, then purge it from history.
   - C2: move one `useState`.
   - H1: fix one regex.
   - H10: set `buildType` if a Play release is planned.
2. **Next:**
   - C3 + H9: wipe SQLite on sign-out and pass the org id, or remove the SQLite layer.
   - H2: backend: persist the five default fields.
   - H5: explicit opt-in for call sync.
3. **Then:**
   - H3: shared "handled call" registry.
   - H4 + M1: global handler for queued-action failures, and dedupe `onSuccess`.
   - H6: opt-in recording upload.
   - H7: send `templateName`.
   - H8: hide Call Logs on iOS.
4. **Hardening:**
   - M3 and M4 (offline and double-submit)
   - M8 (back fallback)
   - M13 (logout race)
   - M14 (JS-thread work)
   - M21 (run the tests in CI) and M23 (Sentry)
5. **Cleanup:** the Low items, starting with L1 (dead code) and L7 (shared contact helpers).

#### Overall assessment

The app has solid foundations:
- a typed API client with timeouts and 401 → sign-out;
- an AES-GCM-encrypted persisted query cache;
- idempotency keys on queued actions;
- keyset pagination;
- permission-gated UI backed by server checks;
- careful offline messaging;
- clean `tsc` and passing unit tests.

Most problems sit in the newer layers added on top: the SQLite cache, call-log sync, call recordings, and the global call popup. Those layers skipped the sign-out and privacy guarantees the original code had, and they overlap with each other (H3). The three Critical items and H1/H2 are small, local fixes with large impact. Fix those before the next build goes to users.

---

## 3. Ridhzo Mobile — Pre-Marketing QA (2026-10-01)

> Source: `docs/MOBILE_PRE_MARKETING_QA_2026-10-01.md`

### Ridhzo Mobile — Pre-Marketing QA (2026-10-01)

**Verdict: close. One blocker (confirm Firebase key revoked), plus an untested release build.** The code-level problems from the 09-27 audit are mostly fixed. I could not run the app on a device, so the release build and the user journey are still unverified.

#### What this is, and is not

**Not done: no device run.** This machine has no Android emulator (no AVD), no APK, no iOS simulator, and 3.7 GB free disk. I did **not** install the app, tap through any screen, or test slow networks, push delivery, payments, keyboards or screen sizes. Sections 1, 14, 15 and 16 of your checklist are therefore **unverified**, not passed.

**Done:**
- Re-checked each Critical/High finding from `MOBILE_APP_AUDIT_2026-09-27.md` against the current mobile code (`../ridhzo app`, HEAD `4073ae6` plus uncommitted changes).
- Read the auth, sign-out, config and permission code.
- Read the backend routes the app calls: `/api/v1/auth/*`.
- Ran `tsc --noEmit` (clean) and `npm test` in the mobile repo (all pass).

Web signup/billing/isolation results are in `PRE_MARKETING_AUDIT_2026-10-01.md` and apply here, because the app has no in-app signup or checkout.

---

#### Owner decisions (2026-10-01, after the first draft)

These were in the first draft as blockers and are now closed as intended design:
- **No in-app signup:** accounts are created on the web, by design. Not a defect. (Store rules on account deletion and in-app signup only apply to apps that create accounts in-app, so the missing delete-account path is also fine.)
- **No conversion tracking in the app:** not required.
- **No payments in the app:** billing stays on the web.
- **No account-deletion path:** not required for the reason above.
- **Firebase added in production:** noted.

#### Blocker

##### B1. Confirm the old Firebase Admin key is revoked
- **Severity:** Critical until confirmed. **Blocks marketing:** Yes, until confirmed.
- `ridhzo-firebase-adminsdk-fbsvc-8c679a289e.json` is in the pushed git history of `ridhzo-mobile` (commits `51c66a0`, `2e1d37c`) and still on disk. Adding Firebase to production does not remove that exposure.
- **Check:** in GCP → IAM → Service accounts → Keys, key `8c679a289e` should be deleted and the server should use a new key. If so, this is closed. History scrubbing is then optional hygiene. I could not verify this.


#### High (affects acquisition, trust or store approval)

| # | Issue | Where | Fix |
|---|---|---|---|
| H1 | **Release build never smoke-tested.** `PLAY_STORE.md` itself warns R8 minification and resource shrinking (new, uncommitted in `app.json`) can strip call detection, caller-ID overlay, push or SQLCipher. No release build exists locally. | `app.json` `expo-build-properties`, `eas.json` | Build with `eas build -p android --profile production`, install on a real phone, run the full journey below. Commit the config only after that. |
| H2 | **Uncommitted release config.** `app.json`, `eas.json`, `package.json`, `PLAY_STORE.md` are modified, not committed. EAS builds from the repo state you push, so you may ship something different from what you tested. | mobile repo | Commit and tag after H1 passes. |
| H3 | **Restricted Android permissions.** `READ_CALL_LOG`, `READ_PHONE_STATE`, `SYSTEM_ALERT_WINDOW`, `READ_MEDIA_AUDIO` all declared. Play often rejects non-default-dialer apps. | `app.json` android.permissions | Submit the Permissions Declaration with an opt-in screen recording; keep a build without them as fallback (the app degrades to tap-to-call). |
| H4 | **No deep-link verification.** Only the `ridhzo://` scheme. No `intentFilters`, `associatedDomains`, `assetlinks.json` or `apple-app-site-association` anywhere. Web links in emails/ads won't open the app. Custom schemes can be claimed by other apps. | `app.json`, web `public/` | Add Android App Links and iOS Universal Links for `app.ridhzo.com`, host the two association files. |
| H5 | **No forced-update mechanism.** No min-version check in the app or in `/api/v1/me`. A breaking API change strands old installs. | `lib/`, `src/app/api/v1/me` | Return a min supported version from the API; show a blocking "Update" screen. |
| H6 | **iOS is unproven.** `app.json` declares iOS (bundle id, `supportsTablet: true`), but the call-log features are Android-only and the iOS icon has transparency (Apple rejects it, per `PLAY_STORE.md`). | `app.json`, assets | Decide: ship Android only first, or run an iOS build through TestFlight and fix. Set `supportsTablet:false` unless tablets are tested. |

#### Medium / Low

- **M1** Sign-out wipes query cache, SQLite and call-sync flag. Good. But `PRE_MARKETING_AUDIT` L6 still applies to mobile login: IP limit keys on the whole `X-Forwarded-For` header (`auth/login/route.ts:16`, `auth/otp/verify/route.ts:11`), so rotating a header value evades it, and per-email lockout (8/15 min) lets anyone lock a known user out. Parse the first hop of `x-forwarded-for`.
- **M2** `forgot-password` and `signup` open an in-app browser tab to the web. Works, but breaks flow; add a "return to app" deep link.
- **M3** OTP screen: wrong OTP clears input (good); no resend-cooldown timer was verified. Check on device.
- **M4** Expired-session handling exists (401 → `signOut(true)`, push unregistered, caches cleared). Verify on device that a user mid-action lands on login with a message, not a blank screen.
- **M5** 09-27 Medium/Low items (M1–M23, L1–L21 in that audit) were not re-checked individually. Re-run the offline-queue, double-tap and view-only-role items on a device.
- **L1** `distribution: internal` preview builds and `dist/` (web export) are in the repo folder; keep out of store builds.

---

#### 09-27 findings: re-check result

| 09-27 | Status now | Evidence |
|---|---|---|
| C1 Firebase key committed | **Partially fixed** (untracked + ignored); confirm revocation → B1 | `git ls-files` clean; history has it |
| C2 Settings hook crash | **Fixed** | `useState(syncing)` now at line 18, before the early return at 34 |
| C3 Plaintext SQLite across sign-out | **Fixed** | SQLCipher in `lib/sqlite.ts` + `sqlite.wipe()` in `clearQueryCache()`; called by sign-out and sign-in |
| H1 Email regex rejects "s" | **Fixed** | `EMAIL_RE` no longer present |
| H5 Call sync default-on | **Fixed in code** | `requestCallLogPermission` only asks for call log; sync starts only from the Settings toggle |
| H10 APK for production | **Fixed** | `eas.json` production = `app-bundle` (uncommitted, H2) |
| H2–H4, H6–H9 | **Not re-verified** | need device or deeper code read |

#### Checklist coverage

| § | Area | Result |
|---|---|---|
| 1 Install/launch, 14 UI, 15 perf, 16 edge | **Not tested** (no device) |
| 2 Signup | Web only; verified in web audit; no in-app signup (by design) |
| 3 Login | Code reviewed: email/password, phone OTP, Google PKCE, forgot-password via web, rate limits, 401 handling. Not run on device |
| 4 Auth/security | Logout revokes token server-side, 401 ends session, tenant isolation verified in web audit. Deep-link protection not tested |
| 5 Onboarding | Not found in mobile code beyond login; not tested |
| 6–10 Features/state/API | Not run; unit tests pass |
| 11 Push | Code present (`expo-notifications`, device registration, Redis dedupe); delivery not tested; Firebase key must be rotated first (B1) |
| 12 Payments | None in the app (handled on web via Razorpay) |
| 13 Analytics | Not required (owner decision) |
| 17 Production readiness | Sentry configured with DSN; API URL production; privacy/terms URLs in `lib/config.ts` and linked from login/settings; no deep-link verification (H4); no min-version (H5) |

#### What I'd do next (≈ 2–3 days)

1. Confirm the old Firebase key is revoked (B1).
2. Add Android App Links / iOS Universal Links association files (H4) and a minimum-version check (H5) if wanted.
3. Build the production AAB, install on 2 real Android phones (one low-end, one recent), and run this journey: install → signup (web) → login → push permission → create lead → call a lead → log outcome → go offline, add note → back online → logout → login again → force close/reopen. Then I can complete the sections above I couldn't test.

If you give me an emulator-capable machine (or a built APK + a staging backend), I can run that journey and update this report.

---

## 4. Notifications, Mobile App & Offline

> Source: `docs/product-kb/16_NOTIFICATIONS_MOBILE_OFFLINE.md`

### Notifications, Mobile App & Offline

#### Notifications
| Channel | What you get |
|---|---|
| **High-Priority Push Channels** (Android & iOS) | Dedicated channels for **New Leads** (high priority sound), **Calls**, and **Follow-up Reminders**. Includes app icon badge count and direct tap routing into the lead profile. |
| **Smart Missed-Call Filtering** | Suppresses duplicate push alerts if the phone itself already showed the missed-call notification. |
| **In-app bell** | Full notification drawer with alert chime for incoming leads. |
| **Email notifications** | User-controlled preferences (Profile → Notification preferences). |
| **New-lead alerts** | Admin-configured alert rules via email, in-app, or official WhatsApp (see [Assignment & Alerts](08_ASSIGNMENT_AND_ALERTS.md)). |

#### Native Mobile App
- **Native Android APK & PWA:** Built for real-world sales teams. Install via the native Android APK or install from the browser on Android/iOS.
- **Mobile OTP Authentication:** Quick, secure sign-in with phone number + OTP (delivered via SMS/Watxio), plus Google and email/password login.
- **Device Management & Deduplication:** Push tokens are deduplicated via Redis, pruning inactive devices and ensuring rapid network switches never create ghost notifications.
- **Mobile Lead Profile Parity:** Mobile reps see all lead fields, form answers, activity timeline, and the mobile AI suggestions endpoint (`/api/mobile/leads/[id]/ai-suggestions`) to apply updates in 1 click.
- **One-tap communication:** WhatsApp, Phone Call, SMS, and Email directly from each lead card.
- **GPS check-in:** For on-site client meetings and field surveys.

#### Android Automatic Call Sync & Caller ID
- **Zero-Manual Call Logging:** Incoming, outgoing, and missed calls on reps' Android devices are synced automatically (`/api/mobile/calls/sync`) with timestamps, talk durations, and audio call logs.
- **Caller ID Directory:** Ridhzo pre-downloads active lead phone keys to the rep's device (`/api/mobile/calls/phone-keys`). When a lead rings the rep's personal or work phone, the phone displays the lead's name and details before the rep picks up.
- **Auto-Complete Follow-ups:** Answered calls automatically mark matching pending follow-ups as Completed. Unanswered calls remain open so callbacks aren't lost.

#### Offline Sync & Conflict Detection
- **Offline-First Lead Capture:** Add or edit leads with zero internet connection (at property expos, basement sites, or remote travels).
- **Incremental Lead Sync:** Only downloads leads that have changed since the last `sync_at` timestamp, saving bandwidth and battery.
- **Version Claiming & Conflict Detection:** If a lead was modified on the web dashboard while a rep edited it offline, Ridhzo flags the conflict and prevents silent data overwrites.
- **Mobile Idempotency (`Idempotency-Key`):** Network retries on notes, contact logs, or replies are strictly deduplicated.

#### Multi-language app
Choose the app language in your profile:
- **English**
- **हिन्दी (Hindi)**
- **తెలుగు (Telugu)**

The menu, header, and phone notifications appear in your language. AI can draft customer messages in any language.

#### Timezone & business hours
Set your workspace timezone, working days, and working hours — reminders, booking slots, and meeting schedules all follow them.

#### Why it matters
- Sales reps spend their days on the phone and in the field — Ridhzo automates logging without getting in their way.
- Instant push notifications and Caller ID ensure every call is answered with complete context.
- Offline sync with conflict detection guarantees field data is never lost or overwritten.
- Teams across India can use the app in their preferred language.

---

## 5. Ridhzo Mobile App (Android & iOS)

> Source: `docs/product-kb/22_MOBILE_APP.md`

### Ridhzo Mobile App (Android & iOS)

#### What it is
The **Ridhzo Mobile App** is a dedicated mobile sales command centre built for sales executives, field reps, and business owners who work from their phones. Rather than treating mobile as an afterthought or a stripped-down dashboard, Ridhzo puts the full power of lead capture, automatic call tracking, caller ID, and AI suggestions directly in your pocket.

Available as:
- **Native Android App (APK):** Built with React Native & Expo, featuring background call sync and caller ID directory.
- **Progressive Web App (PWA):** Installable on Android and iPhone ("Add to Home Screen") with high-priority push notifications and full offline capabilities.

---

#### 1. Getting Started & Sign-in

##### Fast login options
- **Mobile Number + Password or OTP:** Direct sign-in using mobile phone number (with country code selector) + password or SMS/Watxio OTP verification (`/api/mobile/auth/send-otp` & `/api/mobile/auth/verify-otp`).
- **Google Sign-In:** One-click OAuth sign-in.
- **Email & Password:** Standard secure sign-in.

##### Device registration & security
- **Device Registration Deduplication:** Device push tokens are registered and deduplicated using Redis, pruning stale tokens and ensuring network reconnects never cause duplicate notifications.
- **Token Revocation:** User sessions and device JWTs can be revoked instantly (`/api/mobile/auth/token-revoke`) from web settings or upon sign-out.
- **Multi-Tenant Data Isolation:** Local data is strictly partitioned per organization; switching accounts or signing out securely clears local cache.

##### Required Android permissions (for native features)
- **Call Log (`READ_CALL_LOG`):** Required to automatically sync incoming, outgoing, and missed sales calls.
- **Phone State (`READ_PHONE_STATE`):** Enables incoming call detection for Caller ID.
- **Notifications:** Delivers high-priority sound alerts for new leads, calls, and reminders.

---

#### 2. Automatic Android Call Sync

Sales reps make dozens of calls every day. In traditional CRMs, reps forget to log calls or spend an hour at the end of the day typing manual reports. Ridhzo automates this completely.

##### How it works
1. **Background Sync:** The native Android call-log module runs in the background and syncs calls directly via `/api/mobile/calls/sync`.
2. **Data Captured Automatically:**
   - Call direction: Outgoing, Incoming, or Missed.
   - Exact talk duration in seconds.
   - Precise call start and end timestamps.
   - Distinct rep call notes and outcome dispositions saved as timeline activities.
   - Lead matching and audio recording logs (if enabled).
3. **Smart Follow-up Auto-Completion:**
   - **Answered calls:** When an outgoing or incoming call is answered and completed, Ridhzo marks matching pending follow-ups for that lead as **Completed** automatically.
   - **Unanswered calls:** If a call is missed or rings out (0-second duration), the call attempt is logged on the timeline, but the follow-up task remains **Open** so the rep remembers to call back.
4. **Smart Missed-Call Filtering:**
   - If a customer calls a sales rep and the rep misses it, the phone's native dialer already alerts the rep. Ridhzo detects this and suppresses redundant CRM push notifications to that rep's device, while logging the missed call on the timeline and alerting other team channels if assigned.

---

#### 3. Smart Caller ID Directory

Sales reps often receive calls from leads whose numbers are not saved in their personal phone contacts.

##### How it works
- **Local Phone Key Pre-Caching:** The mobile app pre-downloads active lead phone keys and names via `/api/mobile/calls/phone-keys` and `/api/mobile/caller-id`.
- **Live Caller Identification:** When an incoming call arrives, Ridhzo matches the phone number locally in milliseconds using high-speed trigram search.
- **Caller Context:** The phone displays the lead's name, deal stage, and requirements before the rep answers, allowing the rep to greet the customer personally.

---

#### 4. Mobile Lead Profile, Pre-Call Brief & 1-Click AI Actions

The mobile app provides complete parity with the web Lead Profile:

##### Streamlined layout
- **Organised Header with CRN:** Lead CRN (`CRN-xxxx`), displayId, name, phone, email, priority badge, and lead score. Below it, **Owner, Stage, and Tags** are displayed in one clear row.
- **Pre-Call Brief:** 1-click dossier right before dialing: reviews lead requirements, budget, objections, and suggested conversation openers on your phone.
- **One-Tap Actions:** Dedicated quick-action buttons:
  - **WhatsApp:** Opens WhatsApp or WhatsApp Web with pre-filled personalised template.
  - **Call:** Dials through native phone dialer with background call sync.
  - **SMS & Email:** Pre-filled draft messages.
- **Activity Timeline:** Complete chronological feed with sequence tracking (`seq`) of notes, calls, rep call notes, WhatsApp messages, emails, status changes, and meetings.
- **Custom Fields:** View and edit all organization custom fields inline. Company field is optional.

##### 1-Click AI Suggestions (`/api/mobile/leads/[id]/ai-suggestions`)
Powered by Ridhzo's unified lead-context engine:
- **Lead Insights Chip:** Instant intent, budget, sentiment, and score pill.
- **1-Click Field Auto-fill:** Suggests extracting data from recent calls or notes (e.g. Budget: ₹75L, Preferred Location: Gachibowli) with a single "Apply" tap.
- **1-Click Status Transitions:** Recommends moving the lead to the next status stage based on conversation milestones.
- **Live Next Best Action (NBA):** Real-time streamed recommendation guiding the rep on the immediate next move.
- **Stage Playbooks:** Displays stage-specific qualifying questions and objection-handling scripts directly on the phone.

---

#### 5. Offline Sync & Conflict Detection

Sales reps often work in basements, construction sites, client premises, or remote areas with poor connectivity.

##### How offline mode works
- **Offline Lead Capture:** Use **Quick Add** to capture new leads offline. Leads are saved to local encrypted device storage.
- **Offline Editing:** Update notes, change statuses, or reschedule follow-ups with zero network.
- **Incremental Sync:** When internet is restored, the app calls `/api/mobile/leads/sync`, downloading only leads modified since the last `sync_at` timestamp.
- **Version Claiming & Conflict Detection:** If a lead was updated on the web while being edited offline on mobile, Ridhzo flags the conflict and prevents accidental data overwrites.
- **Mobile Idempotency (`Idempotency-Key`):** Mobile mutations include unique idempotency headers so cellular network reconnects never create duplicate notes or tasks.

---

#### 6. Field Meetings & GPS Check-in

- **Meeting Schedule:** View upcoming site visits, showroom appointments, and client demos.
- **GPS Check-in:** Field reps tap "Check In" upon arriving at a site visit or client office. Location coordinates and timestamp are verified and logged as proof of visit.
- **Meeting Outcomes:** Mark Completed, No-show, or Cancelled, record outcome notes, and schedule the next follow-up in a single step.

---

#### 7. Push Notification Channels & Speed-to-Lead

- **High-Priority Channels:**
  - **New Leads:** High-priority sound and vibration channel ensures reps hear alerts immediately even when phone is in doze mode.
  - **Calls & Reminders:** Urgent alerts for upcoming meetings and scheduled callbacks.
- **Direct Tap Routing:** Tapping a notification routes directly into the lead's profile, enabling reps to reply on WhatsApp in under 30 seconds.
- **App Badges:** Real-time badge counter on the app icon indicates unworked leads and overdue follow-ups.

---

#### 8. Multi-Language & Regional Customization

- Available in **English**, **हिन्दी (Hindi)**, and **తెలుగు (Telugu)**.
- Formats currency and deal values in workspace currency (default Indian Rupees ₹ INR with Lakhs / Crores notation, or custom organization currency).

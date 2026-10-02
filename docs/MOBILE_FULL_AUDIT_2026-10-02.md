# Ridhzo Mobile — Full Audit (2026-10-02)

**Scope.** The Expo / React Native client at `../ridhzo app` (repo `nvnkmr127/ridhzo-mobile`, HEAD `da458ff`, app 1.0.0, Expo SDK 57 / RN 0.86), its native Android module `modules/call-log`, and every `/api/v1` route in this repo that the app calls. Mobile paths are relative to `ridhzo app/`; backend paths start with `src/`.

**Method.** I read the app's code end to end, then traced each workflow into its backend route:
- Read in full: `lib/*`, `app/*`, `components/*` (except where noted below), both Kotlin files, `app.json`, `eas.json`, CI workflows, docs.
- Backend read: `apiAuth`, `mobileAuth`, `mobileRevocation`, `mobileSession`, `idempotency`, `meetingsApi`, push service, and the leads / lead-detail / attachments / devices / auth / app-config / follow-ups / restore / purge routes. Other routes were checked only for auth, idempotency and limit guards (grep), not read line by line.
- Skimmed, not read line by line: `OverviewTab`, `ActivityTab`, `TasksTab`, `WhatsAppTab`, `CustomFieldInput`, `WhenPicker`, `call-logs`, `call-queue`, `cold`, `dashboard`, `theme`, and most of `ui.tsx`.
- Executed: `tsc --noEmit` (clean), 7 `lib/*.test.ts` files (pass), `test:sync` (4 scenarios pass), `test:push` (pass), `npm audit --omit=dev`, `expo-doctor`.
- Probed production read-only: `/.well-known/assetlinks.json`, `/.well-known/apple-app-site-association`, `/api/v1/app-config`, and an unauthenticated `/api/v1/leads`.

**Not done.** I did not run the app on a device or simulator, so every item tagged **[verify on device]** is a code-based inference. No code was changed. This audit **supersedes** `MOBILE_APP_AUDIT_2026-09-27.md`: most of that audit's findings are fixed in the current code (hooks crash in `CallSyncSettings`, plaintext SQLite, email regex, double call sheet, sign-out revocation, build artifacts, CI tests, privacy links). Only items still true today are carried over.

**Counts.** 1 Critical · 8 High · 21 Medium · 14 Low.

---

## A. Executive Summary

The app is well engineered where it matters most. Auth, encrypted local storage, the offline queue with idempotency keys, conflict detection and backend authorization are all solid. No cross-tenant read path was found: every `/api/v1` lead route resolves the lead through `leadForApi` (org + ownership), and the 404-on-forbidden pattern avoids existence leaks.

It is **not ready for a public store release**. The blockers are mostly configuration and policy, not logic:

1. A Firebase Admin private key is still recoverable from git history on GitHub (C1).
2. Deep links do not work in production: `assetlinks.json` ships with an empty fingerprint list and the iOS association file still contains the `TEAMID` placeholder (H2, verified live).
3. A forced sign-out (any 401) silently destroys unsynced offline work (H1).
4. Customer-facing sends (email, BSP WhatsApp, meeting confirmations) are not idempotent (H3).
5. Play Store restricted permissions, in-app account deletion and iOS release configuration are unresolved (H5, H8).
6. Production crash reports will have unreadable stacks (M1).

Android internal-track testing can proceed once C1, H1 and H2 are fixed.

**Positives worth keeping:**
- Bearer token and cache keys in Keystore-backed SecureStore.
- AES-256-GCM encrypted query cache and SQLCipher lead store, with keys deleted at sign-out.
- PKCE-style Google sign-in; per-token revocation with rotation.
- Server re-checks user, org and role on every request.
- Idempotency keys on create, notes, contact, reply and follow-up.
- Compare-and-swap conflict detection on offline edits.
- Call-log filtering happens on the phone, before anything is sent.
- Permissions are requested at the point of use (location, audio, call log), with an opt-in switch for call sync.

---

## B. Critical Issues

### C1 · Firebase Admin service-account key remains in git history (GitHub)
| Field | Detail |
|---|---|
| Severity | **Critical** (security) |
| File / commit | `ridhzo-firebase-adminsdk-fbsvc-8c679a289e.json`, added in `51c66a0`, deleted from HEAD in `2e1d37c`. Remote: `github.com/nvnkmr127/ridhzo-mobile`. The file is also still on disk, untracked and now gitignored. |
| Current | A full service-account JSON (`private_key_id 8c679a28…`, `firebase-adminsdk-fbsvc@ridhzo.iam.gserviceaccount.com`) is retrievable from any clone. `build.json` and `eas_logs.txt` (signed EAS URLs, since expired) are also in history. |
| Expected | Admin credentials never exist in a client repo, and any key that ever did is revoked. |
| Root cause | The file was added to the project root; the later cleanup removed it from the tree only. |
| Impact | Anyone with repo access can send FCM pushes as the project and reach whatever else the account's IAM roles allow. |
| Fix | (1) In GCP IAM, delete key `8c679a289e…` and issue a new one that exists only on the API server (`FIREBASE_SERVICE_ACCOUNT`). (2) Purge with `git filter-repo --path ridhzo-firebase-adminsdk-fbsvc-8c679a289e.json --path build.json --path eas_logs.txt --invert-paths`, then force-push. (3) Check the project's audit logs for use since 2026-09-26. (4) Move the local copy out of the project folder. |
| Impact layers | FE none · BE push sender credentials · DB none · API none · Security high |
| Testing | `git log --all -- '*adminsdk*'` returns nothing; old key id is rejected by Google. |

---

## C. High Priority Issues

### H1 · A forced sign-out silently destroys unsynced offline work
- **Where:** `lib/api.ts:96` (`if (res.status === 401 && token) onUnauthorized?.()`), `lib/auth.tsx` `signOut(expired=true)` → `discardFailed()` + `clearQueryCache()`, `lib/queryClient.ts:105-110`, `lib/sqlite.ts` `wipe()`. `start()` repeats the wipe on the next sign-in.
- **Current:** On any 401 (expired token, revoked on another device, user deactivated or moved) the app wipes the persisted mutation queue, the failed-changes list, and the SQLite rows including `pending=1` and `local-*` leads. Only the manual Settings sign-out warns via `pendingChanges()`.
- **Expected:** Unsynced work is kept (encrypted, keyed to the user id) until the same user signs back in, or the user explicitly discards it.
- **Impact:** Leads created, notes and calls logged offline are lost with no message. Most likely for field reps whose session ended while out of signal.
- **Fix:** On the expired path keep the queue and pending rows, sign out of the UI only, and restore after re-login if `user.id` matches. Show "N changes waiting" on the login screen. Wipe only on an explicit sign-out or a user mismatch.
- **Layers:** FE only. No BE/DB/API change.
- **Testing:** Add a scenario to `test/offline-flow/flow.test.ts`: queue a create, force a 401, assert the queue survives and replays after re-login.

### H2 · Android App Links and iOS Universal Links do not work in production (verified live)
- **Where:** `src/app/.well-known/assetlinks.json/route.ts`, `src/app/.well-known/apple-app-site-association/route.ts`, `app.json` (`intentFilters` autoVerify, `associatedDomains`).
- **Current:** Live response is `…"sha256_cert_fingerprints":[]` and `"appIDs":["TEAMID.com.ridhzo.app"]`. Both routes are `force-static`, so `ANDROID_CERT_SHA256` and `APPLE_TEAM_ID` are baked in at build time. In `.env.example` both are commented out.
- **Impact:** `https://app.ridhzo.com/leads/<id>` links from emails and the web never open the app. Android autoVerify fails, iOS does not associate. Only the `ridhzo://` scheme and push taps reach the app.
- **Fix:** Set both variables in the production build environment, redeploy, and re-check with curl. Remove `force-static` (or confirm build env), and include the upload and Play-signing SHA-256 values. After Play enrollment, verify with `adb shell pm get-app-links com.ridhzo.app`.
- **Testing:** Add a deployment smoke check that fails on empty fingerprints or the `TEAMID` placeholder.

### H3 · Customer-facing actions are not idempotent; a timeout plus retry duplicates them
- **Where (client):** `lib/api.ts` `sendEmail`, `sendWhatsApp`, `bookMeeting`, `updateMeeting`, `createShare`, `enrollSequence` (no request id). Also `app/(tabs)/follow-ups.tsx:124` `sendMsg`, which runs `logContact` and `updateFollowUp` together and is not covered by `busy`.
- **Where (server):** only `leads`, `contact`, `reply`, `notes` and `follow-ups` use `withIdempotency`; the whatsapp, email, shares, sequences and meetings routes do not.
- **Current:** The client aborts after 15 s ("This is taking too long") while the server may already have sent. The rep taps again and the lead receives two emails, WhatsApp messages or meeting confirmations. `/api/v1` allows 600 requests/min per user and there is no per-lead send throttle.
- **Fix:** Send an `Idempotency-Key` from these calls and wrap the routes in `withIdempotency`. Add a per-lead cooldown or limit on outbound sends. Include `sendMsg.isPending` in the follow-up row's `busy`.
- **Layers:** FE + BE. Security: abuse and spam surface. No schema change (reuses `api_idempotency_keys`).
- **Testing:** Route test: the same key twice returns one send and `Idempotent-Replayed: true`.

### H4 · Recycle bin and restore are not scoped to the caller's visible leads
- **Where:** `src/app/api/v1/leads/route.ts:27-40`, `LeadService.listDeletedLeads` (org-wide, 500 rows), `src/app/api/v1/leads/[id]/restore/route.ts`.
- **Current:** Any mobile user holding `leads.delete` receives every soft-deleted lead in the workspace (name, phone, email, company) and can restore any of them. Normal lead routes use `visibleToUserSql`/`leadForApi`; these do not.
- **Expected:** Non-admins see and restore only leads they could open. Confirm against the web rule, since the web recycle bin may also be org-wide by design.
- **Fix:** Filter by `ownerId = user` for non-admins, or restrict the bin to admins. Check ownership in restore.
- **Layers:** BE + API. Security: authorization. DB: query only.
- **Testing:** Two reps in one org: rep B must get 404 restoring rep A's deleted lead and an empty list.

### H5 · Play Store blockers: restricted permissions and in-app account deletion
- **Where:** `app.json` (`READ_CALL_LOG`, `READ_PHONE_STATE`, `SYSTEM_ALERT_WINDOW`, `READ_MEDIA_AUDIO`), `modules/call-log/android/src/main/AndroidManifest.xml` (its own comment says "fine for the sideloaded APK"), `app/(tabs)/settings.tsx` ("Delete my data" only opens the privacy page).
- **Current:** Google restricts call-log permissions to default dialer or assistant apps, with narrow exceptions; non-qualifying apps are routinely rejected. Overlay and media-audio need declarations too. There is no in-app account or data deletion; sign-up links to the web.
- **Impact:** Rejection or removal from Play. The app still works without the call features (tap-to-call plus the outcome sheet), so a no-call-log flavor is a valid fallback.
- **Fix:** Submit the declaration with a screen recording, or ship a Play build with these permissions removed (`android.blockedPermissions`, feature-flag the module) and keep the full build for direct distribution. Add an in-app "Delete account" that calls an authenticated API (and a web deletion URL for the Data-safety form).
- **Layers:** FE + BE (deletion endpoint). Security/compliance.
- **Testing:** Pre-launch report on a release AAB.

### H6 · Missed-call and call-ended alerts rely on delayed work inside a manifest receiver **[verify on device]**
- **Where:** `modules/call-log/.../CallerIdReceiver.kt:130` (`Handler(Looper.getMainLooper()).postDelayed({...}, 600)`) in `onReceive`, no `goAsync()`.
- **Current:** When the app process is not running, Android can end the receiver's process right after `onReceive` returns, so the 600 ms callback may never run. The notification and the `onCallEnded` event are then skipped. This is the headline background feature ("works even when Ridhzo is closed").
- **Fix:** Call `goAsync()` and finish the `PendingResult` after the work, or hand the read to WorkManager. Test on Android 13–15 with the app swiped away and battery optimization on.
- **Layers:** Native only.

### H7 · Keyboard handling on form screens under Android edge-to-edge **[verify on device]**
- **Where:** `android/gradle.properties` (`edgeToEdgeEnabled=true`, Expo 57 default), `adjustResize`; `components/lead/LeadForm.tsx`, `app/login.tsx`, `app/lead/meeting/[id].tsx` use `KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}`. `Sheet` (modal) uses `padding` and is fine.
- **Current:** Under edge-to-edge on Android 15 the window is not resized for the IME, so the keyboard can cover lower fields and the submit button on long forms.
- **Fix:** Use `behavior="padding"` on Android as well, or add `react-native-keyboard-controller`. Verify on Android 12, 14 and 15 with a Pixel-sized and a small phone.

### H8 · iOS is not release-ready (documentation claims Android and iOS)
- **Where:** `eas.json` (no iOS build or submit profile), `.github/workflows` (Android only), `app.json` (`supportsTablet: true` with portrait lock; no `ITSAppUsesNonExemptEncryption`; icon has transparency, per `PLAY_STORE.md`), live AASA placeholder (H2).
- **Current:** Nothing in the repo builds, signs or submits an iOS binary, and iOS has no call-log, caller-ID or background call features. `docs/MOBILE_APP.md` still markets both platforms.
- **Fix:** Add an iOS EAS profile and submit config, flatten the icon, set `UIRequiresFullScreen` (or support all iPad orientations), declare encryption exemption, set `APPLE_TEAM_ID`, and run a TestFlight pass. Or scope the docs to Android-only for now.

---

## D. Medium Priority Issues

| # | Issue | File / function | Current → Expected | Fix | Layers |
|---|---|---|---|---|---|
| M1 | **Release crash stacks unreadable.** | `eas.json` — `SENTRY_DISABLE_AUTO_UPLOAD: "true"` in every profile, including `production` | Source maps never upload, so Hermes stacks are minified → upload on production builds and set `SENTRY_AUTH_TOKEN` as an EAS secret | FE/CI |
| M2 | **PII reaches Sentry via breadcrumbs.** | `lib/perf.ts` `emit()` puts the full `path` (including `?search=<name/phone>`) into breadcrumbs; Sentry's default fetch/XHR breadcrumbs also record URLs; no `beforeBreadcrumb`/`beforeSend` in `app/_layout.tsx`. The comment in `lib/api.ts` says the query string is kept out, but only the console log honors it | Strip query strings in `emit()` and add a `beforeBreadcrumb` URL scrubber | FE, Security |
| M3 | **Sign-out is best-effort.** | `lib/auth.tsx` `signOut`: `api.logout(token).catch(()=>{})`, `unregisterForPush` swallows failure and deletes its local token; `/api/v1/auth/logout` does not remove device tokens | Offline sign-out leaves the 30-day token valid and the push token registered, so the old user's lead alerts keep arriving on a phone someone else may use → persist a "pending revocation" and retry on next launch; have logout delete the user's device row by token | FE+BE, Security |
| M4 | **Sign-out is not atomic; next login does not re-wipe native state.** | `signOut` ordering (`clearToken` first, `resetCallSync` last); `start()` does not call `resetCallSync` | An app kill mid-sign-out leaves the caller-ID directory (SharedPreferences, plaintext lead names and stage lines) and `callSync.enabled`, so the next person sees the previous user's lead names on incoming calls → run `resetCallSync` + `clearCallerId` inside `start()` too | FE |
| M5 | **Time zones inconsistent.** | Client buckets (`lib/format.ts` `dueBucket`, `startOfDay`, `dayTime`, Meetings day strip) use the **device** zone; server badges (`src/app/api/v1/badges/route.ts`) and "logged today" use the **workspace** zone; meeting reminders and WhatsApp texts use workspace zone | A rep abroad, or a device with the wrong zone, sees a tab badge that disagrees with the list → format using `me.organization.timezone` (or send explicit day boundaries) | FE |
| M6 | **Site-visit check-in and meeting actions have no offline path.** | `components/MeetingSheet.tsx` (`api.checkIn`, `meetingOutcome`, `updateMeeting`), `app/lead/meeting/[id].tsx` | These fail fast offline ("Can't reach Ridhzo"), and a lost GPS fix is not retried. Check-in is a core field-offline action → queue `checkIn`/`outcome` with the captured coordinates and original timestamp | FE (+ BE accept `checkedInAt`) |
| M7 | **Request amplification on touch.** | `app/(tabs)/index.tsx:267` `onPressIn={() => prefetch(id)}` fires 3 requests (lead, profile, **AI recap**) per touch-down, including the start of a scroll | Scrolling through a list can fire dozens of requests; the earlier push-loop 429 incident shows the budget is reachable → prefetch only on press (not press-in) or debounce 150 ms and skip the recap | FE |
| M8 | **Bulk actions are unbounded and online-only.** | `index.tsx:109` `Promise.allSettled` over every selected id | N selected leads means N parallel requests (429 risk); fails offline → concurrency of 4–5 with a progress state; consider a bulk endpoint | FE (+API) |
| M9 | **No draft persistence.** | `LeadForm` (new lead), `NotesTab` draft, `ComposeSheet`, `ReplySheet`, `MeetingSheet` note | Form state is in memory. An OS kill after hours in the background, or a crash, loses typed input → persist drafts (encrypted) keyed by form and lead id | FE |
| M10 | **Permission asked at sign-in, with no rationale.** | `components/PushHandler.tsx` → `registerForPush()` (default `prompt: true`) on first user | Android 13 notification prompt appears right after login → ask after the first lead is created, or show a short explainer first | FE |
| M11 | **Generic, action-less API errors.** | `lib/api.ts:97` fallback `Request failed (N)` or "Something went wrong on our side"; `ErrorState` shows the raw message under "Couldn't load this"; `retryable()` does not honor `Retry-After` | 403 / 409 / 429 / 503 all look alike; no "sign in again", "contact your admin" or "wait N s" → map statuses to messages and actions; parse `Retry-After` | FE |
| M12 | **Meeting link not normalized.** | `MeetingSheet.tsx:132` `Linking.openURL(link)` (no `.catch`); the booking placeholder invites `meet.google.com/…` | A scheme-less URL throws and is an unhandled rejection; the server stores whatever is sent and forwards it to the lead → prepend `https://` when no scheme; allow only `http(s)`; validate server-side | FE+BE |
| M13 | **Device audio library listed as "call recordings".** | `CallLogModule.kt` `getCallRecordings` returns all audio of the last 7 days; `app/call-logs.tsx:127` matches by number **or time** | Music, voice notes and WhatsApp audio can appear as a call's recording; attach is user-confirmed, but mismatches are likely → require number match or a call-recorder filename, show the matched file name | Native+FE |
| M14 | **Caller-ID directory stored unencrypted.** | `CallLogModule.kt` `syncLeadsDirectory` → `SharedPreferences` (lead name, stage, value for every lead the user can open) | Readable on a rooted phone; also used by an overlay → encrypt (Jetpack Security) or keep only name; it is wiped on sign-out | Native |
| M15 | **OTA updates unsigned.** | `app.json` `updates.url` + `runtimeVersion: appVersion`, `checkAutomatically` ALWAYS, no `codeSigningCertificate` | A compromised Expo account could push JS to every device (which holds call-log access) → enable EAS Update code signing and staged rollout; use channels per profile (the `development` profile has none) | CI |
| M16 | **Usage limits are enforced for leads and storage only on the mobile path.** | `src/lib/apiAuth.ts` ("first-party mobile app is not metered"); routes for email, WhatsApp, sequences, meetings, calls/sync | Lead cap (`assertCanAddLead`, 402) and storage (`assertCanStore`) are enforced; other limits rely on service-level checks I did not verify, and sends have no throttle. The app has no upgrade prompt; the 402 text is shown as a plain alert | Confirm service-level limits for messages / AI / sequences; add an upgrade message and a deep link to web billing | BE+FE |
| M17 | **Stale permissions.** | `lib/session.ts` `staleTime 5 min`, persisted for 14 days; `can()` returns `true` for `leads.edit` until `/me` loads | A demoted user briefly (or offline, for up to 14 days) sees edit UI; the server still refuses (403 / `readOnly`) → refetch `/me` on foreground and after any 403 | FE |
| M18 | **Revocation latency / fail-open.** | `mobileRevocation.ts` (Redis outage → "not revoked"); `apiAuth.ts` 60 s in-process user cache | Deactivation or sign-out can take up to about a minute to bite, and a Redis outage disables revocation. Documented design; accept or shorten the TTL for admin deactivation | BE |
| M19 | **No client version header; update gate only hard-blocks.** | `components/UpdateGate.tsx`; live `app-config` returns `minVersion: null` | No soft "update available"; no `X-App-Version`/`X-Platform` header for server logging or compat; the overlay does not block hardware back or deep links; fails open when offline → send app version headers; add `recommendedVersion`; make the gate a real modal | FE+BE |
| M20 | **Documentation is stale or wrong.** | `docs/MOBILE_APP.md` documents `/api/mobile/*` routes, a PWA and `modules/call-log` APIs that do not exist (only `/api/v1/*` does; there is no `src/app/api/mobile`); mobile `SHIPPING.md` (SDK 52/54 mix, "run `eas init`", **test logins `admin@acme.com / password123`**); mobile `README` (30-day cache vs 14 in code; old tab names) | Rewrite from the code; remove the credentials | Docs |
| M21 | **Dependencies / tooling.** | `npm audit --omit=dev`: 20 advisories (8 high), all transitive build tooling (`@expo/cli`, `node-forge`, `brace-expansion`); `expo-doctor`: 7 patch-version mismatches (expo 57.0.25 vs 57.0.26, router, updates, task-manager…); no ESLint config or lint script; CI does not audit | Not an app-runtime exposure today → run `npx expo install --check`; add lint and an audit step to CI; pin Node to one version (CI uses 22, the EAS workflow uses 20) | CI |

---

## E. Low Priority Issues

| # | Issue | Where | Fix |
|---|---|---|---|
| L1 | `getItemLayout` fixes list rows at 65 px; larger system fonts overflow | `app/(tabs)/index.tsx:271` | Drop `getItemLayout`, or measure |
| L2 | No `FLAG_SECURE` or recents-thumbnail masking; lead PII visible in the app switcher | App-wide | Optional setting |
| L3 | Missed call classification: a rejected call (type 5, duration 0) is alerted as missed | `CallerIdReceiver.kt:143`; `callMatch.ts` treats 5 as incoming | Treat type 5 separately |
| L4 | Phone keys use the last 8 digits, so numbers from different countries can collide | `callMatch.ts` `phoneKey`; the server re-checks the full number | Acceptable; note in docs |
| L5 | Custom-scheme `ridhzo://lead/<id>?callAction=log&dur=…` can be fired by any installed app to pre-fill a call log sheet | `app/lead/[id].tsx:161`, native-intent | Validate `ref` format; cosmetic risk only |
| L6 | `users` endpoint returns all teammates' emails to every rep | `src/app/api/v1/users/route.ts` | Return names only to non-admins |
| L7 | Tracked file `.zcode/plans/*.md`, `artifacts/perf-baseline.md`; `google-services.json` and `GoogleService-Info.plist` are tracked (not secrets; restrict the API keys by package + SHA in GCP) | mobile repo | Remove plans; restrict keys |
| L8 | The backend repo root contains a stray Expo `app.json` (with the EAS projectId) and a scratch `index.ts` (AI Gateway test) | `ridhzo/app.json`, `ridhzo/index.ts` | Delete |
| L9 | Local generated `android/` is stale (no https App Link filter; release signed with the debug keystore). Untracked, and EAS regenerates it, but a local `expo run:android --variant release` produces a debug-signed build | `android/` | Regenerate (`expo prebuild --clean`) before any local release build |
| L10 | Sheet "Cancel" (moving) and "Cancel" (meeting) labels are ambiguous on one sheet | `MeetingSheet.tsx` | Rename |
| L11 | Notification inbox rows without a route only mark read | `app/notifications.tsx` | Detail sheet |
| L12 | Accessibility: 32 `accessibilityLabel`s across the app; several icon buttons are 36 dp with `hitSlop`; contrast not measured | `components/ui.tsx` | A TalkBack pass |
| L13 | Language: UI strings are hard-coded English (no i18n layer); country list is 15 codes; no RTL work | all screens | Only if markets require it |
| L14 | Login accepts any phone with ≥6 digits and the lead form has no client-side phone/length validation (the server enforces `max(50)` / email format) | `app/login.tsx:30`, `LeadForm.tsx` | Add `libphonenumber`-style check if desired |

---

## F. Incomplete Features
- **Offline coverage is partial.** Queued: log call / reply, notes (add, edit, delete), status, follow-up complete / cancel / reschedule / schedule / next, tags, lead create / update / delete. **Online only:** meeting booking, check-in, outcome, reschedule; file upload and recording attach; email and BSP-WhatsApp send; AI draft / recap / suggestions; assign, stage / value, sequences, share links; bulk actions; recycle-bin restore and purge.
- **iOS:** no call-log, caller ID or background call sync (by platform design); no build pipeline (H8).
- **Account deletion** is a link to the privacy page (H5).
- **Tenant / workspace switching** does not exist: one workspace per account. Users in several workspaces must sign out and in again.
- **Optional app update** prompt (only a hard block exists).
- **Notification preferences** are limited to the OS channel settings (no in-app per-type mute).

## G. Missing Features (product parity gaps I could confirm from the code)
- Add-to-calendar / device calendar sync for meetings.
- Deep links beyond `/leads/<id>` (no links for follow-ups, meetings, notifications).
- In-app sign-up (opens the web).
- Lead import and export from the phone.
- A bulk API (currently one request per lead).

---

## H. Frontend Issues
Covered in M5, M7–M12, M17, L1, L2, L10–L14, plus H7. Other observations:
- Screens have loading, empty and error states throughout (skeletons, `ErrorState`, `EmptyState`, offline copies). Dark mode is supported through palette tokens.
- Lists are virtualized with windowing props and keyset pagination; the leads list never loads the whole dataset.
- Search is debounced (300 ms) with cache keys that include the term.
- Haptics fire on every `ErrorState` mount, which can feel noisy on repeated failures.

## I. Backend Integration Issues
- **Every client endpoint exists** in `src/app/api/v1` (checked each `api.*` path). No client call hits a removed route; no dead server route called by the app was found beyond unused web-only ones.
- Payload and enum agreement is good (statuses come from `/statuses`; `Idempotency-Key`, `base` conflict payload, `sync=1` cursor all match).
- **Sync cursor** is `<iso>|<id>` over a `sync_at` trigger column with an in-flight-transaction horizon, so late-committing writes are not skipped. Sound.
- Gaps: H3 (idempotency on sends), H4 (recycle-bin scope), M12 (URL normalization), M19 (no version header).

## J. Tenant Isolation Findings
No cross-tenant exposure found. Details:

| Check | Result |
|---|---|
| API reads/writes | `leadForApi` / `LeadService.getLead(id, orgId)`; foreign or hidden ids return 404. Attachments check `organizationId` **and** lead access; signed download links bind attachment + user and re-check the user is active and in the org. |
| Token | HS256 JWT carries `sub`, `org`, `jti`; `liveUser` re-validates user, active flag and org on every request; the role is read live. |
| Local state | Query cache AES-GCM encrypted; SQLite is one SQLCipher file per org; both keys live in SecureStore and are deleted at sign-out. `start()` clears everything **before** installing a new session. |
| Cache keys | Keys (`["leads", search, status, mine]`, `["lead", id]`, `["me"]`…) contain no user or org. Isolation therefore depends on the wipe above. It is correct today, but M4 shows the wipe can be partial after an interrupted sign-out. |
| Switching | No in-app switch. Account switch = sign-out + sign-in; both clear state. `sqlite.wipe()` only closes databases opened this session; other files are sealed with a deleted key and unreadable. |
| Push | `device_tokens.token` is UNIQUE and re-assigned to the latest user on registration. A leftover token after offline sign-out is M3. |
| Native | Caller-ID directory is cleared on sign-out (M4 caveat). |
| Deep links | `/lead/<id>` always fetches through the API; another tenant's or an unauthorized id returns 404 and the lead is dropped from the local lists. |
| Weak spot | H4 (recycle bin within one org). |

## K. Authentication and Permission Findings
- **Login:** WhatsApp OTP (rate-limited server-side, 45 s client cooldown), Google (PKCE with a 2-minute code, derived signing key), email/phone + password (per-IP and per-account limits, bcrypt, generic error). Suspended workspaces are refused at issue and on every request.
- **Session:** 30-day token, renewed weekly when foregrounded and online; the old token retires after a 10-minute grace so a lost response is recoverable; sign-out revokes the `jti`. Rehydration trusts the stored session until the first 401.
- **Biometric lock, "remember me":** not implemented (always remembered).
- **Weak spots:** H1, M3, M17, M18; L5/L6.
- **Authorization matrix** (server): view-only roles get 403 on writes (`canEditLeads`); delete needs `leads.delete`; purge needs `leads.purge`; admin = `settings.manage`. The client mirrors this with `can()`; the default of `true` for `leads.edit` is cosmetic (M17).

## L. Usage Limit Findings
- Enforced server-side: lead count (`assertCanAddLead` on create and restore, HTTP 402) and storage (`assertCanStore`, 402). Offline-queued creates that hit 402 land in the "couldn't sync" list with the server's message.
- Not verified at the route: message / email sends, AI credits (service), sequences, meetings, call sync (M16).
- Concurrency across devices: the lead cap check is not shown to be race-safe under simultaneous creates from two devices; confirm in `PlanService` (counted inside a transaction or with a lock).
- Subscription change on another device: `/me` is refetched at most every 5 minutes (M17); the server is the authority.

## M. Offline and Sync Findings
**Works well:** persisted FIFO queue with backoff (2–30 s, 4 retries), Idempotency-Key per action, temporary `local-<uuid>` ids mapped to real ids, field-level conflict detection (409 → keep mine / keep theirs), failed-changes list with retry / discard, incremental pull with a 2-minute overlap and a full resync after 25 days, `gone` rows to prune reassigned / deleted leads, 15-minute background sync.

**Gaps:** H1 (wipe on forced sign-out), M6 (check-in and other mutations), M9 (drafts), the list under F, and a cold-start background task that restores the whole cache just to sync (`lib/sync.ts:96-110`), which costs battery.

Duplicate protection on create is correct (key = local uuid, also reused when an online create falls back to the queue).

## N. Notification Findings
- Registration: raw FCM token on Android, Expo token on iOS; refresh listener guarded against the earlier re-registration loop (covered by `test:push`). Server routes by token format and prunes dead tokens and tokens older than 60 days.
- Foreground, background and killed-app taps all route through `notificationRoute`; a tap while signed out is remembered and replayed after login (leads only; other targets are dropped).
- Issues: permission prompt timing (M10); stale push after offline sign-out (M3); H6 for the local missed-call alert; push-tap and in-app routes only cover leads, meetings and follow-ups.
- **Deep links:** `ridhzo://` scheme works; https App Links and Universal Links do not (H2). Link handling: `/leads/<id>` is rewritten to `/lead/<id>` by `+native-intent.tsx`; logged-out links to a lead are preserved with their query string.

## O. Performance Findings
- Strong: token cache in memory, keyset pagination, SQLite local reads, patch-in-place list updates, persisted cache excludes dashboard / badges, per-lead cap of 20 persisted leads, `useMemo` over follow-ups and meetings.
- Weak: M7 and M8 (request amplification), the whole query cache is **one** AsyncStorage value that is JSON-stringified and AES-encrypted on every change (bounded by the 20-lead cap but still a main-thread cost), cold-start sync restore, `perf` breadcrumbs on every request.
- Bundle size was not measured. `artifacts/perf-baseline.md` records earlier numbers.

## P. Security Findings
C1 · M2 · M3 · M4 · M14 · M15 · L2 · L5 · L9, plus:
- No secrets in the bundle: `app.json` holds the API URL and the Sentry **DSN** (public by design). `SENTRY_AUTH_TOKEN` lives only in the gitignored `.env`.
- `allowBackup=false`; HTTPS only in release (cleartext only through the dev-server path in `lib/config.ts`); no certificate pinning (acceptable for this threat model).
- `EXPO_PUBLIC_API_URL` overrides the production URL at build time; a local `.env` pointing at a staging or LAN host would ship in a local release build. EAS cloud builds do not read the file. The current value is the production URL.
- Receiver `exported="true"` for `PHONE_STATE` is the standard pattern; add `android:permission="android.permission.READ_PHONE_STATE"` as a hardening step.
- Backend: constant-time signature comparison, link-type attachments redirect only to `http(s)` URLs, uploads allow-listed by extension plus magic-byte check, served from a private bucket through an access-checked proxy with `nosniff` and a sandbox CSP.

## Q. Database and API Findings
- Migrations `0078_mobile_perf_indexes` and `0079_mobile_sync_cursor` are present; the sync trigger column and the idempotency table back the offline design.
- API: unversioned `/api/v1` with no client version header (M19); no `ETag` / `If-None-Match` on large lists; error bodies are consistent (`{ error, code?, details?, ref? }`) and the app reads `details` per field.
- H3 / H4 are the data-consistency issues.

## R. Testing Gaps
Existing: pure-logic unit tests (`appVersion`, `callMatch`, `callQueue`, `format`, `leadCache`, `leadSync`, `template`), an offline-flow integration test (create / update / delete / conflict / retry) and a push-loop regression. CI runs `typecheck` and `test` on every push.

Missing, in priority order:
1. 401 / forced sign-out with pending work (H1).
2. Auth: login, refresh rotation, expired and revoked token, `signOut` interruption.
3. Tenant isolation: account switch clears query cache, SQLite, caller-ID, pushes; two-rep authorization on the backend (H4).
4. Idempotency of every customer-facing send (H3).
5. Usage limits: 402 handling for create, restore and upload; concurrent creates from two devices.
6. Deep-link routing (logged out, deleted, unauthorized, another tenant) and `assetlinks` / AASA smoke test.
7. SQLite store (`reconcilePage`, `applyChanges`, wipe).
8. Call sync end to end, including the native receiver.
9. Component / navigation tests and one E2E (Maestro or Detox) for sign-in → create lead → log call.
10. Accessibility (TalkBack) and Android 12–15 keyboard behavior.

## S. Documentation Findings
See M20. Also missing: push and deep-link setup (cert fingerprint, Team ID), release / rollback procedure for OTA updates, a tenant-isolation note for the client cache, and an environment table (dev, preview, production) that matches `eas.json`.

## T. Production Readiness

| Area | Status |
|---|---|
| Security | **Blocked** — C1; M2–M4 |
| Stability | Good on paper (typecheck, tests pass); no device run; H6, H7 unverified |
| Auth / authorization | Strong; H1, H4 |
| Tenant isolation | Strong; no cross-tenant path found |
| Offline / sync | Strong design; H1, M6, M9 |
| Notifications / deep links | **Blocked** — H2; H6 |
| Monitoring | **Weak** — M1, M2 |
| Build / release | EAS production profile OK; no OTA signing (M15); iOS absent (H8) |
| Store | **Blocked** — H5 (Android), H8 (iOS) |
| Testing | Partial (R) |
| Documentation | Stale (M20) |

**Verdict:** suitable for a controlled internal / closed-testing release on Android after C1, H1 and H2; not ready for a public Play or App Store release until H3–H8 and M1–M4 are done.

---

## U. Recommended Fix Order
1. **Security:** C1 (revoke, purge, rotate); M2 (Sentry scrub); M3 / M4 (sign-out hardening); M14; M15.
2. **Tenant isolation:** M4 (re-wipe native state on sign-in), add the account-switch test.
3. **Data integrity:** H1 (keep the queue on 401); H3 (idempotency on sends and bookings).
4. **Authentication / authorization:** H4 (recycle-bin scope); M17 (refresh `/me` on 403).
5. **Critical business logic:** M5 (time zone), M6 (offline check-in), M12 (meeting URLs).
6. **API reliability:** M7, M8, M11, M19.
7. **Crashes:** H7 and H6 on real devices (Android 12–15); M1 so crashes are readable.
8. **Usage limits:** M16 (confirm limits, add the upgrade path, cap race test).
9. **Offline / sync:** M9 (drafts), extend the queue to meetings and uploads.
10. **Performance:** cold-start sync, single-blob cache write.
11. **UX:** M10 (permission timing), L1, L10–L12.
12. **Testing:** R, in the order listed.
13. **Documentation:** M20, S.
14. **Cleanup / store:** H2 (fingerprints, Team ID), H5 (Play declaration, account deletion), H8 (iOS pipeline), L7–L9, M21.

---

## Appendix 1 · Feature Completion Matrix
Legend: ✓ done · ◐ partial · ✗ missing · n/a. "Status" is from code reading and the tests above, not from a device run.

| Feature | Screen | Navigation | API | Backend | DB | Permissions | Offline | Notifications | Tests | Status | Missing items |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Sign-in (OTP / Google / password) | `login` | ✓ gate + `next` | ✓ | ✓ | ✓ | n/a | n/a | n/a | ◐ push only | **Complete** | biometric / remember-me; H1 |
| Session refresh / revoke | `auth.tsx` | ✓ | ✓ | ✓ | Redis | ✓ | ◐ | n/a | ✗ | Complete | M3, M18 |
| Leads list, search, filters | `(tabs)/index` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ SQLite | n/a | ◐ helpers | Complete | M7 |
| Bulk status / assign / delete | `index` | ✓ | ✓ per-lead | ✓ | ✓ | ✓ | ✗ | n/a | ✗ | Partial | M8, offline |
| Lead detail + overview | `lead/[id]` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ saved copy | ✓ | ✗ | Complete | — |
| Create lead | `lead/new` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | n/a | ✓ flow | Complete | M9 |
| Edit lead (conflict-safe) | `lead/edit` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | n/a | ✓ flow | Complete | M9 |
| Delete / recycle bin | `recycle-bin` | ✓ | ✓ | ◐ | ✓ | ◐ H4 | delete ✓, restore ✗ | n/a | ✗ | Partial | H4 |
| Notes / tags | `NotesTab`, `OverviewTab` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | n/a | ✗ | Complete | M9 |
| Follow-ups | `(tabs)/follow-ups`, `TasksTab` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ◐ queue logic | Complete | H3 (`sendMsg`) |
| Call queue / going cold | `call-queue`, `cold` | ✓ | ✓ | ✓ | ✓ | ✓ | read ✓ | n/a | ✓ queue | Complete | — |
| Meetings (book / check-in / outcome) | `meetings`, `lead/meeting`, `MeetingSheet` | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ | ✗ | Partial | M5, M6, M12, H3 |
| Tap-to-call + outcome | `useDialer`, `CallOutcomeSheet` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | n/a | ◐ | Complete | iOS = manual |
| Call-log sync + caller ID (Android) | `CallSyncSettings`, native | ✓ | ✓ | ✓ | ✓ | ✓ opt-in | ✓ | ✓ local | ✓ match | Partial | H5, H6, M13, M14 |
| Call logs + recordings | `call-logs` | ✓ | ✓ | ✓ | ✓ | ✓ | read ✓ | n/a | ✗ | Partial | M13 |
| WhatsApp (personal + BSP) | `WhatsAppTab`, `ComposeSheet` | ✓ | ✓ | ✓ | ✓ | ✓ | personal logs ✓, BSP ✗ | n/a | ✗ | Complete | H3 |
| Email | `ComposeSheet` | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | n/a | ✗ | Complete | H3 |
| AI recap / draft / suggestions | `OverviewTab` | ✓ | ✓ | ✓ credits | ✓ | ✓ | ✗ | n/a | ✗ | Complete | cached recap prefetch (M7) |
| Files / uploads | `FilesTab` | ✓ | ✓ | ✓ 25 MB + magic bytes | R2 | ✓ | ✗ | n/a | ✗ | Complete | queue upload |
| Sequences, share links | `OverviewTab` | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | n/a | ✗ | Complete | H3 |
| Dashboard | `(tabs)/dashboard` | ✓ | ✓ | ✓ | ✓ | scoped | cached ✓ | n/a | ✗ | Complete | M5 |
| Notifications inbox + push | `notifications`, `PushHandler` | ✓ | ✓ | ✓ | ✓ | ✓ | read ✓ | ✓ | ✓ push loop | Complete | M3, M10 |
| Settings | `(tabs)/settings` | ✓ | ✓ | ✓ | ✓ | ✓ | n/a | n/a | ✗ | Partial | account deletion (H5) |
| Update gate | `UpdateGate` | ✓ overlay | ✓ | ✓ | config | n/a | fails open | n/a | ✓ version | Partial | M19 |
| Deep links | `+native-intent`, `AuthGate` | ✓ scheme | n/a | ◐ | n/a | ✓ | n/a | ✓ | ✗ | **Broken for https** | H2 |

**Placeholders, mock data and TODOs:** none found. `grep` for `TODO|FIXME|HACK|@ts-ignore|@ts-expect-error` returns nothing in `app/`, `components/`, `lib/` or `modules/`; there are two deliberate `ponytail:` notes (bulk requests, 50-page sync pass). 89 `any` / `as any` casts remain (mostly react-query data shaping); there is no ESLint setup.

## Appendix 2 · Navigation Audit
- **Structure:** Expo Router. Root `Stack` (fade, headerless) → `index` (auth redirect) → `login`, `(tabs)` (Leads, Follow-ups, Meetings, Dashboard, Settings), and stack screens `lead/[id]`, `lead/new`, `lead/edit/[id]`, `lead/meeting/[id]`, `call-logs`, `call-queue`, `cold`, `notifications`, `recycle-bin`. Sheets are RN `Modal`s with `onRequestClose` (so Android back closes them).
- **Protected routes:** `AuthGate` redirects any signed-out path to `/login`; lead paths keep their query string in `?next=`; `login.run()` returns to it. Other targets (`/meetings`, `/notifications`, `/call-logs`) are dropped.
- **After login / logout / session expiry:** `router.replace` in all cases, so there is no back-stack leakage. A 401 on `/lead/<id>` returns to that lead after login.
- **After create / delete:** create `replace`s to the new lead (or goes back when assigned to a teammate); delete uses `goBack`, falling back to the Leads tab when there is no history (`lib/nav.ts`), which fixes push / deep-link dead ends.
- **Deep link cases (code-reasoned):** logged out → login then lead ✓; logged in → opens, `useRealId` handles a lead synced while open ✓; another tenant, deleted or unauthorized → API 404 → "Lead not found" with Try again and a Back button, and the local copy is dropped ✓; https links ✗ (H2).
- **Loops:** none found. The `AuthGate` effect is keyed on `loading/user/onLogin/segments/pathname`.
- **Hardware back:** tabs exit the app; sheets close; the update overlay does **not** intercept back (M19). **[verify on device]**
- **State restoration:** query cache and SQLite restore data, not the route; an OS kill returns to the launch route. Typed form input is lost (M9).

## Appendix 3 · Lifecycle, Permissions and Platform Notes
- **Background / foreground:** `AppState` drives focus refetch, token renewal, call sync, caller-ID sync, a recent-call scan, and the data sync (20 s minimum gap). Background tasks: `ridhzo-data-sync` and `ridhzo-call-sync` at ≥15 min (OS-controlled).
- **Permissions:** notifications (M10: at sign-in), location (when-in-use, at check-in only, 8 s timeout, falls back to no location), call log / phone state (opt-in in Settings; first tap-to-call asks once), audio (when looking for a recording), overlay (system settings). Denied states route to system settings with explanations. Camera, contacts, microphone and Bluetooth are not used.
- **Media:** uploads use the document picker only (no camera, no compression); 25 MB cap checked on both sides; progress and a 120 s timeout; no cancel button; no resumable or background upload.
- **Android build:** `allowBackup=false`, R8 + resource shrinking on for release, keep rules for the call-log module, EAS-managed signing and versionCode (`appVersionSource: remote`), AAB for production, `internal` track draft submit. **[verify on device]** that R8 keeps the receiver and overlay paths (as `PLAY_STORE.md` also warns).
- **Realtime:** none (no websockets or SSE); freshness comes from push, foreground refetch and the 5-minute sync.

## Appendix 4 · Verification Evidence
```
typecheck:        tsc --noEmit → clean
unit tests:       7 files → all pass
test:sync:        4 scenarios ✓ (offline create+update, conflict, retry/backoff, delete)
test:push:        push loop: ok
npm audit (prod): 20 advisories, 8 high — transitive build tooling
expo-doctor:      20/21 — 7 patch-version mismatches
live assetlinks:  sha256_cert_fingerprints: []        ← empty
live AASA:        appIDs: ["TEAMID.com.ridhzo.app"]    ← placeholder
live app-config:  minVersion: null                     ← no forced update configured
live /api/v1/leads (no token): 401
git history:      firebase-adminsdk key present in 51c66a0 (removed from HEAD in 2e1d37c)
```

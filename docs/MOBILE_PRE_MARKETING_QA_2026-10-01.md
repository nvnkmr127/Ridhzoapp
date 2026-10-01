# Ridhzo Mobile — Pre-Marketing QA (2026-10-01)

**Verdict: close. One blocker (confirm Firebase key revoked), plus an untested release build.** The code-level problems from the 09-27 audit are mostly fixed. I could not run the app on a device, so the release build and the user journey are still unverified.

## What this is, and is not

**Not done: no device run.** This machine has no Android emulator (no AVD), no APK, no iOS simulator, and 3.7 GB free disk. I did **not** install the app, tap through any screen, or test slow networks, push delivery, payments, keyboards or screen sizes. Sections 1, 14, 15 and 16 of your checklist are therefore **unverified**, not passed.

**Done:**
- Re-checked each Critical/High finding from `MOBILE_APP_AUDIT_2026-09-27.md` against the current mobile code (`../ridhzo app`, HEAD `4073ae6` plus uncommitted changes).
- Read the auth, sign-out, config and permission code.
- Read the backend routes the app calls: `/api/v1/auth/*`.
- Ran `tsc --noEmit` (clean) and `npm test` in the mobile repo (all pass).

Web signup/billing/isolation results are in `PRE_MARKETING_AUDIT_2026-10-01.md` and apply here, because the app has no in-app signup or checkout.

---

## Owner decisions (2026-10-01, after the first draft)

These were in the first draft as blockers and are now closed as intended design:
- **No in-app signup:** accounts are created on the web, by design. Not a defect. (Store rules on account deletion and in-app signup only apply to apps that create accounts in-app, so the missing delete-account path is also fine.)
- **No conversion tracking in the app:** not required.
- **No payments in the app:** billing stays on the web.
- **No account-deletion path:** not required for the reason above.
- **Firebase added in production:** noted.

## Blocker

### B1. Confirm the old Firebase Admin key is revoked
- **Severity:** Critical until confirmed. **Blocks marketing:** Yes, until confirmed.
- `ridhzo-firebase-adminsdk-fbsvc-8c679a289e.json` is in the pushed git history of `ridhzo-mobile` (commits `51c66a0`, `2e1d37c`) and still on disk. Adding Firebase to production does not remove that exposure.
- **Check:** in GCP → IAM → Service accounts → Keys, key `8c679a289e` should be deleted and the server should use a new key. If so, this is closed. History scrubbing is then optional hygiene. I could not verify this.


## High (affects acquisition, trust or store approval)

| # | Issue | Where | Fix |
|---|---|---|---|
| H1 | **Release build never smoke-tested.** `PLAY_STORE.md` itself warns R8 minification and resource shrinking (new, uncommitted in `app.json`) can strip call detection, caller-ID overlay, push or SQLCipher. No release build exists locally. | `app.json` `expo-build-properties`, `eas.json` | Build with `eas build -p android --profile production`, install on a real phone, run the full journey below. Commit the config only after that. |
| H2 | **Uncommitted release config.** `app.json`, `eas.json`, `package.json`, `PLAY_STORE.md` are modified, not committed. EAS builds from the repo state you push, so you may ship something different from what you tested. | mobile repo | Commit and tag after H1 passes. |
| H3 | **Restricted Android permissions.** `READ_CALL_LOG`, `READ_PHONE_STATE`, `SYSTEM_ALERT_WINDOW`, `READ_MEDIA_AUDIO` all declared. Play often rejects non-default-dialer apps. | `app.json` android.permissions | Submit the Permissions Declaration with an opt-in screen recording; keep a build without them as fallback (the app degrades to tap-to-call). |
| H4 | **No deep-link verification.** Only the `ridhzo://` scheme. No `intentFilters`, `associatedDomains`, `assetlinks.json` or `apple-app-site-association` anywhere. Web links in emails/ads won't open the app. Custom schemes can be claimed by other apps. | `app.json`, web `public/` | Add Android App Links and iOS Universal Links for `app.ridhzo.com`, host the two association files. |
| H5 | **No forced-update mechanism.** No min-version check in the app or in `/api/v1/me`. A breaking API change strands old installs. | `lib/`, `src/app/api/v1/me` | Return a min supported version from the API; show a blocking "Update" screen. |
| H6 | **iOS is unproven.** `app.json` declares iOS (bundle id, `supportsTablet: true`), but the call-log features are Android-only and the iOS icon has transparency (Apple rejects it, per `PLAY_STORE.md`). | `app.json`, assets | Decide: ship Android only first, or run an iOS build through TestFlight and fix. Set `supportsTablet:false` unless tablets are tested. |

## Medium / Low

- **M1** Sign-out wipes query cache, SQLite and call-sync flag. Good. But `PRE_MARKETING_AUDIT` L6 still applies to mobile login: IP limit keys on the whole `X-Forwarded-For` header (`auth/login/route.ts:16`, `auth/otp/verify/route.ts:11`), so rotating a header value evades it, and per-email lockout (8/15 min) lets anyone lock a known user out. Parse the first hop of `x-forwarded-for`.
- **M2** `forgot-password` and `signup` open an in-app browser tab to the web. Works, but breaks flow; add a "return to app" deep link.
- **M3** OTP screen: wrong OTP clears input (good); no resend-cooldown timer was verified. Check on device.
- **M4** Expired-session handling exists (401 → `signOut(true)`, push unregistered, caches cleared). Verify on device that a user mid-action lands on login with a message, not a blank screen.
- **M5** 09-27 Medium/Low items (M1–M23, L1–L21 in that audit) were not re-checked individually. Re-run the offline-queue, double-tap and view-only-role items on a device.
- **L1** `distribution: internal` preview builds and `dist/` (web export) are in the repo folder; keep out of store builds.

---

## 09-27 findings: re-check result

| 09-27 | Status now | Evidence |
|---|---|---|
| C1 Firebase key committed | **Partially fixed** (untracked + ignored); confirm revocation → B1 | `git ls-files` clean; history has it |
| C2 Settings hook crash | **Fixed** | `useState(syncing)` now at line 18, before the early return at 34 |
| C3 Plaintext SQLite across sign-out | **Fixed** | SQLCipher in `lib/sqlite.ts` + `sqlite.wipe()` in `clearQueryCache()`; called by sign-out and sign-in |
| H1 Email regex rejects "s" | **Fixed** | `EMAIL_RE` no longer present |
| H5 Call sync default-on | **Fixed in code** | `requestCallLogPermission` only asks for call log; sync starts only from the Settings toggle |
| H10 APK for production | **Fixed** | `eas.json` production = `app-bundle` (uncommitted, H2) |
| H2–H4, H6–H9 | **Not re-verified** | need device or deeper code read |

## Checklist coverage

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

## What I'd do next (≈ 2–3 days)

1. Confirm the old Firebase key is revoked (B1).
2. Add Android App Links / iOS Universal Links association files (H4) and a minimum-version check (H5) if wanted.
3. Build the production AAB, install on 2 real Android phones (one low-end, one recent), and run this journey: install → signup (web) → login → push permission → create lead → call a lead → log outcome → go offline, add note → back online → logout → login again → force close/reopen. Then I can complete the sections above I couldn't test.

If you give me an emulator-capable machine (or a built APK + a staging backend), I can run that journey and update this report.

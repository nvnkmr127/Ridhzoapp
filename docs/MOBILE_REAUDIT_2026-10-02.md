# Ridhzo Mobile — Full Re-audit (2026-10-02)

**Scope.** Everything from the first audit (`MOBILE_FULL_AUDIT_2026-10-02.md`), re-checked against the code and the live
production site after the fixes landed. Mobile repo `ridhzo-mobile` HEAD `883a1ec` (+ 1 uncommitted change below); backend
`ridhzo` HEAD `c0937e3` (+ 1 uncommitted change below). Both trees were clean when this started and are in sync with `origin`.

**Method.** (1) Re-ran every check: `tsc` (both), 11 unit-test files, offline-sync (6 scenarios), push-loop, backend vitest
(936 tests), `npm audit`, `expo-doctor`, a secret scan of tracked files. (2) Re-read the whole diff since the first audit
(mobile 76 files, backend 65 files) looking for regressions, not just confirming fixes. (3) Probed production read-only.
**Not done:** no device or emulator run, no Kotlin compile (no `kotlinc`/Gradle here).

---

## 1. Production problem found — act first

### P0 · Production login returns HTTP 500 (very likely a missing database migration)
- **Evidence.** `POST /api/v1/auth/login` with a non-existent user now returns **500** (it returned 401 when I probed on the
  first audit). `/api/health` reports the database and Redis up. The live API already serves the new code (`X-API-Version: 1`).
- **Cause.** Backend commit `c0937e3` added `users.push_opt_out` (migration `drizzle/0105_push_opt_out.sql`). `deploy/README.md` and
  `docs/RUNBOOK.md` say migrations are applied by hand *before* shipping and that `deploy.sh` does not migrate. Code that does
  `db.select().from(users)` (login, `loginIdentifier`, `mobileSession`) selects every schema column, so it fails if the column
  doesn't exist. I could only confirm the symptom, not the cause, because I have no read access to the production DB from here.
- **Impact if confirmed.** Web and mobile sign-in broken for everyone; mobile push also fails silently (the new mute check reads the column).
- **Fix (additive, idempotent, safe to re-run):** run `npm run db:migrate` against the production database (or just the SQL in
  `drizzle/0105_push_opt_out.sql`). The `DATABASE_URL` in the local `.env` points at the Railway proxy, so I did **not** run it
  without your go-ahead.
- **Lesson / prevention.** Backend code that needs a new column must not deploy before its migration. Either make migrations part of
  the deploy, or add a startup check that fails the deploy when the schema is behind.

---

## 2. Status of every first-audit finding

Legend: ✅ fixed and re-verified in code · 🟡 fixed in code but not verifiable here · 🔴 open · ➖ accepted / out of scope

| ID | Finding | Status | Note |
|---|---|---|---|
| C1 | Firebase Admin key in git history | 🔴 | Still in `51c66a0` (verified: file present, contains a private key). Needs key revocation + history purge — only you can do this. |
| H1 | Forced sign-out wipes offline work | ✅ | Keeps queue per user; two tests cover it. |
| H2 | App Links / Universal Links | 🔴 | Code fixed (dynamic routes, more paths). **Live still empty**: `sha256_cert_fingerprints: []`, `TEAMID`. Set `ANDROID_CERT_SHA256` / `APPLE_TEAM_ID`, redeploy. |
| H3 | Non-idempotent sends | ✅ | Email, WhatsApp, share, meeting, upload now idempotent; key is per payload (fixed in this re-audit). |
| H4 | Recycle bin scope | ✅ | Non-admins see/restore own leads only. |
| H5 | Play restricted permissions | 🔴 | Decision needed (declaration vs. no-call-log build). In-app account deletion now exists. |
| H6 | Receiver killed before alert | 🟡 | `goAsync()` added. Needs a device test. |
| H7 | Keyboard under edge-to-edge | 🟡 | `behavior="padding"` everywhere. Needs a device test. |
| H8 | iOS readiness | ➖ | Ignored by request. |
| M1 | Sentry source maps | 🟡 | Upload no longer disabled for production; needs `SENTRY_AUTH_TOKEN` as an EAS secret. |
| M2–M4 | Sentry PII, sign-out, native state | ✅ | |
| M5 | Time zones | ✅ | Workspace zone throughout. |
| M6 | Offline check-in etc. | ✅ | Plus owner/stage/value/booking/restore/upload queued. |
| M7–M13 | Request storms, drafts, permissions, errors, URLs, recordings | ✅ | M12: the server already validated links; my first note was wrong. |
| M14 | Caller-ID store unencrypted | 🟡 | Keystore AES-GCM + hashed keys; not compiled/run. |
| M15 | OTA code signing | 🔴 | Needs a certificate only you can create. |
| M16 | Usage limits | ✅ | Verified service-level limits exist; fixed 402 mapping, bulk-import metering, cap race. |
| M17, M19 | Stale permissions, version header | ✅ | Plus server-side 426 for builds below `mobile.minVersion` (inert until set). |
| M18 | Revocation latency | ✅/➖ | Role/active changes now evict the auth cache instantly. Fail-open on a Redis outage is accepted. |
| M20, M21 | Docs, dependencies | 🟡 | Docs partly corrected; `expo-doctor` still shows 7 patch mismatches; 21 advisories (8 high), all transitive build tooling; no lint. |
| L1–L3, L5, L6, L10, L11, L14 | Low items | ✅ | |
| L4, L9, L13 | Phone-key collisions, stale local `android/`, i18n | ➖ | Accepted / product decision. |
| L7, L8 | Tracked plan file, stray backend files | ✅ | `google-services.json` / plist API keys still need restricting in Google Cloud. |
| L12 | Accessibility | 🟡 | Font cap, touch targets, row labels done; no TalkBack or contrast pass. |

Navigation, lifecycle, offline, notification, tenant-isolation, auth and usage-limit sections: every code-side item raised is addressed
(see commits). Items needing hardware are listed in §5.

---

## 3. New findings from this re-audit

| # | Sev | Finding | Status |
|---|---|---|---|
| N1 | **Critical (ops)** | Migration 0105 not applied before deploy → login 500 (§1). | 🔴 needs go-ahead |
| N2 | Medium | **Upload content check too strict for call recordings.** The new magic-byte rule required an `.mp3`/`.m4a`/`.3gp` file's bytes to match its own extension, but phone call recorders commonly save an m4a/AAC stream as `.mp3`. Those uploads would be refused with a 422. | ✅ fixed now (any real audio container accepted for audio extensions; HTML/executables still refused) + test |
| N3 | Medium | **Idempotency key reused after the rep edits the message.** If a send timed out (server did send) and the rep edited the text and resent, the server would replay the first send and the edit would never go out. | ✅ fixed now (key tied to the payload) |
| N4 | Medium | **Old token not revoked if sign-out happened offline and the rep signs in again before the next signed-out launch.** | ✅ fixed now (revoke retried at sign-in; push-unregister deliberately not, so it can't unregister the new user) |
| N5 | Low | I had added a `READ_PHONE_STATE` permission requirement to the call-state receiver. It adds almost no protection (the action is a protected broadcast) and could stop caller ID / missed-call alerts if the system sender lacks it. | ✅ reverted |
| N6 | Low | `DELETE /api/v1/me` (account deletion) needs only the bearer token — no re-confirmation. A stolen unlocked phone could delete the account. | 🔴 suggest an OTP/password step |
| N7 | Low | After a session expires, the caller-ID directory and call-sync flag stay on the phone until the user signs back in (by design, to keep offline work). Lead names can still appear on incoming calls meanwhile. | ➖ accept or clear on expiry |
| N8 | Low | A queued upload that the server refuses (e.g. 422) stays in the failed list and its file stays on disk until sign-out. | 🔴 minor |
| N9 | Low | `getCallRecordings` "looks like a call" test (name has "call" or ≥7 digits) will also match some dated music/voice files. Attach is still user-confirmed. | ➖ |

---

## 4. Re-verified strengths
- No cross-tenant read path: every lead route resolves through `leadForApi`; attachment links now re-check access; the offline cache is stamped with its owner; all workspace databases are deleted at sign-out.
- Bulk, export, deletion, notification-prefs and idempotent routes all return 401 without a token (probed live).
- Tests: 936 backend + 11 app unit files + 6 sync scenarios + push-loop all pass; `tsc` clean in both repos.
- No secrets in tracked files of either repo except the two Firebase *client* API keys (expected; restrict them in Google Cloud).

## 5. Still unverified (needs a real device or build)
Missed-call alert with the app closed (H6) · keyboard on Android 12–15 (H7) · caller-ID encryption and the Kotlin changes (never compiled here) ·
app lock and privacy screen · R8-minified release build keeping the receiver/overlay · background sync timing · TalkBack.

## 6. Production readiness
**Do not ship further until N1 is resolved** (it is a live outage if confirmed). After that, Android internal/closed testing is reasonable.
Public release still needs: C1 (key purge), H2 (fingerprints/Team ID), H5 (Play declaration or a no-call-log build), M1 (Sentry secret),
M15 (OTA signing), a device pass for §5, and the missing tests for the new routes (bulk, export, account deletion, notification prefs).

## 7. Evidence
```
tsc: mobile clean, backend clean
mobile unit: 11 files pass · test:sync 6/6 · test:push ok
backend vitest: 936 passed, 25 skipped (+1 new attachment test)
live: assetlinks fingerprints [] · AASA TEAMID · app-config minVersion null · X-API-Version: 1
live: /api/v1/{leads,leads/bulk,me(DELETE),notification-prefs} unauthenticated → 401
live: POST /api/v1/auth/login (unknown user) → 500   ← was 401
git: firebase-adminsdk key present in 51c66a0
npm audit (prod): 21 advisories (8 high), build tooling · expo-doctor 20/21
```

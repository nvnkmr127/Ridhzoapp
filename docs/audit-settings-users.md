# Audit: `/settings/users`

**Date:** 2026-09-14 · **Scope:** `/settings/users` end-to-end (page, actions, services, DB, RBAC)
**Method:** full code trace + live integration probes against the local Postgres (`localhost:5432/privyr_v2`). DB findings A, C, D, and duplicate-role were reproduced against the real database; nothing was run against prod.

## Executive summary

| | |
|---|---|
| Scenario areas exercised | 14 |
| Areas passing cleanly | 6 (list load, tenant scoping, backend authz on every action, self-guards on role/delete/deactivate, seat accounting, no cross-tenant leak in list/API) |
| Areas with confirmed defects | 8 |
| Confirmed bugs | 9 |
| Security findings | 3 (S1 privilege escalation, S2 cross-tenant email/info leak, S3 DB-internals leaked to unauthenticated invitee) |
| Data-integrity issues | 2 (B3 soft-deleted rows remain mutable/resurrectable, B7 duplicate roles) |

**Headline:** the page's authorization model is solid — every server action independently re-checks `users.manage`/`roles.manage` server-side, and tenant scope always comes from the session, never the client. The real problems are (1) a **broken re-invite workflow** caused by two divergent user-creation paths against a global-unique email, (2) **no "last admin" protection** (reachable via concurrency or super-admin impersonation), and (3) an **RBAC bypass** where any custom role named "admin" silently gets every permission.

---

## Confirmed bugs

### BUG-A (P1) — Re-inviting a previously-deleted email is accepted but can never be completed
- **Scenario:** delete a user, later invite the same email back.
- **Preconditions:** a user was soft-deleted (`deletedAt` set). Email column is `UNIQUE(email)` globally and unconditional (verified: constraint `users_email_unique`).
- **Repro (reproduced live):**
  1. Create user `bob@x.com`.
  2. Delete bob (soft delete — row stays, holds the unique email).
  3. Invite `bob@x.com` again → **succeeds** (`InvitationService.create` only checks `isNull(deletedAt)` users, so it doesn't see the tombstone).
  4. Bob opens the link, sets a password → `InvitationService.accept` does a plain `INSERT` → **unique-constraint violation**. Bob sees a raw error and can never join.
- **Expected:** re-inviting a deleted user restores/reactivates them (exactly what the *direct* "Add member" path does).
- **Actual:** invite path inserts and fails; direct-add path restores. Two creation paths, only one handles the tombstone. Probe output:
  ```
  3. re-invite ALLOWED (invite created)
  4. accept FAILED: Failed query: insert into "users" ... <-- BUG CONFIRMED
  5. direct re-create -> id=SAME (restored)  (works)
  ```
- **Root cause:** `InvitationService.accept` (`src/domains/invitations/service.ts:51`) does `db.insert(users)` unconditionally; it does not mirror the restore-if-soft-deleted logic in `UserService.create` (`src/domains/users/service.ts:42`).
- **Affected files:** `src/domains/invitations/service.ts`, `src/domains/users/service.ts`.
- **Recommended fix (root cause):** route both accept and create through one "materialize user" helper, or in `accept` look up the existing row by email first and, when it's a soft-deleted row in `inv.organizationId`, `UPDATE ... SET deletedAt=null, isActive=true, passwordHash=…, roleId=inv.roleId` instead of inserting; if it's an active row, throw the friendly "already a member" error.
- **Regression test:** integration test — create→delete→invite→accept returns a live user and reuses the same row.

### BUG-B (P1) — No "last administrator" protection (org can be locked out of user management)
- **Scenario:** deactivate/delete/demote the final admin.
- **Preconditions:** the only guards are `id === userId` self-checks in `setUserActiveAction`/`deleteUserAction`/`setUserRoleAction` (`src/lib/actions/users.ts:77,101,114`). There is no notion of "last admin".
- **Reachable paths:**
  1. **Concurrency:** admins A and B both online. A deactivates B *and* B deactivates A in overlapping requests — each passes its own self-check → **zero active admins**. (Task scenario 10 / 6.)
  2. **Super-admin impersonation:** an impersonating super-admin's `userId` ≠ the tenant's admin id, so the self-guard doesn't apply — they can deactivate/delete the tenant's sole admin, leaving the org with no one who can manage users or roles.
  3. **Custom-role deletion:** deleting a custom role named "Admin" (see BUG-D) unassigns it from its members, stripping their admin power.
- **Expected:** block the action when it would remove the last active admin (system role `admin` or, once BUG-D is fixed, a role holding `users.manage`/`roles.manage`).
- **Actual:** no such check anywhere.
- **Affected files:** `src/lib/actions/users.ts`, `src/domains/roles/service.ts`.
- **Recommended fix:** before deactivate/delete/role-change/role-delete, count remaining active admins in the org; refuse if it would hit zero. Do the count and the mutation in one transaction to close the race.
- **Regression test:** last-admin deactivate/delete/demote is rejected with `fail("VALIDATION", …)`.

### BUG-C (P2) — Soft-deleted users are still mutable and can be resurrected inconsistently
- **Scenario:** admin edits a user that another admin just deleted (task scenario 10); or any activate/role/team action on a stale row.
- **Preconditions:** `setActive`/`setRole`/`setTeam`/`remove` in `src/domains/users/service.ts` filter only `id + organizationId` — **not** `deletedAt`.
- **Repro (reproduced live):** soft-delete a user, then `setActive(…, true)` → returns the row and leaves `deletedAt` **still set** with `isActive = true`:
  ```
  6. after soft-delete + setActive(true): deletedAt=STILL SET isActive=true (inconsistent)
  ```
  The list query hides it (`isNull(deletedAt)`), so the UI and DB disagree; the row is a zombie (active + deleted).
- **Expected:** mutations on a deleted user are no-ops that surface "user no longer exists".
- **Actual:** they silently succeed; there is no optimistic locking, so concurrent edit-vs-delete is last-write-wins.
- **Root cause:** mutation `where` clauses omit `isNull(users.deletedAt)`.
- **Affected files:** `src/domains/users/service.ts:77-110`.
- **Recommended fix:** add `isNull(users.deletedAt)` to the `where` of `setActive`/`setRole`/`setTeam`/`remove`; return the row and have the action report `NOT_FOUND` when nothing was updated.
- **Regression test:** each mutation returns undefined / errors on a soft-deleted id.

### BUG-D (P1, security — see S1) — Any custom role named "admin" silently gets *all* permissions
- **Scenario:** create a custom role, name it "Admin".
- **Preconditions:** `hasPermission` (`src/lib/rbac/index.ts`) grants everything when `role.name.toLowerCase() === "admin"`, before ever consulting the `permissions` array. `RoleService.create` accepts an arbitrary name and stores whatever `permissions` the caller cleaned.
- **Evidence:** the live DB already has **three** org-owned roles literally named "Admin" in one org (`00000000-…-0002`).
- **Expected:** only the shared *system* admin role (org `NULL`) is all-powerful; a tenant's custom role's power comes from its `permissions` array.
- **Actual:** the string "admin" is a magic backdoor. A holder of `roles.manage` (a role explicitly *below* full admin) can mint an all-permissions role by naming it "admin" and assign it to any user → privilege escalation. It also makes the permissions checkboxes meaningless for such a role.
- **Affected files:** `src/lib/rbac/index.ts`, `src/domains/roles/service.ts`.
- **Recommended fix:** gate the name-based shortcut on system roles only (e.g. `role.name.toLowerCase()==="admin" && role.organizationId === null`), or drop name-based grants entirely and rely on `permissions.includes("*")`. Also reject/normalize reserved role names (`admin`, `member`) in `RoleService.create`.
- **Regression test:** a custom role `{name:"admin", permissions:[]}` grants no permission beyond its array.

### BUG-E (P2) — No search, filtering, or pagination on the user list
- **Scenario:** task scenarios 1 & 2 ("many users", search by name/email).
- **Actual:** `UsersManager` renders every user in one flat `users.map` (`src/components/users/UsersManager.tsx:319`). `UserService.list` has no limit. No search box exists. An org with hundreds of seats gets an unbounded page and no way to find anyone.
- **Recommended fix:** add a client-side filter input (name/email, trimmed, case-insensitive) as the minimum; server-side pagination/search if seat counts get large.
- **Severity:** P2 (scales into a real usability failure; not data-affecting).

### BUG-F (P3) — Lost invite link when email delivery fails
- **Scenario:** SMTP down; task scenario 11.
- **Actual:** when `emailed=false`, the join link is shown only in a transient toast (`UsersManager.tsx:75`). The toast disappears; the token is hashed server-side and unrecoverable. The admin must revoke and re-invite to try again.
- **Recommended fix:** render the join link persistently on the pending-invite row (copy button) when `emailed` was false, or always expose a "copy link" affordance.

### BUG-G (P3) — Team creation has no in-flight guard (double-submit → duplicate teams)
- **Scenario:** double-click "Add team" / task "double-clicking submit".
- **Actual:** `createTeam` (`UsersManager.tsx:84`) never disables the button while the request is in flight (unlike `create`/`invite`, which use `saving`/`inviting`). Two rapid clicks create two identical teams; `TeamService.create` has no name-uniqueness guard.
- **Recommended fix:** add a `creatingTeam` flag mirroring the create/invite handlers.

### BUG-H (P3) — Deleting a role silently strips access from its members with no warning
- **Scenario:** task scenario 7; delete a role in use.
- **Actual:** `RoleService.remove` (`src/domains/roles/service.ts:44`) sets `roleId = null` on all members, then deletes. A user with no role fails every `hasPermission` check. There is no "this role is assigned to N users" warning or reassignment step in `RolesManager`.
- **Recommended fix:** warn with the assigned-member count before deletion; optionally require reassignment.

### BUG-I (P3) — No empty state for the user list
- `UsersManager.tsx:318` renders an empty bordered box when `users` is empty (unlikely in practice, since the acting admin is always present, but the invites/teams sections have empty copy while the members list does not). Low priority.

---

## Security findings

### S1 (High) — Privilege escalation via role name "admin"
Same as **BUG-D**. A `roles.manage` user (below full admin) can create a role named "Admin", which `hasPermission` treats as holding every permission, and assign it to accounts they control. The `permissions` array — the intended authorization boundary — is bypassed entirely. Evidence: three org-owned "Admin" roles already exist in the DB. **Fix:** restrict the name shortcut to system roles (`organizationId === null`) and reserve the name in `RoleService.create`.

### S2 (Medium) — Cross-tenant email uniqueness leaks existence + blocks legitimate signups
`UNIQUE(email)` is global (verified). Consequences:
- A person who is a user in org A can **never** be created or invited into org B — `UserService.create`/`InvitationService.create` throw `"A user with that email already exists"`, and `actionFail` returns that message verbatim (`src/lib/actions/result.ts`). This tells an admin in org B that the email exists *somewhere on the platform* — a cross-tenant existence oracle.
- It's also a functional limitation: the same human can't belong to two workspaces.
**Fix (if multi-org membership is desired):** make email uniqueness per-org (`UNIQUE(organization_id, email)`) and adjust the lookups; otherwise, at minimum return a generic message that doesn't confirm cross-tenant existence.

### S3 (Medium) — Raw DB constraint text reaches the unauthenticated invitee
In BUG-A, `acceptInvitationAction`'s error regex (`/expired|invalid|not found|used|already/i`) doesn't match a Postgres unique violation ("duplicate key value violates unique constraint \"users_email_unique\""), so it falls through to `actionFail`, which — because the message contains "duplicate" — returns the **raw** message to the client (`src/lib/actions/result.ts`, CONFLICT branch). An unauthenticated user on the public accept page sees the table/constraint name. **Fix:** fixing BUG-A removes the failure; additionally, never pass raw DB text through the CONFLICT branch for the public accept action.

> Not vulnerabilities (verified as safe): server-side authz is enforced on every action via `requirePermission("users.manage")` / `requirePermission("roles.manage")` — hiding buttons is *not* the only control. Tenant scope is always taken from the session (`requireOrg`), never from client input, so IDOR on `id` is contained to the caller's org (`UserService.setRole(organizationId, id, …)` filters on both). The `/api/v1/users` route is read-only and scoped by API key. `UserService` never selects `passwordHash`.

---

## Coverage (real-world scenarios)

| # | Area | Result |
|---|------|--------|
| 1 | User list load / counts / stale data | PASS load; **FAIL** no pagination (BUG-E); stale-tab edits hit soft-deleted rows (BUG-C) |
| 2 | Search (all variants) | **N/A — feature absent** (BUG-E) |
| 3 | Create user (dup/case/invalid/long/double-click) | PASS (dup handled, zod validation, `saving` guard); restore-on-recreate works |
| 4 | Edit user (role/team/active, concurrent, stale) | **FAIL** — no optimistic locking, mutates soft-deleted rows (BUG-C) |
| 5 | Delete user (self/last-admin/related records) | PASS self-guard & soft-delete FK safety; **FAIL** last admin (BUG-B) |
| 6 | Activate/deactivate (self/last-admin) | PASS self-guard; **FAIL** last admin + zombie reactivation (BUG-B, BUG-C) |
| 7 | Roles & permissions | **FAIL** — name "admin" escalation (BUG-D/S1); duplicate roles; delete strips access (BUG-H) |
| 8 | Direct URL access / authz | PASS — page + every action gate server-side |
| 9 | Multi-tenant isolation / IDOR | PASS scoping; **FAIL** cross-tenant email oracle (S2) |
| 10 | Concurrent usage | **FAIL** — last-admin race (BUG-B), no optimistic locking (BUG-C) |
| 11 | Network failures | PASS — actions return typed `ActionResult`, UI rolls back optimistic state; **except** raw DB text on accept (S3) |
| 12 | Browser behavior (refresh/tabs/keyboard) | PARTIAL — Enter submits, Escape closes dialogs; multi-tab shows stale data (no refetch) |
| 13 | Data integrity | **FAIL** — zombie rows (BUG-C), duplicate roles, global-email tombstones (BUG-A) |
| 14 | Security | See S1–S3 |

---

## Fix priority

1. **BUG-D / S1** — RBAC bypass (privilege escalation). Small, contained fix in `rbac` + `RoleService`.
2. **BUG-A / S3** — broken re-invite + DB leak. Root-cause fix unifies the two user-creation paths.
3. **BUG-B** — last-admin lockout. Transactional admin-count guard.
4. **BUG-C** — soft-delete scoping on mutations (one `isNull(deletedAt)` per method).
5. **S2** — cross-tenant email (schema decision; larger).
6. **BUG-E** — search/pagination.
7. **BUG-F / G / H / I** — UX polish.

---

## Resolution — fixes applied (2026-09-14)

All confirmed bugs fixed except S2 (deliberately deferred, see below). Verified against the live local DB and with a new integration test suite (`src/domains/users/service.integration.test.ts`, 5 tests). Full suite: **314 passed**, `tsc --noEmit` clean.

| ID | Fix | Files |
|----|-----|-------|
| BUG-D / S1 | `hasPermission` grants the "admin" name shortcut only to the **system** role (`organizationId === null`); tenant roles now derive power from their `permissions` array. `RoleService` rejects reserved names ("admin"/"member"). RolesManager display no longer force-checks a tenant "admin". | `src/lib/rbac/index.ts`, `src/domains/roles/service.ts`, `src/components/users/RolesManager.tsx` |
| **Migration** | **`drizzle/0042_admin_role_permissions_backfill.sql`** — backfills existing tenant roles named "admin" to `["*"]` so their members keep full access after the D fix. *Discovered during testing: the Acme seed admins had a custom "Admin" role with **empty** permissions and relied entirely on the name shortcut — without this backfill the D fix would have locked them out.* | `drizzle/0042_*.sql` (+ meta) |
| BUG-A / S3 | `InvitationService.accept` now restores a soft-deleted same-org user instead of a blind INSERT (mirrors `UserService.create`); the accept action returns a clean "sign in instead" message on a live collision, so no raw DB text leaks. | `src/domains/invitations/service.ts`, `src/lib/actions/invitations.ts` |
| BUG-B | Race-safe last-admin guard: `setActive(false)`/`setRole`/`remove` run in a transaction that compares admin count before vs. after and rolls back if the write took the org from ≥1 admin to 0. Correctly ignores non-admins and already-adminless orgs. | `src/domains/users/service.ts`, `src/lib/actions/result.ts` |
| BUG-C | All user mutations now scope on `isNull(deletedAt)`; actions report `NOT_FOUND` when no live row matched. No more zombie (active+deleted) rows. | `src/domains/users/service.ts`, `src/lib/actions/users.ts` |
| BUG-E | Client-side member search (name/email, trimmed, case-insensitive) + empty state. | `src/components/users/UsersManager.tsx` |
| BUG-F | Join link persists on the pending-invite row (with a Copy button) when email delivery failed. | `src/components/users/UsersManager.tsx` |
| BUG-G | `createTeam` guards double-submit with a `creatingTeam` flag. | `src/components/users/UsersManager.tsx` |
| BUG-H | Already had a confirm-with-warning in `RolesManager.remove` — no change needed (over-reported). | — |
| BUG-I | Members list now shows an empty state. | `src/components/users/UsersManager.tsx` |

### S2 — deliberately NOT changed (needs a product decision)
Making email per-org unique is **not** a safe bug fix: login (`src/lib/auth.ts:52`) resolves users by a **global** email lookup. Per-org email would make login ambiguous and require an org-selection step — an auth redesign with real security risk. Only the safe, contained part was addressed (the accept-time message no longer leaks). The full multi-org-membership change is left as an explicit product decision.

### Deployment note
`0042_admin_role_permissions_backfill.sql` has been applied to the **local** DB only. It must be run on **production** (`npm run db:migrate`) as part of deploying the BUG-D fix, or existing tenant admins whose role has empty permissions will lose access.

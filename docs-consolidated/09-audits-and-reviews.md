# Audits & Reviews

Web app audit and the pre-marketing audit (point-in-time findings).

> Consolidated from 3 source file(s). Content is verbatim; headings are nested two levels deeper under each section. Edit the original files if they still exist, then regenerate.

## Contents

1. [Ridhzo Web App — Data Loading, Performance & Sync Audit (2026-09-28)](#1-ridhzo-web-app--data-loading-performance--sync-audit-2026-09-28) — `docs/WEB_APP_AUDIT_2026-09-28.md`
2. [Ridhzo — Pre-Marketing Product Audit (2026-10-01)](#2-ridhzo--pre-marketing-product-audit-2026-10-01) — `docs/PRE_MARKETING_AUDIT_2026-10-01.md`
3. [Ridhzo — Full Production-Readiness Audit (2026-10-02)](#3-ridhzo--full-production-readiness-audit-2026-10-02) — `docs/PRODUCTION_AUDIT_2026-10-02.md`

---

## 1. Ridhzo Web App — Data Loading, Performance & Sync Audit (2026-09-28)

> Source: `docs/WEB_APP_AUDIT_2026-09-28.md`

### Ridhzo Web App — Data Loading, Performance & Sync Audit (2026-09-28)

> **Superseded in part by [PRODUCTION_AUDIT_2026-10-02.md](PRODUCTION_AUDIT_2026-10-02.md)** — see its remediation status for what has since been fixed.

**Scope:** the Next.js web app in this repo (`src/app/(dashboard)`, `src/components`, `src/lib/actions`, `src/domains`, `src/app/api/v1`), checked against the problem classes in [MOBILE_APP_AUDIT_2026-09-27.md](MOBILE_APP_AUDIT_2026-09-27.md).

**Method:**
1. Traced each major workflow from UI → server component / server action / route handler → service → SQL.
2. Ran `tsc --noEmit`: clean.
3. Ran `vitest`: 167 files and 746 tests pass; 2 files and 11 tests are skipped.
4. Built a **throwaway local database** in the session scratchpad. It was never your Railway database. It has all 81 migrations and this synthetic data:
   - 8 workspaces and ~306k leads
   - one workspace with 100k leads and 20 users
   - 500k activities, 100k follow-ups and 50k notifications
5. Ran `EXPLAIN ANALYZE` on the hot queries.
6. Ran the dev server against that database and timed real pages with an admin session and a member session.
7. Counted the SQL statements behind each page from the Postgres statement log.

**Not done:**
- No production measurement: `.env` points at Railway, and I didn't touch it.
- No production build: the timings come from `next dev`, which renders slower than production. The ranking between pages still holds.
- No real phone was used for the sync checks.
- No throttled-network or disconnect run in a browser.
- No visual pass across breakpoints.
- Automations, sequences, assistant and most settings sub-pages were only skimmed.
- The web app has no separate Contacts or Customers entities. Everything is a lead, so those sections of the brief map onto Leads.

**Severity counts:** 1 Critical · 9 High · 15 Medium · 13 Low.

---

#### Fix status (2026-09-28, same day)

All items were addressed except L8 (partly: dead code removed, Facebook webhook `console.log` lines kept on purpose — they carry only page/form/leadgen ids and are the only ops trace for ingestion) and L12 (N+1 in `notifyOrgAdmins`, left as is at current sizes). H5 was fixed by collapsing the waves into one and caching the report per workspace for 5 min (with a Refresh link) — the individual reports still run in JS over one tenant snapshot; moving them to SQL is the follow-up if a workspace outgrows that.

Re-measured on the same scratch database (dev server):

| Page | Before | After |
|---|---|---|
| `/leads/hot`, 100k-lead workspace | >12 min, CPU pinned, never finished | 0.35 s (50 per page) |
| `/leads/hot`, 4k hot leads | 37.8 s · 46 MB | 0.1–0.4 s |
| `/leads?pageSize=5000` | 3.3 s · 31 MB | clamped to 20 |
| Phone-digit search query | 29 ms filtered scan | 2.4 ms (`leads_phone_digits_trgm_idx`) |
| `/insights` repeat view | 1.36 s, 42 statements | 0.35 s, 12 statements (fresh: 1.37 s) |
| `/follow-ups` | 1.5 s · 3.4 MB, silently capped at 500 | 0.27–0.85 s, per-section "Show more" |
| Smart Segments on `/leads` | every tenant lead loaded into Node | one aggregate; chip counts = list totals (verified) |

Verified end to end: member opens a lead via an assigned follow-up; a colleague's unrelated lead shows "You don't have access"; notification panel marks exactly the shown rows read (200→180→140 unread) and pages older ones; new leads appear on the open list without reload; lead timeline pages through 255 activities; offline replay with one idempotency key creates one lead (1 run, 3 calls, real DB); phone sync holds rows behind an open writing transaction (new integration test fails without the fix). `tsc`, eslint (changed files) and 756 unit tests pass.

---

#### Measurements (local DB, ~0 ms network; production adds one DB round-trip per sequential query wave)

| Page | Total time | HTML size | SQL statements (incl. layout) | Main bottleneck |
|---|---|---|---|---|
| `/` Executive dashboard | 0.41 s | 337 KB | 29 | SLA card pulls every lead into Node (H6) |
| `/leads` | 0.39 s | 273 KB | 22 | Smart Segments pull every lead (H1); `count(*)` + `SELECT *` |
| `/leads/[id]` | 0.17 s | 227 KB | 31 | Unbounded timelines; 3 sequential awaits after the fan-out (M7) |
| `/follow-ups` | 1.48 s | **3.4 MB** | 15 | 500 rows rendered at once (M8) |
| `/my-dashboard` | 0.91 s | 204 KB | 18 | Sequential metric queries (L2) |
| `/insights` | 1.36 s | 1.7 MB | 42 | Whole tenant loaded + ~20 JS aggregations in 5 waves (H5) |
| `/leads/kanban` | 0.48 s | 306 KB | — | OK (paginated per column) |
| `/meetings` | 0.34 s | 139 KB | — | OK |
| `/settings` | 0.18 s | 208 KB | — | OK |
| `/leads/duplicates` | 0.30 s | 810 KB | — | Full-tenant scan (H8) |
| `/leads?pageSize=5000` | 3.27 s | **31 MB** | — | Page size not clamped (H4) |
| `/leads/hot`, 1k hot leads | 5.0 s | **14 MB** | — | Unbounded render (C1) |
| `/leads/hot`, 4k hot leads | 37.8 s | **46 MB** | — | Unbounded render (C1) |
| `/leads/hot`, 100k-lead workspace (~19.8k hot) | **>12 min, never completed; Node at 99% CPU** | — | — | Unbounded render (C1) |

**Query timings at 100k leads:**

| Query | Time | Notes |
|---|---|---|
| Default list page | 0.2 ms | Index `leads_org_created_idx` |
| `count(*)` | 20 ms | |
| Offset 39,980 | 10 ms | |
| Sort by name | 27 ms | Parallel seq scan, no index |
| Phone-digit search | 29 ms | Trigram index unused (M4) |
| Notifications, unread count and list | < 0.1 ms | Index-backed |

**Conclusion:** at this size, raw SQL time isn't the bottleneck. Three things are:
- **rows shipped into Node and rendered** (C1, H1, H4–H6, M8),
- **sequential query waves**, each paying the remote-DB round-trip (M3, M7),
- **full-page re-renders** triggered by polling (M1, M2).

---

#### Critical

##### C1 · Hot Leads page renders every open lead and pins the server CPU
- **Screen:** `/leads/hot` (also linked from the "Hot & Highly Engaged" segment chip on `/leads`)
- **Files:**
  - `src/app/(dashboard)/leads/hot/page.tsx:44-66, 126`
  - `src/domains/leads/leadConversionPredictorService.ts:38-62`
- **Query:** `SELECT … FROM leads WHERE organization_id=$1 AND deleted_at IS NULL AND status IN (open keys)`. No limit.
- **Current:**
  - Every open lead is loaded, scored in JS, filtered to probability ≥ 35, and rendered as one table row each.
  - Each row costs ~12 KB, because it is sent twice (HTML plus React Server Components data) with long class strings and inline SVG icons.
  - Measured times:
    - 1k rows: 5.0 s and 14 MB.
    - 4k rows: 37.8 s and 46 MB.
    - 100k-lead workspace: still rendering after 12 minutes with Node at 99% CPU. That blocks **every other user's request** on the instance.
- **Expected:** the top N (e.g. 50) with a pager. Probability computed in SQL. Summary numbers from one aggregate query.
- **Root cause:** a report-style service (whole dataset, JS scoring) was wired straight into a page with no limit.
- **Fix:**
  - Express the five scoring terms as a SQL expression.
  - `ORDER BY probability DESC, id LIMIT 50 OFFSET …`.
  - `count(*) FILTER` and `avg()` for the three cards.
- **Impact:** outage risk for any workspace with more than a few thousand open leads.

---

#### High

##### H1 · Smart Segments load the whole workspace on every `/leads` visit, and their counts are wrong for reps
- **Files:**
  - `src/domains/leads/smartSegmentationService.ts:23-37`
  - `src/components/leads/SmartSegments.tsx`
- **Query:** `SELECT id,status,score,priority,expected_value,owner_id,last_contacted_at,created_at FROM leads WHERE organization_id=$1`. It has **no `deleted_at` filter** and **no owner filter**.
- **Current:**
  - Every visit to the leads list pulls every lead of the tenant into Node to compute four counts. That includes recycle-bin leads.
  - Reps see tenant-wide counts for leads they can't open.
  - "Hot" means score ≥ 70 and contacted within 3 days here, but probability ≥ 35 on `/leads/hot`. The numbers never match.
  - "High value at risk" links to plain `/leads`.
  - The threshold is labelled "$10,000" (USD) in INR workspaces.
- **Fix:**
  - One `SELECT count(*) FILTER (WHERE …)` with `deleted_at IS NULL` and the owner scope.
  - Make each chip link to a filter that produces the same count.
  - Format the threshold with the workspace currency.
- **Impact:** a linear cost on the most-visited page. It also discloses tenant-wide numbers to reps.

##### H2 · List → detail break: follow-up assignees can list a lead but can't open it
- **Screens:** `/follow-ups` ("Mine"), follow-up notifications, then `/leads/[id]`.
- **Files:**
  - `src/app/(dashboard)/follow-ups/page.tsx:40-45`: lists `followUps.userId = me OR leads.ownerId = me`.
  - `src/app/(dashboard)/leads/[id]/page.tsx:288-292`: allows only owner, admin, or meeting attendee.
  - `src/lib/actions/follow-ups.ts:23-32`: actions *do* allow the assignee.
  - `src/lib/leads/access.ts`.
- **Verified end to end:**
  1. Signed in as a member.
  2. `/follow-ups` shows the follow-up and links to `/leads/65deb204…`.
  3. Opening that link renders **"Resource Not Found — does not exist or has been deleted"**, served with **HTTP 200**.
- **Root cause:** three different access rules for one lead: the list, the detail page, and the actions.
- **Fix:**
  - Add one `leadVisibility(userId)` SQL predicate in `lib/leads/access.ts`: owner, admin, meeting attendee, or pending follow-up assignee.
  - Use it in the detail page, all lists, search, bulk filters and the notification link.
  - Return a distinct "You don't have access to this lead" state with HTTP 404 for missing or forbidden leads.
- **Impact:** broken core workflow for reps. The error message also misleads them.

##### H3 · The leads list never refreshes on its own (placeholder component)
- **File:** `src/components/leads/LeadsAutoRefresh.tsx`. It returns `null`, with the comment "will be implemented in a subsequent phase".
- **Current:**
  - Leads from Facebook, webhooks, the phone app or teammates don't appear until a manual reload.
  - The one exception: the bell's unread count rises, which triggers a full-page refresh.
- **Expected:** new or changed leads appear within ~30 s without a full re-render.
- **Fix:**
  - Add a server action returning a cheap change token: `max(sync_at)` and a count for the org, owner-scoped for reps. The `leads_org_sync_idx` index already exists.
  - Poll it while the tab is visible and call `router.refresh()` only when it changes. `LiveNextBestAction` already does this for a single lead.
- **Impact:** stale data on the main screen, and a web ↔ mobile sync gap.

##### H4 · `pageSize` is not clamped
- **Files:**
  - `src/app/(dashboard)/leads/page.tsx:40`
  - `src/domains/leads/service.ts:442`: `Math.max(options.limit || 50, 1)`. No upper bound.
- **Measured:** `?pageSize=5000` took 3.3 s and returned 31 MB. `?pageSize=100000` would load the whole tenant.
- **Fix:** allow only 20, 50 or 100. Clamp in `listLeads`, because the kanban board and `listStageLeadsAction` also call it.

##### H5 · Insights loads the entire tenant into Node and aggregates in JS
- **Files:**
  - `src/app/(dashboard)/insights/page.tsx:48-90`
  - `src/domains/leads/analyticsCoordinator.ts`
- **Current:**
  - All non-deleted leads, including the `customData` JSON, are loaded, then run through about 20 JS services.
  - The work happens in 5 sequential waves: format, preload, 8 services, 8 services, then 3 more, then the scorecard.
  - There's no `Suspense`, so the page is blank until everything finishes.
  - Measured 42 statements, 1.36 s and 1.7 MB with zero network latency.
- **Fix:**
  - Move each card's numbers into SQL (`GROUP BY`, `FILTER`, `percentile_cont`).
  - Stream each section in its own `<Suspense>`.
  - Cache per org for a few minutes with `unstable_cache` and a tag invalidated by lead writes.
- **Impact:** memory and CPU grow with the tenant, and time-to-first-content is poor.

##### H6 · Executive dashboard SLA card loads every lead and ignores the dashboard filters
- **File:** `src/domains/leads/slaAnalyticsService.ts:31-41`, called from `src/app/(dashboard)/page.tsx:62`.
- **Current:**
  - A full-tenant `SELECT` feeds a JS loop.
  - The card ignores `range`, `ownerId` and `teamId`, so it disagrees with the charts next to it.
- **Fix:** one aggregate query built from `AnalyticsService.buildLeadConditions(filters)`. `getLeadMetrics` already has the right SQL shape.

##### H7 · Web offline queue can duplicate leads or silently drop them
- **Files:**
  - `src/components/leads/QuickAddLeadDrawer.tsx:153-221`
  - `src/lib/offline/outbox.ts:108-160`
  - `src/hooks/use-offline-sync.ts`
  - `src/components/layout/Header.tsx:169`
- **Current:**
  - **Any thrown error** from `createLeadAction` is queued as "offline": a 500, a redeploy's "Failed to find Server Action", or a timeout. The request may already have succeeded.
  - Replays carry **no idempotency key**, so a lead can be created twice. Name-only leads aren't caught by the dedupe.
  - After 5 failures the item is deleted, but the toast says "will be retried".
  - Every open tab flushes on the `online` event, so the same lead can be submitted several times.
  - The outbox isn't cleared on sign-out. The next user of that workspace in the same browser uploads it under their own session.
- **Same class as mobile:** H4, M4 and C3.
- **Fix:**
  - Queue only when `!navigator.onLine` or on a `TypeError` (network failure).
  - Give each item a UUID and pass it as an idempotency key. `api_idempotency_keys` already exists for `/api/v1`.
  - Keep failed items visible with a "Retry / Discard" choice.
  - Use `navigator.locks` so only one tab flushes.
  - Clear the outbox in the logout handler.

##### H8 · Duplicates page scans the whole tenant, includes recycle-bin leads, and bypasses owner isolation
- **Files:**
  - `src/domains/leads/dedupService.ts:24-28`: `WHERE organization_id=$1` only.
  - `src/app/(dashboard)/leads/duplicates/page.tsx:11-47`
  - `src/lib/actions/dedup.ts:13`
- **Current:**
  - Soft-deleted leads show up as duplicates and can be merged.
  - A custom role with `leads.merge` but without `settings.manage` sees every lead's name, email and phone in the workspace.
- **Fix:**
  - SQL `GROUP BY lower(email)` / `GROUP BY` digits-only phone, `HAVING count(*) > 1`, with `deleted_at IS NULL`.
  - Require admin, or scope the page to the caller's leads.

##### H9 · Phone sync feed can permanently miss a change
- **Files:**
  - `drizzle/0080_lead_sync_stamp.sql`
  - `src/app/api/v1/leads/route.ts:98-122`
- **Current:**
  - `sync_at` is set to `clock_timestamp()` when a row is written, but the row only becomes visible when its transaction commits.
  - Suppose transaction A stamps a row at T1 and commits at T3, and a phone syncs at T2 and receives a row stamped after T1. The phone's cursor moves past T1, so A's row is never sent.
  - Merges, imports and bulk updates run inside transactions, so this happens in practice.
- **Fix, simplest first:**
  - Replay a safety window: query from `cursor − 30 s` and let the client ignore rows it already has.
  - Or stamp with a commit-ordered value (`pg_current_xact_id()` plus a snapshot-xmin horizon).

---

#### Medium

##### M1 · Notification panel: mark-all-read, whole-page re-render, misleading empty state
- **Files:**
  - `src/components/layout/NotificationBell.tsx:58-67, 86`
  - `src/lib/actions/notifications.ts:17-21`
- **Current:**
  - Opening the panel marks **every** unread notification read, not just the 50 shown. One arriving between the list fetch and the mark is marked read unseen.
  - `revalidatePath("/")` inside the action makes Next re-render the **current page and layout** on every open.
  - The panel shows "You're all caught up" while loading and after an error.
  - There's no "load more", even though the service supports cursors, and no per-item read state.
- **Fix:**
  - Mark by the ids shown.
  - Drop `revalidatePath`.
  - Add loading and error rows.
  - Add a cursor-based "Load older" (`listForUser` already takes `cursor`).

##### M2 · Bell polling causes full-page refreshes and runs once per tab
- **File:** `NotificationBell.tsx:28-56`
- **Current:**
  - Any rise in unread count calls `router.refresh()`, which re-runs the layout (~12 statements) and the whole page.
  - Admins get a `new_lead` notification per lead, so a busy workspace re-renders every 30 s.
  - Every tab runs its own poller.
- **Fix:**
  - Once H3 exists, refresh only when the relevant change token moves.
  - Share one poller across tabs via `BroadcastChannel` or a leader tab.

##### M3 · Dashboard layout runs ~8 sequential awaits on every render
- **File:** `src/app/(dashboard)/layout.tsx:31-72`
- **Current:**
  - The chain: `isSuperAdmin` → `requireOrg` → maintenance → billing → usage → permissions → org format → `me`.
  - About 12 statements, mostly independent.
  - It re-runs on every `router.refresh()` (60 call sites) and every `revalidatePath` that hits the current page.
  - Against the remote DB (~300 ms round-trip per the code comments), the sequence alone costs seconds.
- **Fix:** one `Promise.all` after `requireOrg`.

##### M4 · Search: phone-digit search can't use its index, and the two search boxes disagree
- **Files:**
  - `src/domains/leads/service.ts:454-472`: `regexp_replace(phone…) ILIKE` defeats `leads_phone_trgm_idx`. It measured a 29 ms filtered scan at 100k rows and grows linearly.
  - `src/lib/actions/search.ts:43-52`: the command palette uses raw `ILIKE` on phone. "98765 43210" finds the lead on `/leads` but not in ⌘K.
  - Two-character queries are allowed, but trigram indexes need three characters.
- **Fix:**
  - Add a generated `phone_digits` column with a trigram index.
  - Share one search-condition builder between `listLeads`, ⌘K and `/api/v1/leads`.
  - Require at least 3 characters.

##### M5 · Unstable pagination, and the default sort never applies
- **Files:**
  - `src/domains/leads/service.ts:512-532`
  - `src/app/(dashboard)/leads/page.tsx:35`
- **Current:**
  - Sorting by name, status, owner, priority, score or next follow-up has no `id` tiebreaker. With offset paging, rows repeat or vanish between pages.
  - The page always passes `sortField="createdAt"`, so the documented "unworked `new` first" default never runs.
- **Fix:**
  - Append `id` to every `ORDER BY`.
  - Pass `undefined` when there's no `?sort`.

##### M6 · Leads list fetches more than the table needs
- **File:** `src/domains/leads/service.ts:539-540`
- **Current:**
  - `SELECT *` returns the full `custom_data` blob, including `_aiRecap` and `_scoreFactors`, for rows that show a few columns.
  - The page also runs a separate `count(*)` over the filtered tenant on every navigation.
- **Fix:**
  - Select only the table columns plus the visible custom keys.
  - For large tenants, use an estimated count or "more than N" beyond the first pages.

##### M7 · Lead detail: unbounded timelines and a sequential tail
- **File:** `src/app/(dashboard)/leads/[id]/page.tsx`
- **Current:**
  - 31 statements.
  - Unbounded lists:
    - `ActivityService.getLeadActivities`, whose limit defaults to `Number.MAX_SAFE_INTEGER`
    - `WhatsAppService.listForLead`
    - the follow-ups query
    - attachments
  - Call-log sync can put thousands of call activities on a lead.
  - After the fan-out come three sequential awaits: `getStatusCategory`, `orgDialCode` and `getOrgFormat`.
  - `console.warn('[PERF WARNING]…')` fires in production on any render over 200 ms.
- **Fix:**
  - Cap each timeline at ~100 with "Load older".
  - Fold the three awaits into the `Promise.all`.
  - Route the timing through `lib/log` at debug level.

##### M8 · Follow-ups page silently truncates at 500 rows
- **File:** `src/app/(dashboard)/follow-ups/page.tsx:18, 58-66`
- **Measured:**
  - A member with 2,498 pending follow-ups saw 500, while the counters said 2,498. There's no pager.
  - The page took 1.5 s and 3.4 MB.
- **Fix:** paginate each section (overdue, today, later) with a cursor on `(due_at, id)`.

##### M9 · Going-cold page renders every stale lead
- **File:** `src/app/(dashboard)/leads/cold/page.tsx:29-33`
- **Current:** the same failure mode as C1, with no limit.
- **Fix:** paginate, and do the query and sort in SQL.

##### M10 · Rep sync feed scans the whole workspace and returns other reps' lead ids
- **File:** `src/app/api/v1/leads/route.ts:113-119`
- **Current:**
  - For non-admins the SQL has no owner filter.
  - Every lead in the org is paged through, and other reps' leads come back as `{id, updatedAt, gone:true}` stubs.
  - A rep's first sync in a 100k-lead workspace pages through all 100k leads.
- **Fix:**
  - Filter by owner in SQL.
  - Emit "gone" only for leads the rep lost. Log reassignments, or compare against the ids the client sends.

##### M11 · Access rules drift between surfaces
- **File:** `src/lib/leads/access.ts`
- **Current:**
  - `filterAccessibleLeadIds` omits meeting attendees, so their bulk actions silently drop leads.
  - The list and ⌘K omit meeting-attendee leads, but the detail page allows them.
- **Fix:** the same single predicate as in H2.

##### M12 · Notification emails interpolate unescaped lead data into HTML
- **File:** `src/domains/notifications/service.ts:83-88`
- **Current:** the title and body contain a lead name, phone or email from public forms and webhooks, and they're inserted raw into `html`.
- **Fix:** HTML-escape them.

##### M13 · OTP and email fail open in production
- **Files:**
  - `src/lib/actions/auth.ts:279-284`
  - `src/lib/mail/mailer.ts:28-31`
- **Current:** when WATXIO or Resend isn't configured, OTP codes and email bodies (including reset links) go to stdout, and the action reports success.
- **Fix:** throw when `NODE_ENV === "production"`.

##### M14 · `/favicon.ico` returns 500 on every request
- **Files:** both `src/app/favicon.ico` and `public/favicon.ico` exist.
- **Current:** the server logs "conflicting public file and page file" on each request.
- **Fix:** delete one of the two files.

##### M15 · Command palette races
- **File:** `src/components/layout/CommandPalette.tsx:27-35`
- **Current:**
  - A slower earlier response can overwrite newer results.
  - If the query drops below 2 characters mid-search, "Searching…" sticks.
- **Fix:** keep a request counter and ignore stale responses; reset `loading` in the short-query branch.

---

#### Low

- **L1:** `@tanstack/react-query` is installed but used nowhere. There's no client cache or deduplication. For example, `LeadsTable` refetches statuses and users whenever its props are empty.
- **L2:** `MetricsCards` awaits two independent queries one after the other. The `requestStatusRows` reuse never hits on the executive dashboard, because pipeline distribution runs first.
- **L3:** the active-users cache (`src/lib/actions/users.ts:18`, 60 s) isn't invalidated when an invitation is accepted or a name changes. A new teammate is missing from owner pickers for up to a minute.
- **L4:** role permissions are cached in memory per instance for 60 s, so permission changes lag. There is also a second `roleCache` Map in `src/lib/rbac/index.ts`, next to `roleCache.ts`.
- **L5:** the lead pager (`LeadNav`) only steps within the 20 leads of the current page.
- **L6:** the middleware matcher omits `/meetings` (server-side `requireOrg` still protects it). `callbackUrl` drops the query string, so filters are lost after re-login.
- **L7:** `BYPASS_AUTH` is set in `.env` but referenced nowhere. Remove it.
- **L8:** code quality:
  - `LeadsAutoRefresh` has dead imports and parameters.
  - 216 `any` casts.
  - Facebook ingestion logs ids with `console.log` in production.
- **L9:** `getFollowUpMetrics` filters by follow-up `createdAt` for date ranges, so "Overdue" under "Today" only counts follow-ups *created* today.
- **L10:** the DB client uses `ssl: "prefer"` for a remote host, which can fall back to plaintext. Use `"require"`.
- **L11:** the rate limiter fails open when Redis is down, which weakens the login brute-force guard. This is a known design choice; consider failing closed for login only.
- **L12:** `notifyOrgAdmins` does a user lookup, an unread count and a push per admin per lead (N+1). It's fine at current sizes.
- **L13:** the cold page wrapper has no page padding (`space-y-6` only), unlike every other page.

---

#### Checked and working

- Tenant scoping in `listLeads`, `getLead`, the analytics conditions and the v1 routes.
- Server-side permission checks on actions and API routes; the frontend isn't trusted.
- The JWT re-validates role, org and active state on an interval.
- Notification count and list queries are index-backed (< 0.1 ms at 50k rows).
- The default leads list uses `leads_org_created_idx`.
- The `sync_at` trigger stamps every lead write, whatever the code path.
- Kanban paginates per column.
- The recycle bin is bounded to 500.
- The mobile list API clamps `limit` to 200 and uses keyset paging.
- `tsc` is clean; 746 tests pass.

#### Web ↔ mobile sync

| Flow | Status |
|---|---|
| Web creates or updates a lead → phone | Works through the `sync_at` trigger. The commit-order gap (H9) can lose a change. |
| Web soft-deletes a lead → phone | Works: the feed emits a `gone` stub. Hard purges after 30 days rely on the app's full re-pull. |
| Phone updates a lead → web lead page | Shows within ~10 s via the `LiveNextBestAction` change-token poll. |
| Phone updates or creates → web leads list | **Never shows until reload** (H3), unless a notification bumps the bell (M2). |
| Phone offline create → web | Shows after the phone syncs and the web user reloads. |
| Notes, activities and follow-ups | These don't change the lead row. The phone depends on per-lead fetches. Not verified on a device. |

#### Offline web

Only Quick Add is offline-aware, and its queue has the problems in H7. Other forms show an error toast on network failure; I didn't verify whether they keep the typed input. Before adding offline support elsewhere, decide which web workflows need it. Quick Add probably covers the realistic need.

---

#### Category index

| Category | Issues |
|---|---|
| Data loading | C1, H1, H3, H4, H5, H6, M6, M7, M8, M9 |
| Record detail | H2, M7, M11 |
| Notifications | M1, M2, M12, L12 |
| API | H9, M10, M4 |
| Database | C1, H1, H5, H6, H8, M4, M5, M6 |
| Frontend | H3, M1, M2, M15, L1, L5 |
| Backend | M3, M7, M13, L2, L9 |
| Code errors | M14, M15, L7, L8 |
| Logic errors | H1, H2, H6, M5, M11, L9 |
| UI | M8 (hidden rows), L13 |
| UX | H2 (message and status), M1, L5, L6 |
| Performance | C1, H1, H4, H5, H6, M2, M3, M4, M6, M7, M8, M9, M10 |
| Security and authorization | H1, H2, H8, M10, M11, M12, M13, L7, L10, L11 |
| Missing functionality | H3 (auto-refresh), M1 (load more), M8 (pager) |
| Incomplete features | H3 (`LeadsAutoRefresh` placeholder), H7 (offline queue) |
| Synchronization | H3, H9, M2, M10 |
| Offline and network | H7 |

#### Prioritized implementation plan

1. **Stop the bleeding.** These are small diffs:
   - C1: SQL scoring, `LIMIT 50` and a pager.
   - H4: clamp `pageSize`.
   - H1: one `count FILTER` query, scoped and excluding deleted leads.
   - H8: `deleted_at` filter plus a SQL `GROUP BY`, and require admin.
   - M14: delete one favicon.
   - M9: limit the cold page.
2. **Consistency:**
   - H2 and M11: one visibility predicate, plus a proper "no access" 404.
   - H3: a change-token auto-refresh for the leads list.
   - M1 and M2: rework the notification panel and drop `revalidatePath("/")`.
   - M5: tiebreakers and the default sort.
3. **Server cost:**
   - M3: parallelize the layout.
   - M7: cap the detail-page timelines.
   - H5 and H6: SQL aggregates plus `Suspense`.
   - M8: paginate follow-ups.
   - M4: `phone_digits` column plus a shared search builder.
   - M6: select only the needed columns.
4. **Sync and offline:**
   - H9: a safety window on the feed.
   - M10: owner-filtered feed.
   - H7: idempotent, single-tab outbox, cleared on logout.
5. **Security hygiene:** M12, M13, L10, L7.
6. **The remaining Low items.**

**Verification for each fix:**
- Re-run the same harness: scratch Postgres with the seed, the timing script, and the statement counter. They're in the session scratchpad, and the `ridhzo-audit` entry in `.claude/launch.json` starts the dev server against that database.
- Re-run the vitest suite and the relevant `e2e/*.spec.ts`.
- Targets:
  - `/leads/hot` under 1 s at 100k leads.
  - No page over 1 MB.
  - Layout at 2 query waves or fewer.
  - The member follow-up → lead click opens the lead.

---

## 2. Ridhzo — Pre-Marketing Product Audit (2026-10-01)

> Source: `docs/PRE_MARKETING_AUDIT_2026-10-01.md`

### Ridhzo — Pre-Marketing Product Audit (2026-10-01)

> **Superseded in part by [PRODUCTION_AUDIT_2026-10-02.md](PRODUCTION_AUDIT_2026-10-02.md)** — see its remediation status for what has since been fixed.

**Verdict: not ready to start paid acquisition yet.** The core product is solid (signup, login, tenant isolation, RBAC, CRUD and billing logic all held up under test). But there are 4 blockers that would waste ad spend or lose real customers' data on day one: email deliverability, the broken default signup tab, no usable conversion tracking, and lead loss when Redis hiccups. All are fixable in days, not weeks.

**Counts:** 2 Critical · 6 High · 11 Medium · 9 Low (plus items I could not verify, listed at the end).

---

#### Status update (2026-10-01, later)

**Fixed in code (uncommitted at time of writing):** H1 default tab, H2 UTM forwarding + login capture, H3, H4 (missed-call), H5, H6 (CI), M2, M3, M4, M5, M10, L1, L3, L5, plus session-refresh resilience for C2.
**Configured in production by the owner:** C1 (email domain), H1 (WhatsApp OTP), H2 (tracking IDs), H4 (webhook secrets). Not independently verified. A public check shows the live website bundle still has no Meta Pixel ID inlined: `NEXT_PUBLIC_*` values are baked in at build time, so the website must be **redeployed** after adding the variable. The app still has no GTM/GA tags (code change needed).
**Still open:** C2 (pooler / `maxDuration`), WhatsApp inbound webhook signature + cross-tenant matching, pending-event sweeper, M1, M6–M9, M11.

---

#### How this was tested

| What | How |
|---|---|
| App code at `HEAD` (2872c7b) | Ran on a **throwaway local Postgres + Redis** with all 91 migrations applied from scratch. Every external key (Resend, Razorpay, Google, Firebase, R2, AI) was blanked. **No production data was written.** |
| User journey | Drove signup → dashboard → create lead → logout → login → forgot/reset password → phone-OTP signup → duplicate signup in a real browser. |
| Security / isolation | 2 tenants + 1 member user. ~60 scripted API calls: cross-tenant read/write on every lead sub-route, member vs admin, unauthenticated hits, forged webhooks. |
| Production (read-only) | Live `ridhzo.com` and `app.ridhzo.com` HTML, headers, JS bundles, link crawl (62 links); Vercel deployments, domains, and 7 days of **runtime error clusters**. |
| Static checks | `tsc` clean · 854 unit tests pass (21 skipped) · eslint warnings only. |

**Not done (be aware):** production env-var values (access was denied by the permission layer, so I didn't retry), real email delivery, real payments (no Razorpay test keys), Google OAuth, Facebook/Google Lead Ads live, real WhatsApp, the Android app, `next build` (host disk was at 99%, which actually killed my local DB once), load testing, Playwright e2e suite (exists in `e2e/`, not run in CI either).

---

#### What works (verified, not assumed)

- Signup (email + WhatsApp-OTP): validation, required fields, duplicate email (case-insensitive) rejected with a clear message and **no orphan workspace**, user + org + roles + 14-day Starter trial created, welcome email dispatched, auto-login, redirect to dashboard with a 3-step setup checklist.
- Login: wrong/unknown password → generic failure; **rate limit kicks in** (8/15 min per email); session survives refresh and server restart; logout works; all dashboard routes redirect to `/login?callbackUrl=` when signed out; `/api/v1/*` returns 401.
- Password reset: generic response (no account enumeration), one-time token, reset works, token cannot be reused.
- **Tenant isolation: no leaks.** Tenant B got 404 on all 20+ lead sub-routes (read, edit, delete, notes, tags, WhatsApp, email, AI…) for tenant A's lead.
- RBAC: a `member` sees only own leads, is bounced from billing/users/API/audit/webhooks/admin; `/admin` is super-admin only.
- Input validation: bad email/oversize name/bad UUID/non-JSON all return clean 4xx; `<script>` in a name is stored but rendered as text; duplicate phone → 409.
- Email HTML: user data is escaped in notification, support, invite, meeting and billing emails (two small exceptions: L3).
- SSRF guard on tenant webhooks/SMTP is thorough. Invitation flow is transactional and concurrency-safe. Razorpay webhook signature check is correct and fails closed. Billing state machine handles out-of-order events.
- Marketing site: all 62 links return 200; pricing (₹249 / ₹449, yearly = 10×) matches the app's plan config.
- Production deploys are on `HEAD` and READY. DB query logging is correctly disabled in production.

---

#### CRITICAL

##### C1. Transactional email likely undeliverable in production (Resend sandbox sender)
- **Where:** invites, meeting emails, notifications — and by the same code path, welcome / password-reset / billing mail.
- **Evidence:** production runtime errors (50 occurrences, 21 Sep → 29 Sep): *"You can only send testing emails to your own email address (nvnkmr127@gmail.com). To send emails to other recipients, please verify a domain at resend.com/domains."* Also 89 × `rate_limit_exceeded` (Resend allows 10 req/s; a burst of notifications exceeded it, 29 Sep).
- **Steps:** invite any teammate with a non-owner email on production, or request a password reset for a non-owner address.
- **Expected:** email arrives from `no-reply@<your verified domain>`. **Actual (per logs):** Resend rejects; invite is created but never delivered (`[invite] email delivery failed; invite still created`). Password reset returns an error to the user.
- **Severity:** Critical — every new user who forgets a password, every invited teammate, every notification is lost. Last seen 29 Sep; I can't confirm whether it's since fixed (couldn't read env), so **test it live before spending on ads**.
- **Root cause:** `MAIL_DOMAIN` unset / domain not verified in Resend → `senderFor()` falls back to `MAIL_FROM = onboarding@resend.dev` (`src/lib/mail/mailer.ts:15-24`; `.env.example:33`).
- **Fix:** verify the domain in Resend (SPF/DKIM/DMARC), set `MAIL_DOMAIN`, `MAIL_FROM`, `MAIL_REPLY_DOMAIN` in Vercel **and** the Railway worker. Add a 10 req/s throttle/queue around bursts of `notifications` mail. Send one real test of each template to a Gmail + Outlook inbox.

##### C2. Production Postgres connections are unreliable → logouts, 500s, and 300 s hangs
- **Evidence (7 days of prod logs):** `read ECONNRESET` on `select … from users` (26 occurrences, 19 users, **still happening 01:24 UTC today**); `JWT_SESSION_ERROR` (31, 18 users — users are bounced to `/login`); `Task timed out after 300 seconds` (26, 23 users — includes `/login`, `/signup`, `/forgot-password`); `connect ETIMEDOUT`; and `/api/health` itself reported `"database":"down"` on my first call today, then `up` on the next six.
- **Expected:** a transient DB blip is retried invisibly. **Actual:** the failed query bubbles up; in `auth.ts` `jwt()` a DB error during the 60 s refresh makes NextAuth drop the session; a DB error inside `authorize()` surfaces the SQL text in the redirect (see M3).
- **Severity:** Critical for a launch — paid traffic that hits `/signup` or `/login` during a blip sees a 500, timeout, or logout.
- **Root cause (likely):** Railway TCP proxy resets idle sockets; pooled `postgres-js` connections go stale (`src/db/index.ts`: `idle_timeout: 20`, `max_lifetime: 600`, no retry). Vercel functions with `max: 20` per instance can also exhaust Railway's connection cap. Not reproducible locally (no proxy).
- **Fix:** (1) retry-once wrapper for `ECONNRESET`/`CONNECTION_*` errors in the db client; (2) in `jwt()`, catch DB errors and keep the existing token instead of throwing; (3) put a pooler (PgBouncer / Railway private network / Neon) between Vercel and Postgres, `max: 3–5` per function instance; (4) set function `maxDuration` ≈ 30 s rather than the 300 s default so hangs fail fast; (5) alert on `/api/health` = 503.

---

#### HIGH

##### H1. Default signup/login tab (WhatsApp OTP) is broken in production
- **Evidence:** `[watxio-otp] … Watxio 401: Unauthenticated` (11 occurrences, 25–28 Sep) and `Watxio 500: Message blocked by 24h policy. Use a Template` (5, 25 Sep). Both `/signup` and `/login` open on the **WhatsApp OTP tab**.
- **Expected:** code arrives on WhatsApp. **Actual:** "We couldn't send the code on WhatsApp…". A first-time visitor's first attempt fails.
- **Root cause:** expired `WATXIO_API_KEY`; `WATXIO_OTP_TEMPLATE` not set so the plain-text fallback is blocked outside the 24 h window (`lib/actions/auth.ts` `sendWhatsAppOtpAction`). Also: if WhatsApp isn't configured at all, production returns "isn't available" but the tab stays default.
- **Fix:** rotate the key, create + approve an OTP *authentication template* and set `WATXIO_OTP_TEMPLATE`. Until it's proven, **make Email (or Google) the default tab**, or hide the WhatsApp tab when `isConfigured()` is false.

##### H2. No usable conversion tracking (Meta / Google Ads) — you'd be flying blind
Three separate gaps, all confirmed:
1. **Meta Pixel is not loaded on the website.** Live bundle has `gaId:"G-59GN5JJMJT"`, `gtmId:"GTM-MB4J36VH"` inlined but `NEXT_PUBLIC_META_PIXEL_ID` was never set at build → no `fbq`, no `_fbp` cookie. Unless the Pixel lives inside GTM (can't verify), Meta can't optimise or attribute.
2. **The app (`app.ridhzo.com`) has no client-side tracking at all** — no GTM/GA/Pixel on `/signup`, `/login`, dashboard. There is no browser `CompleteRegistration`/`Lead` event, no Google Ads conversion, and no GA4 `sign_up`. Only a server-side Meta CAPI call exists (`CompleteRegistration`, `Subscribe`), and only if CAPI is configured in the admin console (can't verify). Google Ads has `gclid` stored but **no offline-conversion upload**, so Google Ads signup conversions are impossible today.
3. **Campaign attribution is dropped at the website→app hop.** Website CTAs are static links (`https://app.ridhzo.com/signup`, `…?plan=starter`) — no code forwards `utm_*`, `gclid`, `fbclid` (`ridhzo-website/src`: zero references). The app only captures them if they're on the `/signup` URL itself (`lib/tracking/utm.ts`, called only from `signup/page.tsx`). Also never captured on `/login`, so Google-button signups from there have no attribution.
- **Also:** both GA and GTM are configured — the site's own comment (`analytics-config.ts`) warns this double-counts if GA4 is also inside GTM. Consent is strict opt-in, so only a minority of visitors will be measured (reasonable for EU, heavy undercount for India — consider region-based defaults, with CAPI backfilling).
- **Fix:** add GTM to the app layout (consent-gated) and push `sign_up`/`login`/`begin_checkout`/`purchase` to `dataLayer`; set `NEXT_PUBLIC_META_PIXEL_ID` (or configure inside GTM — one method only); add a small script on the website that appends stored UTMs/click-IDs to every `app.ridhzo.com` link; call `captureAttribution()` on `/login` too; send a shared `event_id` for browser/CAPI dedupe; upload gclid offline conversions.

##### H3. Inbound lead webhooks can lose leads permanently when Redis is unavailable
- **Steps (reproduced):** with Redis down, POST to `/api/webhooks/generic_webhook?sourceId=…` with `x-idempotency-key: K`.
- **Expected:** 5xx → sender retries → lead eventually created. **Actual:** attempt 1 returns 500 *after* storing the event as `pending`; the sender's retry with the same key returns `200 {"duplicate":true}` and is never enqueued. After Redis returned, the lead never existed. No sweeper re-queues `pending` events.
- **Root cause:** `app/api/webhooks/[provider]/route.ts` inserts the row, then `ingestionQueue.add()`; the idempotency short-circuit treats any existing row as done. Production logs show Redis timeouts (`Rate limit timeout`, 10 occurrences), so this is not hypothetical. Meta Lead Ads is the likeliest source to hit it.
- **Fix:** if `queue.add` fails, mark/delete the event (or return 5xx *and* allow re-enqueue when a duplicate is `pending`); add a periodic job that re-enqueues `webhook_events` stuck `pending` > 2 min; for hosted forms (already processed inline) no change.

##### H4. Unauthenticated webhooks that are open when their secret env var is unset
Reproduced locally with default env:
- `POST /api/webhooks/missed-call` `{"phone":"…"}` — **no auth, no `organizationId` required** → matched tenant A's lead, logged activity, and attempted a WhatsApp send. With the Business API configured it would **message real people on any tenant's behalf**. Secret check is `if (secret && …)` (`missed-call/route.ts:17`), so unset = open. Without an `organizationId` it matches the first lead **across all tenants**.
- `POST /api/webhooks/whatsapp` — signature only checked `if (WATXIO_APP_SECRET)`; unset = forged inbound replies written into any lead timeline, plus paid AI classification per forged message.
- `WhatsAppService.recordInbound` (shared) also matches by phone **across all tenants** with `limit(1)` — if the same phone is a lead in two workspaces, a genuine reply can land in the wrong tenant's timeline (cross-tenant data misattribution).
- **Severity:** High if `MISSED_CALL_WEBHOOK_SECRET` / `WATXIO_APP_SECRET` are unset in prod (can't verify; `.env.example` ships `MISSED_CALL_WEBHOOK_SECRET=""`).
- **Fix:** fail closed (401 when the secret is missing); require `organizationId`; resolve the tenant from the WhatsApp phone-number-id in the payload; rate-limit on the *first* XFF hop (it currently keys on the whole header, which a client can vary).

##### H5. Security headers missing (clickjacking / MIME-sniffing / referrer leakage)
- Verified on prod: `app.ridhzo.com` and `ridhzo.com` return **only** `strict-transport-security`. No `X-Frame-Options`/`frame-ancestors`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, CSP. `X-Powered-By: Next.js` exposed in dev (`poweredByHeader` not disabled).
- **Impact:** the login/billing UI can be iframed (clickjacking); reset-password tokens in the URL leak via `Referer`.
- **Fix:** `headers()` in `next.config.ts`: `frame-ancestors 'none'`, `nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`, then a report-only CSP. Set `poweredByHeader:false`. (Note `/f/[slug]` and `/book/[slug]` may be intentionally embeddable — exempt those.)

##### H6. Deploys have shipped before DB migrations (schema drift in production)
- **Evidence:** production 500s from missing columns — `first_contacted_at` (24 Sep), `state` (25 Sep), `lead_field_config` (26 Sep). Build is `next build` only; CI runs tsc/lint/vitest only; nothing runs `drizzle-kit migrate`. (Separately, `time zone "Asia/Calcutta" not recognized` took the India dashboard down on 29 Sep; the analytics path now avoids it, but prod Postgres lacks that tz alias — check other `AT TIME ZONE <org tz>` use.)
- **Fix:** run `db:migrate` as a gated deploy step *before* promoting the build (expand/contract migrations so old code keeps working); add a CI job that applies all migrations to an empty Postgres (I did this by hand: all 91 apply cleanly) and runs the Playwright smoke suite.

---

#### MEDIUM

| # | Issue | Where / evidence | Fix |
|---|---|---|---|
| M1 | **No email verification at signup.** Anyone can register `victim@company.com`. Combined with `allowDangerousEmailAccountLinking: true` and no `email_verified` check in the Google `signIn` callback, an attacker who pre-registers a victim's email owns the account the victim later "signs in with Google" into (pre-hijacking). | `lib/actions/auth.ts`, `lib/auth.ts` | Send a verification link/OTP; require `profile.email_verified` for Google; link accounts only when verified. |
| M2 | **Sessions survive password reset / change.** Reproduced: a session issued before a reset still returns the user afterwards (30-day JWT). | `resetPasswordAction`, `changePasswordAction` | Call `SessionService.revokeUserSessions(userId)` on both. |
| M3 | **DB error text leaks into login redirect** and breaks login. Prod: `TypeError: Headers.set: "/login?error=Failed query: select … from users …"` and `GET /api/auth/error?error=Failed+query…` (SQL + user id in the URL). | `authorize()` rethrows `err.message` (`lib/auth.ts`) | Map unknown errors to a fixed code (`"ServerError"`), log the real one. |
| M4 | **WhatsApp OTP: no per-IP limit, weak RNG, enumeration.** Only a 45 s per-phone cooldown → one IP can trigger OTPs to unlimited numbers (WhatsApp cost / harassment). Code uses `Math.random()`. `purpose=login` returns "no account with this number" / signup "already has an account" (phone enumeration). | `sendWhatsAppOtpAction` | Per-IP + global limit; `crypto.randomInt`; neutral message on login. |
| M5 | **Razorpay webhook swallows errors and returns 200** — a transient DB failure (see C2) permanently drops a paid activation/cancel event; Razorpay won't retry. | `api/webhooks/razorpay/route.ts:25-28` | Return 500 on failure (Razorpay retries up to 24 h); handlers are already idempotent. |
| M6 | **Pricing-page plan is ignored.** `/signup?plan=starter|unlimited` links exist on the site but `signup/page.tsx` never reads `plan`; user lands on a trial with no plan context. | `ridhzo-website` pricing CTAs vs app signup | Read `plan`, store it, route to checkout after onboarding, or drop the param. |
| M7 | **Dashboard is chatty:** `/` runs **52 SQL statements** per load (empty tenant), `/follow-ups` 18, `/leads` 25; ~13 are single-key `platform_configs` lookups repeated per request. The code itself notes a ~550 ms remote DB round-trip. With C2, this multiplies timeout risk. | `(dashboard)/layout`, `PlatformConfigService` | Cache `platform_configs` 30–60 s in-process; batch layout lookups. |
| M8 | **Public lead forms / webhooks have no bot protection** (no CAPTCHA/honeypot/Turnstile). 10/min per IP, 200/min per form — a bot can fill a tenant's 300-lead Free quota in under 2 min. | `lib/actions/publicLead.ts` | Honeypot + Cloudflare Turnstile (you're already behind Cloudflare). |
| M9 | **Existing users can't be invited.** Inviting an email that already has an account fails ("A user with that email already exists") — one email = one workspace. A colleague who signed up first can never join a team. | `domains/invitations/service.ts:25` | Product decision: support multi-workspace membership or a "move my account" flow; at minimum a clear message. |
| M10 | **Signup rate limit 5/hour/IP** blocks shared-NAT cases (offices, colleges, events, mobile carriers — important for India). | `signupAction` | Raise to ~20/h or key on IP+UA; keep email-level limit. |
| M11 | **CI doesn't build or run e2e.** `ci.yml` = tsc + lint + vitest. Tenant-isolation, kanban, automations specs exist in `e2e/` but never run; a broken `next build` is only caught by Vercel. (Two recent prod builds ended `ERROR` on 30 Sep before the next one succeeded.) | `.github/workflows/ci.yml` | Add build + Playwright smoke job with a Postgres service. |

#### LOW

- **L1** No Terms/Privacy consent on signup form (website has `/terms`, `/privacy`; the app's signup doesn't link or require them). Needed for paid-ad compliance (DPDP/GDPR, Meta/Google policy).
- **L2** Invalid phone (`"abc"`) is silently dropped → lead created with no phone, HTTP 201. Past-dated follow-ups accepted. `PATCH` with `budget` as a number returns an unreadable `invalid_union` error.
- **L3** Unescaped `org.name` / `owner.firstName` in two billing lifecycle emails (`lifecycleService.ts:534, 614`) → HTML injection into the owner's own mail.
- **L4** Phone-OTP and Google signups create org then user in separate statements (not one transaction) → orphan workspaces if the second fails (email signup is transactional). `users.phone` has no unique index (only a race-prone app check).
- **L5** Duplicate-email message from `signupAction` falls through to a generic error (checks for the word "duplicate"; actual text is "…already exists"), so the field-level inline error isn't shown.
- **L6** Per-email login lockout (8/15 min) lets anyone lock a known user out for 15 minutes; mobile login keys the IP limit on the *entire* `X-Forwarded-For` header.
- **L7** Wrong OTP stays in the input after an error; two nag banners (trial + "add your mobile number") consume ~150 px of an 812 px phone screen.
- **L8** Server-action body limit is 25 MB globally (`next.config.ts`) — applies to unauthenticated `signupAction` too; CSV import still pre-checks at 1 MB (stale comment). Prod once logged `Body exceeded 1 MB limit` on a lead action.
- **L9** Dev-only `Sign in as demo admin (dev)` button is correctly gated on `NODE_ENV === "development"` (confirmed absent on prod) — noted only so it isn't re-reported.

Earlier prod errors that look **already fixed** in `HEAD` (verify no recurrence): R2 upload `411` (fix `c1e6743`), `isSendableFollowUp` server/client boundary (last seen 25 Sep), `useSession` undefined on `/` and `/profile` (26 Sep), `Asia/Calcutta` analytics SQL.

---

#### Production-readiness checklist (what I could and couldn't confirm)

| Area | Status |
|---|---|
| Vercel deployment = `HEAD`, domains `app.ridhzo.com` (+ 2 redirects), HTTPS/HSTS | ✅ |
| Env validation at boot (`DATABASE_URL`, `NEXTAUTH_SECRET` fatal; others warn) | ✅ in code; **prod values not inspected** |
| Resend domain, `MAIL_DOMAIN` | ❌ see C1 |
| WhatsApp (Watxio) key + OTP template | ❌ see H1 |
| `MISSED_CALL_WEBHOOK_SECRET`, `WATXIO_APP_SECRET`, `WATXIO_VERIFY_TOKEN` | ❓ verify set (H4) |
| `NEXT_PUBLIC_META_PIXEL_ID`, Meta CAPI config in admin console | ❌ pixel absent (H2); CAPI ❓ |
| Razorpay live keys, 4 plan IDs, webhook secret, **webhook URL registered in Razorpay dashboard** | ❓ not testable |
| Background worker (Railway, 1 replica, `numReplicas:1`, restart ON_FAILURE ×10, no health check) | ❓ confirm it is running and drains `ingestion`, `sequence`, `trial-downgrade`, `webhook-retry` queues; add an alert if a queue backs up |
| DB backups: GitHub Action every 6 h with restore-proof to R2 | ✅ in code; confirm last run is green |
| Sentry DSN | ❓ (DSNs exist in `.env`); none of the prod errors above came from Sentry, so check it's receiving |
| Cron-like jobs | All BullMQ repeatables (no HTTP cron routes) — they only run if the worker is up |
| `/api/health` | ✅ exists, 503 on DB/Redis failure — wire an uptime monitor to it |

---

#### Recommended order of work (≈ 1 week)

1. **Day 1:** C1 (verify domain + send real test of every template), H1 (fix Watxio or default to Email tab), H5 (headers), M2/M3 (small auth fixes).
2. **Day 2–3:** H2 (GTM in app, Pixel, UTM forwarding, `sign_up`/`purchase` events), L1 (consent links).
3. **Day 3–4:** C2 (retry + pooler + shorter `maxDuration` + health alert), H3, M5.
4. **Day 4–5:** H4 (fail-closed webhooks), H6 (migrate-on-deploy, CI build + e2e), M1 (email verification), M8 (Turnstile).
5. Re-run this audit's smoke: signup → email arrives → reset → invite → payment (Razorpay test mode) → ad-click → UTM visible in admin attribution.

*No application code was changed in this audit; this file is the only addition.*

---

## 3. Ridhzo — Full Production-Readiness Audit (2026-10-02)

> Source: `docs/PRODUCTION_AUDIT_2026-10-02.md`

### Ridhzo — Full Production-Readiness Audit (2026-10-02)

**Mode:** inspect and report only. No application code, schema, config or data was changed. This file is the only thing added.
**Baseline checks run:** `tsc --noEmit` → clean. `vitest run` → 184 files / 860 tests pass, 4 files / 21 tests skipped.

#### How to read this report (coverage and honesty)

- **Method:** static tracing of the real code paths — middleware → auth → RBAC → action/route → service → SQL — plus repo-wide pattern scans (every `.update/.delete` without an org filter, every server action's guard, every `/api/v1` route, every webhook, every `fetch(`, secrets scan incl. git history).
- **Not done:** I did not run live cross-tenant attacks against a running instance, did not touch the Railway DB/Redis, did not inspect production env vars, Vercel/Railway dashboards, the mobile app, or the (private) R2 bucket settings. Anything marked **(config-dependent)** needs you to check the real deployment.
- **Read in full:** auth, RBAC, `apiAuth`, mobile JWT, secrets crypto, billing (plan/service/actions/webhook), the generic/Razorpay/WhatsApp/missed-call/Facebook webhooks, attachments/storage, SSRF guard, workers bootstrap, DB client, CI/deploy files, schema for users/leads. **Sampled:** the other 790-ish files — every server action was checked for its guard (script), every `/api/v1` route for `authorizeApiRequest`, every id-based mutation for an org filter. Components were sampled (LeadsTable, DuplicatesManager, destructive-action confirmations, page guards), not read line by line.
- **Prior audits exist** (`docs/WEB_APP_AUDIT_2026-09-28.md`, `PRE_MARKETING_AUDIT_2026-10-01.md`). I did not rely on them; where I found the same thing I say so.
- **Overall tenant-isolation result:** the *service layer* is disciplined (nearly every id-based mutation re-checks org first). The leaks are at the edges: two missing authorization checks, one webhook that cannot know the tenant, and an architecture that depends on every caller remembering the org filter (no RLS).

---

#### Remediation status (2026-10-02, later)

- **Critical C1–C2, High H1–H5, H7–H11:** fixed in code (see git history). **H6 was a false finding** — a fresh database migrates cleanly (the table is created by `0018_shared_content`); the orphan duplicate file was removed.
- **Medium M1–M21:** fixed in code, except where noted: M3 makes tenant arguments required in the follow-up, lead-assignment, status and source services but does **not** add Postgres row-level security; M15 adds key expiry and auto-revoke on user removal but not per-key scope lists or plan gating; M16 adds a 3-write cap and audit trail but not a human-confirm step; M17's audit writes remain best-effort; M13 needs `pg_trgm` available on the database (migration 0096 skips the indexes with a notice otherwise).

- **Low L1–L16:** fixed except L14 (signup email enumeration, kept as a deliberate UX trade-off), L16 (`timestamp` → `timestamptz` is a large migration, deferred) and L13 (already handled in code — link-preview bots and the sender are excluded from view counts). The CI dependency audit is report-only for now.

- **F. Incomplete features:** done — webhook DLQ screen, duplicate bulk-status action removed, legacy CSV dialog removed, Razorpay refund (credit note) and failed-payment events, web Calls page, per-tenant WhatsApp accounts with tenant-scoped inbound. **Not built (product decisions):** multi-workspace membership and separate Contacts/Companies entities.

- **G. Missing frontend:** done — failed-webhook screen, read-only lead/list/board states for roles without `leads.edit`, delete and export permission-aware controls, a new `leads.export` permission, plan meters for automations/sequences/sources, and batched import with a progress bar. Export still shows a plain "Exporting…" state (one server call, no incremental progress).

- **H. Missing backend:** done — monthly metering for WhatsApp messages, emails, exports, imported rows and API-key requests plus an attachment storage cap (atomic, refunded on failure); per-user and per-workspace send rate limits; email-verification gate for new password sign-ups; per-area API-key scopes; central `AuditService.audited` wrapper. **Not done:** Postgres row-level security (needs every query to run inside a transaction that sets the tenant; not retrofittable safely across the codebase).

- **I. Missing business logic:** done — over-cap lead sources are paused on downgrade (their leads are refused and recorded, replayable after upgrade); AI credits renew on the subscription's own billing day; a database error no longer silently demotes a paying workspace to Free (last known plan, logged); unused role-name admin helpers removed and the "admin" permission rules named in one place. Seats and leads over a cap keep working but nothing new can be added, with an over-limit notice in the usage menu.

- **J. Tenant isolation:** done where code can do it — activity writes and the WhatsApp/shared-link/sequence readers are workspace-scoped, ~12 more id-keyed writes now carry an org predicate, `teams`/`lead_sources` tenant columns are NOT NULL and `assignment_rules` has its own tenant column (migration 0101, applies only when data is clean), and a real-Postgres isolation test runs in CI. `users.organization_id` stays nullable on purpose (platform super-admins), `roles.organization_id` null = shared system roles; no row-level security.

- **K. Usage limits:** done — caps (and meters) for API keys, webhook endpoints and custom fields; all monthly counters and AI credits renew on the same billing-cycle period; deactivated users no longer hold a seat (reactivating re-checks the cap); the AI agent refunds a turn that produced no answer. Not capped: meetings, outbound-webhook deliveries, saved views, teams, notifications, enrichment calls (no cost or abuse driver identified).

- **L. API & integrations:** done — timeouts on Google, Meta, Watxio and the AI gateway; Razorpay and Meta Graph responses validated at the boundary; dead Google grants are dropped (UI shows "not connected"), and a user's Google grant is deleted when they are deactivated/deleted; generic webhook body capped at 256 KB; `SECRETS_STRICT` plus an extended `encrypt:source-secrets` (webhook secrets, Facebook page tokens, Google tokens) to retire plaintext. Not changed: `?key=` remains supported (documented, header preferred); Watxio's response is still read tolerantly because its envelope isn't documented.

- **M. Database:** done — lead email uniqueness is case-insensitive; `whatsapp_messages.provider_message_id` unique; `webhook_events(status, created_at)` index; every foreign key into `leads` now cascades (or nulls, for nullable links) so a child table can never block a purge or leave orphans; audit-log retention (default 2 years, `AUDIT_RETENTION_DAYS`); drizzle snapshot caught up (migration 0103) and TS-schema-vs-DB drift diffed; the WhatsApp inbound phone fallback now uses the trigram-indexed expression. Migrations 0094-0104 got realistic ordered timestamps (fabricated far-future ones would have made drizzle skip later migrations). **Deliberately not changed:** mixed int/boolean flags (`lead_sources.is_active` etc. — needs a coordinated code change), `timestamp` → `timestamptz`, `activities`/`follow_ups`/`whatsapp_messages` getting their own `organization_id` (large backfill; tenancy there is enforced through the lead), idempotency guards on old migrations.

- **N. Performance:** done where it pays — insights reports are bounded to the newest 50 000 leads (`ANALYTICS_MAX_LEADS`) with a notice on the page; bulk status change runs 5 leads at a time; the dashboard layout's usage meters are memoised 15 s per workspace; earlier rounds already fixed trigram search, the inbound-WhatsApp scan, purge batching, pool sizing and worker-in-lambda. **Left as is, deliberately:** the sync feed's `pg_stat_activity` horizon (correctness depends on it being fresh; cheap with a same-role app user), per-instance role cache (15 s TTL), moving every report to SQL aggregates (large rewrite; the 5-minute snapshot cache absorbs it).

- **O. Security:** all numbered findings were fixed in earlier rounds; this round added: nodemailer upgraded to 10.x (fixes a cross-tenant SMTP credential disclosure) and non-breaking `npm audit fix`; a Content-Security-Policy in **report-only** mode plus COOP/permitted-cross-domain headers (review violations, then enforce); mobile token rotation (the old token retires 10 minutes after a refresh); magic-byte checks on web and mobile uploads plus the storage cap on mobile; an `https` check on `NEXTAUTH_URL` at boot. **Still open:** `@grpc/grpc-js` (via the legacy `firebase` client SDK) and `postcss` inside Next (needs Next 16) have audit advisories with no non-breaking fix; the 25 MB Server Action body limit applies to every action (kept — uploads need it); signup still reveals whether an email is registered (UX trade-off).

- **P. Documentation:** done — README rewritten; `.env.example` covers every variable; new `docs/API_V1.md`, `docs/OUTBOUND_WEBHOOK_EVENTS.md`, `docs/RUNBOOK.md`, generated `docs/DATABASE.md` (`scripts/gen-db-doc.mjs`), `deploy/README.md` (canonical topology); `docs-consolidated/` is now generated by `npm run docs:consolidate` and checked in CI; older audits carry a superseded note. The React Query mention in MOBILE_APP.md is correct (the mobile app uses it; the web app does not).

#### A. Executive Summary

Ridhzo is a mature, unusually well-commented Next.js 15 / Drizzle / Postgres / BullMQ multi-tenant CRM. Typecheck is clean, 860 tests pass, org scoping in services is consistent, SSRF/webhook-signature/idempotency work has clearly been done with care, and secrets are not committed (`.env*` never appear in git history).

It is **not yet safe to call production-ready for paying multi-tenant traffic.** The reasons are concentrated, and most are small fixes:

1. **Two authentication/authorization holes that are real exploits, not hygiene:** a Firebase-token fallback that can sign anyone in as any phone number (C1), and a bulk-WhatsApp action with *no lead/tenant check* that sends through any tenant's lead (C2).
2. **The `leads.edit` ("Viewer / read-only role") rule is enforced on only about a third of write paths** (H1). The permission model advertises read-only roles; the web backend lets them send WhatsApp/email, edit stage/value, attach files, book meetings, enrol sequences.
3. **Billing safety nets depend on env config** (manual plan switch when Razorpay keys are absent, H3) and **usage limits are check-then-insert and cover only 6 of ~15 metered things** (H4, and Section K).
4. **Infrastructure contradictions:** BullMQ *consumers are instantiated inside the web/serverless process* (H5), the committed migration set **cannot build a fresh database** (H6), and the documented compose stack publishes Postgres/Redis to the internet without TLS (H7).
5. **No MFA anywhere, including on the super-admin that can hard-delete tenants** (H8), and unverified-email signup enables Google account pre-hijack (H2).

Reasonable next step: fix C1, C2, H1–H3, H5, H6 (all ≤ a few days each), then re-run this audit's targeted tests. The *Recommended Fix Order* is in Section R.

**Counts:** 2 Critical · 11 High · 21 Medium · 16 Low.

---

#### Feature completion matrix

Legend: ✓ verified in code · ◐ partial / gaps noted · ✗ missing · ? not verified (not read in depth). "Tests" = test files exist for the core logic (not that coverage is adequate).

| Feature | Frontend | Backend | Database | API | Validation | Permissions | Tests | Status | Missing items |
|---|---|---|---|---|---|---|---|---|---|
| Email/password signup & login | ✓ | ✓ | ✓ | n/a (NextAuth) | ◐ min-6 pwd | ✓ rate-limited | ✓ | **Partial** | email verification never enforced (H2); no MFA; no pwd strength rules |
| Google login | ✓ | ✓ | ✓ | n/a | ✓ | ◐ | ✓ | **Partial** | no `email_verified` check; account pre-hijack (H2) |
| Phone/WhatsApp OTP login | ✓ | ✓ | ✓ | v1 + web | ✓ | ◐ | ✓ | **Broken (C1)** | Firebase fallback bypass; no unique constraint on `users.phone` (M7) |
| Leads CRUD / recycle bin / purge | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ (`leads.edit/delete/purge`) | ✓ (57 lead-domain tests) | **Complete** | purge non-transactional (M9) |
| Lead list / search / filters / kanban | ✓ | ✓ | ◐ | ✓ | ✓ | ✓ | ✓ | **Complete** | `ILIKE '%q%'` unindexed (M13); negative `limit` → 500 (L3) |
| CSV import (wizard) | ✓ | ✓ | ✓ | n/a | ✓ | ✓ | ✓ | **Partial** | **two parallel import paths** (`ImportCsvDialog`→`uploadCsvAction` vs `LeadImportWizard`→`import.ts`) with different limits/logic (M14); no audit entry |
| CSV export | ✓ | ✓ | n/a | n/a | ✓ | ◐ | ✗ | **Partial** | any role can export all *visible* leads; no export permission/quota; no tests |
| Custom fields / statuses / pipeline stages | ✓ | ✓ | ✓ | ✓ v1 | ✓ | ✓ | ✓ | **Complete** | status delete has no confirm (L7) |
| Tags | ✓ | ✓ | ✓ | ✓ | ✓ | ◐ (no `leads.edit`) | ✓ | **Partial** | H1 |
| Notes / activities / timeline | ✓ | ✓ | ✓ | ✓ | ✓ | ◐ (delete/update note: no `leads.edit`) | ✓ | **Partial** | no org column on `activities` — tenancy only via lead join |
| Follow-ups / tasks | ✓ | ✓ | ✓ | ✓ | ✓ | ◐ | ✓ | **Partial** | H1; service methods have *optional* `organizationId` (M3) |
| Meetings + public booking | ✓ | ✓ | ✓ | ✓ | ✓ | ◐ | ✓ (1 file) | **Partial** | public booking emails any address with no verification/CAPTCHA (M5); H1 |
| Sequences (drips) | ✓ | ✓ | ✓ | ✓ | ✓ | ◐ (`enrollLeadsAction` no `leads.edit`) | ✓ | **Partial** | no send cap/quota on drips (K) |
| Automations | ✓ | ✓ | ✓ | n/a | ◐ `type` is free string | ✓ | ✓ | **Partial** | "Create" button visible to everyone; `toggle` not plan-gated (M12); action config unvalidated |
| Lead sources: webhook / hosted form | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | **Partial** | no CAPTCHA/spam control (H9); legacy secretless sources unauthenticated (L5); idempotency key global across tenants (M2) |
| Facebook Lead Ads | ✓ | ✓ | ✓ | ✓ | ✓ signature enforced in prod | ✓ | ✓ | **Complete** | default verify-token literal in code (L9) |
| Google Lead Ads | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | **Complete?** (route read only by signature test) | — |
| Lead distribution rules (outbound) | ✓ | ✓ | ✓ | ✓ | ✓ | `api.manage` | ✓ | **Complete** | — |
| Outbound webhooks + DLQ | ◐ | ✓ | ✓ | ✓ | ✓ SSRF guard | ✓ | ✓ | **Partial** | **DLQ list/retry/purge actions have no UI** (`listWebhookDlqAction`, `retryWebhookDlqAction`, `purgeWebhookDlqAction` are never imported); assert-then-fetch DNS rebinding window (M10) |
| API keys + `/api/v1` | ✓ | ✓ | ✓ | ✓ | ✓ | ◐ | ✓ | **Partial** | keys have no expiry, no per-key scope below `full/read_only`, not plan-gated, survive creator's removal (M15) |
| WhatsApp (Watxio) send | ✓ | ✓ | ✓ | ✓ | ✓ | ◐ | ✓ | **Partial** | C2; H1; **single platform-wide account** (no per-tenant credentials) |
| WhatsApp inbound | n/a | ◐ | ◐ | ✓ | ◐ signature optional | n/a | ✓ | **Broken for multi-tenant (H10)** | no tenant resolution; no dedupe by provider id |
| Email send / SMTP per tenant | ✓ | ✓ | ✓ | ✓ | ✓ SSRF-pinned | ✓ | ✓ | **Complete** | — |
| AI (drafts, recap, assistant, agent) | ✓ | ✓ | ✓ | ✓ | ✓ | ◐ (agent: `requireOrg` only) | ◐ | **Partial** | prompt-injection only guarded by prompt text (M16); obscure default model for tool-calling (L12) |
| Insights / analytics | ✓ | ✓ | ✓ | n/a | n/a | ✓ | ✓ | **Partial** | ~20 services pull the whole tenant lead set into Node memory (M12-perf) |
| Billing (Razorpay) | ✓ | ✓ | ✓ | ✓ webhook | ✓ | ✓ `billing.manage` | ✓ (8 files) | **Partial** | H3; webhook has no event-id dedupe; no refund/`payment.failed` handling |
| Usage limits / plan gating | ✓ | ◐ | ◐ | ✓ | n/a | n/a | ✓ | **Partial** | Section K |
| Users / roles / teams | ✓ | ✓ | ✓ | ✓ | ✓ | ◐ | ✓ | **Partial** | `users.manage` can delete/deactivate other admins (M1); no multi-workspace membership |
| Audit log | ✓ | ✓ | ✓ | ✓ | n/a | ✓ | ✓ | **Partial** | many mutations unaudited (M17); best-effort writes |
| Notifications / push / email prefs | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | **Complete** | — |
| Attachments (R2/local) | ✓ | ✓ | ✓ | ✓ | ◐ ext-only | ◐ | ✓ | **Partial** | public-R2 redirect defeats access control (H11); no per-plan storage quota |
| Super-admin console / impersonation | ✓ | ✓ | ✓ | n/a | ✓ | ✓ `requireSuperAdmin` | ✓ (13 files) | **Partial** | no MFA (H8); maintenance mode only enforced in the dashboard layout (M18) |
| Compliance (DSR, retention, tenant delete) | ✓ | ✓ | ✓ | n/a | ✓ | ✓ | ✓ | **Complete?** | redaction updates by leadId without org filter (callers pre-check) |
| Mobile app API | n/a | ✓ | ✓ | ✓ | ✓ | ✓ live role | ✓ | **Partial** | visibility rule differs from web (M6) |
| Contacts / Companies / Customers entities | ✗ | ✗ | ✗ | ✗ | – | – | – | **Not built** | Everything is a lead (documented). If the brief expects separate entities, this is a gap |
| Calls | ◐ | ◐ | ✓ | ✓ sync endpoints | ✓ | ✓ | ? | **Partial** | call sync is mobile-only |
| Documentation | – | – | – | – | – | – | – | **Weak** | Section P |

---

#### B. Critical Issues

> Format: **Issue / Location / Current / Expected / Impact / Severity / Root cause / Fix / Files / DB / API / Frontend / Backend / Tests.**

##### C1 — Phone-number account takeover via Firebase fallback in `authorizePhoneOtp`
- **Location:** `src/lib/auth.ts:92` (called by NextAuth `phone-otp` provider and by `POST /api/v1/auth/otp/verify`… note: the mobile route passes only `otp`, so the exposure is the **web** `phone-otp` provider, which accepts `idToken`).
- **Current:** `if (!res.phoneNumber || res.phoneNumber === phone) verified = true;` — a *valid* Firebase ID token with **no** `phone_number` claim (anonymous, email/password, Google or custom-provider users of the same Firebase project) is treated as proof that the caller owns whatever `phoneNumber` they typed.
- **Expected:** the token must carry a `phone_number` claim that equals the claimed number (and `sign_in_provider === "phone"`), or the legacy path should be removed — the app already has WhatsApp OTP.
- **Impact:** an attacker mints a Firebase token (the web API key is public: `NEXT_PUBLIC_FIREBASE_API_KEY`) and signs in as any user, any tenant admin, or any super-admin who has a phone number. Also auto-creates workspaces. **Config-dependent:** exploitable if the Firebase project has *any* non-phone sign-in method enabled (anonymous/email/Google). Even if not, it is one config change from catastrophic.
- **Severity:** Critical.
- **Root cause:** `!res.phoneNumber ||` short-circuit written as "no phone in token = fine".
- **Fix:** require `res.phoneNumber && res.phoneNumber === phone` (normalise both to E.164 first); better, delete the Firebase branch and `firebaseTokenVerifier.ts`, plus `NEXT_PUBLIC_FIREBASE_*` if client SMS is retired. Also declare `jose` as a direct dependency (today it is imported but only present transitively via `next-auth`).
- **Files:** `src/lib/auth.ts`, `src/lib/auth/firebaseTokenVerifier.ts`, `package.json`.
- **DB/API/Frontend/Backend:** none / none / remove idToken UI path if any / auth only.
- **Tests:** unit — token without `phone_number` must be rejected; token whose number ≠ claimed number rejected; mock-token path never reachable when `NODE_ENV=production`.

##### C2 — `sendCampaignAction` sends WhatsApp to arbitrary leads (cross-tenant IDOR + role bypass)
- **Location:** `src/lib/actions/campaigns.ts:17`, `src/lib/messaging/whatsapp/service.ts:67`, UI `src/components/leads/LeadsTable.tsx:294`.
- **Current:** the action only calls `assertWritable()` (which only blocks read-only impersonation). It loops over client-supplied `leadIds` and calls `WhatsAppService.send({ leadId, body, userId })`. `send()` loads the lead by id **with no organization or ownership check**, looks up *that lead's* org mode, and sends through the platform's single Watxio account. On failure it also writes a note activity onto the lead — again with no check.
- **Expected:** `requirePermission("leads.edit")` + `filterAccessibleLeadIds(leadIds, ctx)` before sending (exactly what `bulkChangeLeadStatusAction` already does). `WhatsAppService.send` should take `organizationId` and refuse a mismatch.
- **Impact:** any signed-in user of *any* tenant — including a Viewer — who learns a lead UUID can send free-form 2000-char messages **to another tenant's lead from the shared platform number**, log them in the victim's timeline, and burn the platform's WhatsApp spend/reputation. UUIDs aren't guessable, but they leak through URLs, shared links, logs, exports, support tickets. Only BSP-mode tenants are affected (`whatsapp_mode` defaults to `personal`) — but that is exactly the tenants paying for it.
- **Severity:** Critical.
- **Root cause:** domain service trusts its caller; the action forgot the access helper that every sibling action uses.
- **Fix:** guard the action as above; add `organizationId` to `SendWhatsAppInput` and `where(and(eq(leads.id), eq(leads.organizationId)))`; same for `ActivityService.addActivity` call sites (it has no org parameter). Add a per-org/per-user send rate limit and daily cap.
- **Files:** `lib/actions/campaigns.ts`, `lib/messaging/whatsapp/service.ts`, `domains/activities/service.ts`, tests.
- **DB/API:** none / none. **Frontend:** hide the bulk-send control for roles without `leads.edit`. **Backend:** above.
- **Tests:** integration — org A user calls the action with org B's lead id → nothing sent, no row written; Viewer role → Forbidden; member only gets their own leads.

---

#### C. High Priority Issues

##### H1 — `leads.edit` (read-only "Viewer" role) is not enforced on most web write paths
- **Location:** `src/lib/leads/access.ts:45` (`getActionableLead`) and `:56` (`assertLeadAccess`) check *ownership*, never `leads.edit`. Actions that rely on them without `requirePermission("leads.edit")`: `sendWhatsAppAction`, `sendEmailAction`, `logLeadContactAction`, `logLeadReplyAction` (messaging.ts), `createFollowUp/updateFollowUp/complete/reopen/snooze/reschedule/assign/cancel` (follow-ups.ts), `uploadAttachmentAction/addAttachmentAction/deleteAttachmentAction`, `addTagAction/removeTagAction/bulkAddTagAction`, `createMeetingAction/updateMeetingAction/setMeetingOutcomeAction/reopen/checkIn/sendMeetingConfirmationAction`, `enrollLeadsAction`/pause/resume/stop, `createShareAction`, `deleteNoteAction`, `updateNoteAction`, `updateLeadFollowUpAction`, **`updateLeadStageAndValueAction`**, `draftLeadReplyAction`, `summarizeLeadAction`, `dismissAiSuggestionAction`, `runAgentAction` (agent tools call `createFollowUp`, `addTagAction`…).
- **Current:** only 17 call sites enforce `leads.edit`. `src/lib/permissions.ts` states "A read-only Viewer is any custom role created WITHOUT leads.edit; the backend actions now enforce that gate." The mobile API *does* enforce it (`canEditLeads`), so web and mobile disagree.
- **Expected:** one choke-point. Make `getActionableLead`/`assertLeadAccess` take a `{ write: true }` flag that also requires `leads.edit`, or add `requirePermission("leads.edit")` to every mutating action.
- **Impact:** a Viewer can message customers, change pipeline stage/deal value, attach/delete files, book meetings, and drive the AI agent. Privilege model is advisory on the web.
- **Severity:** High. **Root cause:** permission check lives in each action instead of in the shared access helper. **Files:** the actions above + `lib/leads/access.ts`. **API/DB:** none. **Frontend:** hide the buttons for Viewers (today only some are hidden). **Tests:** a table-driven test "for every mutating action, a role without `leads.edit` is refused" (generate the list from `lib/actions/*.ts`).

##### H2 — Email verification is never enforced → account pre-hijack through Google sign-in
- **Location:** `lib/actions/auth.ts:43` (`signupAction`), `lib/auth.ts` Google `signIn` callback (~line 253), `allowDangerousEmailAccountLinking` (`:177`).
- **Current:** anyone can register `victim@gmail.com` with their own password; no verification is required to use the app (`emailVerifiedAt` is only read to show a banner). When the real owner later clicks "Sign in with Google", the callback finds the existing row **by email** and signs them into the attacker's account; the attacker still holds the password.
- **Expected:** unverified password accounts must not be linkable by Google sign-in (or Google sign-in must *replace* the password hash/ invalidate sessions of an unverified account); also check `profile.email_verified === true` from Google.
- **Impact:** data the victim then enters is readable by the attacker. **Severity:** High. **Fix:** on Google link of a row where `emailVerifiedAt IS NULL`, reset `passwordHash` to a random hash and revoke sessions (`SessionService.revokeUserSessions`), or require verification before first login. Raise password minimum (currently 6) and add a breached-password check. **Files:** `lib/auth.ts`, `lib/actions/auth.ts`, `lib/auth/emailVerify.ts`. **Tests:** signup(A) → Google(A) must not land in the signup-created session.

##### H3 — Free plan upgrade path when Razorpay keys are absent
- **Location:** `lib/actions/billing.ts:71` (`setPlanManuallyAction`), `components/settings/BillingManager.tsx:110`.
- **Current:** any holder of `billing.manage` can set the plan to `unlimited` without payment whenever `isConfigured()` is false. `isConfigured()` is just "are the two env vars set in this process". A missing/typo'd env var on a prod deploy, a preview deploy pointed at the prod DB, or Railway worker env drift opens a free-upgrade path for every tenant admin.
- **Expected:** gate on an explicit `BILLING_TEST_MODE=1` plus `NODE_ENV !== "production"`, or remove from the tenant surface and keep it as a super-admin action (already exists: `setOrgPlanAction`).
- **Severity:** High (config-dependent revenue loss). **Fix:** as above. **Files:** `lib/actions/billing.ts`, `BillingManager.tsx`, `lib/billing/razorpay.ts`. **Tests:** with keys unset and `NODE_ENV=production` the action returns FORBIDDEN.

##### H4 — Usage limits are check-then-insert; concurrent requests bypass them
- **Location:** `domains/billing/planService.ts:121,132,~180` (`assertCanAddSeat`, `assertCanAddLead`, `assertCanAdd`), call sites in `domains/leads/service.ts:92`, `lib/leads/ingestion.ts:144`, `domains/invitations/service.ts:42,81`, `sourceService.ts:104`, `actions/automations.ts:38`, `sequenceService.ts:56`.
- **Current:** `SELECT count(*)` → compare → separate `INSERT`. No transaction, lock, or constraint. Two parallel requests (bulk API clients, webhook bursts, the 5-concurrent ingestion worker) each see `current < max`. The ingestion worker makes this realistic: free plan (300 leads) can be overshot by `concurrency` per burst.
- **Expected:** enforce atomically (advisory lock per org around count+insert, or `INSERT … SELECT … WHERE (SELECT count(*)…) < max`).
- **Severity:** High (billing correctness). Details and the rest of the metering gaps: **Section K**.

##### H5 — BullMQ *consumers* are created inside the web process (and so inside Vercel lambdas)
- **Location:** `lib/jobs/workers/ingestionWorker.ts:27` and `automationWorker.ts:25` call `new Worker(…)` **at module load**. They are imported by web code: `app/api/webhooks/[provider]/route.ts`, `lib/actions/csv.ts`, `domains/leads/iframePostMessageWorker.ts`, and `lib/events/handlers.ts` — which `instrumentation.ts:12` imports unconditionally (before the `if (!process.env.VERCEL)` guard that the comments claim keeps workers out of serverless).
- **Current:** every lambda cold start that touches a webhook, CSV upload or event handler becomes a queue consumer.
- **Impact:** lead-ingestion and automation jobs are taken by processes that get frozen/killed right after the HTTP response → stalled jobs, duplicate executions (stall re-delivery), double WhatsApp sends from automations, extra Redis connections per instance. The "droplet-only workers" design in the comments is not what the code does.
- **Severity:** High (reliability/duplicates). **Fix:** split each file into `queue.ts` (producer, safe to import anywhere) and `worker.ts` (consumer, imported only by `startWorkers`). **Tests:** `import` the web entrypoints under `VERCEL=1` and assert `Worker` is never constructed.

##### H6 — The migration set cannot build a fresh database
- **Location:** `drizzle/0018_device_tokens.sql` exists but is **not in `drizzle/meta/_journal.json`** (journal has 94 entries, disk has 95 `.sql`; prefix `0018` is duplicated). `0027_device_token_widen.sql` does `ALTER TABLE "device_tokens"`.
- **Current:** `drizzle-kit migrate` on an empty database never creates `device_tokens`, then fails at 0027. Static analysis only — I did not execute it. The CI job `migrations` ("Apply every migration to an empty database") should therefore be red; check its status. Additionally snapshots stop at `0087_snapshot.json` while the journal runs to 0093, so the next `db:generate` will re-emit changes already made by hand.
- **Impact:** new environments (staging, DR rebuild, new dev) cannot be created from the repo. Backups are `pg_restore` based so DR from backup is unaffected.
- **Severity:** High. **Fix:** add 0018_device_tokens to the journal in correct order (or fold into 0019), regenerate missing snapshots. **Tests:** CI "empty DB → migrate → schema diff = none" must fail on drift.

##### H7 — Documented production stack exposes Postgres and Redis to the internet without TLS
- **Location:** `deploy/docker-compose.yml` (ports 5432/6379 published; `?sslmode=disable`; password-only). The file itself calls this a `ponytail` shortcut.
- **Current vs expected:** `.env` shows the real deployment now uses Railway proxy hosts, but the repo still ships and documents the droplet topology, and `README`/`deploy/` do not say which is canonical. Railway TCP proxies are also public endpoints.
- **Impact:** if the compose stack is (or ever was) used: DB and queue credentials cross the internet in clear text; Redis compromise = arbitrary job injection (BullMQ executes jobs against production data).
- **Severity:** High (config-dependent). **Fix:** TLS on both, private networking or IP allow-list, delete the unused topology from the repo/docs. Confirm `DATABASE_URL`/`REDIS_URL` in production use TLS (`rediss://`, `sslmode=require`).

##### H8 — No MFA anywhere; super-admin is a single-factor "delete every tenant" account
- **Location:** `lib/actions/platform.ts` (e.g. `hardDeleteTenantAction`, `impersonateOrgAction`, `exportTenantDossierAction`, `toggleSuperAdminAction`), `lib/auth.ts`.
- **Current:** password (or Google, or a WhatsApp code) alone yields a session whose `isSuperAdmin` is re-read every 60 s. Impersonation is audit-logged and has a read-only mode (good), but there is no step-up/MFA, no IP allow-list, no session binding.
- **Severity:** High. **Fix:** TOTP/WebAuthn for super-admins at minimum (step-up before destructive platform actions), then offer it to all admins.

##### H9 — No bot/spam protection on public lead capture, so an attacker can exhaust any tenant's lead quota
- **Location:** `lib/actions/publicLead.ts`, `app/api/webhooks/[provider]/route.ts`, `lib/actions/booking.ts`.
- **Current:** per-IP (10/min) and per-source (200/min) limits only; IP is the leftmost `X-Forwarded-For` (spoofable off-Vercel, see M4). No CAPTCHA, honeypot, or per-org daily cap. Each accepted submission consumes a lead of the plan quota (Free = 300).
- **Impact:** a competitor floods a hosted-form URL (the sourceId is public by design) at ~200 leads/min; Free/Starter tenants hit their cap and legitimate leads are rejected; storage/notification/automation costs scale with the flood. Same for `webhookEvents` rows (no retention found for processed events).
- **Severity:** High. **Fix:** Turnstile/hCaptcha on hosted forms and booking, honeypot field, per-org hourly ceiling and "pause source" alert, retention job for `webhook_events`.

##### H10 — WhatsApp inbound webhook cannot resolve the tenant and the signature check is optional
- **Location:** `app/api/webhooks/whatsapp/route.ts:28`, `lib/messaging/whatsapp/service.ts:150`.
- **Current:** `recordInbound` matches by phone digits across **all tenants** (`organizationId` is never passed from the route) with `.limit(1)` and no ordering; includes soft-deleted leads. A phone that is a lead in two workspaces gets the reply, the AI intent-tagging and the "stop my sequence" side-effect applied to an arbitrary one. Signature verification is skipped when `WATXIO_APP_SECRET` is unset (the local `.env` doesn't define it; production unknown). No dedupe on `providerMessageId`; the `regexp_replace(...)` predicate can't use the phone index, so each inbound message scans every tenant's leads.
- **Impact:** wrong-tenant data attribution (privacy), forged inbound messages when the secret is unset, duplicate messages on provider retries, load. Prior audit flagged the same item as still open.
- **Severity:** High. **Fix:** resolve tenant from the *outbound* thread (`whatsapp_messages` by recipient + most recent outbound) or per-tenant numbers; fail closed in production when the secret is missing; unique index on `(provider_message_id)`; indexed normalised phone column.

##### H11 — "Private" attachments become public when `R2_PUBLIC_URL` is set
- **Location:** `app/api/attachments/[id]/route.ts:48`, `lib/storage/attachments.ts` (header comment: "Never public … Keep the bucket private").
- **Current:** after authenticating the viewer the route 302-redirects to `${R2_PUBLIC_URL}/${objectKey}`, so the object must be publicly readable, and the redirect target needs no auth, no `nosniff`, no sandbox CSP, and stays valid forever. `.env.local` sets `R2_PUBLIC_URL`. Keys are `attachments/<orgId>/<uuid>.<ext>` — unguessable but a leaked URL never expires, and tenant revocation (user removed, lead purged-but-CDN-cached) can't be enforced.
- **Severity:** High (config-dependent). **Fix:** remove the shortcut or use short-lived presigned GET URLs; keep bucket private.

##### (Also High) M-tier items promoted by blast radius
See **M1** (a `users.manage` holder can disable/delete workspace admins) and **M16** (AI agent has write tools driven by lead-controlled text).

---

#### D. Medium Priority Issues

| # | Issue | Location | Current → Expected | Impact | Fix | Tests |
|---|---|---|---|---|---|---|
| M1 | Privilege escalation inside a tenant | `lib/actions/users.ts` `setUserActiveAction/deleteUserAction/setUserRoleAction`; `domains/users/service.ts:235` | Any role with `users.manage` can deactivate, delete or demote *any* user incl. admins; only the *last* admin is protected → a "HR" role can lock out the owner and then re-role itself via roles it can assign | Account lock-out / takeover of the workspace | Compare target's granted permissions with the caller's (reuse `roleAssignmentError` logic on the target's role); owner flag | role matrix tests |
| M2 | Webhook idempotency key is global, not per tenant | `app/api/webhooks/[provider]/route.ts:136,170` unique on `(provider, idempotency_key)` | Tenant A can pre-claim keys that B's sender will use → B's lead silently dropped as "duplicate", and A learns `eventId` | Cross-tenant interference | scope uniqueness by `organizationId` (put org into the key / unique index) | two-tenant same-key test |
| M3 | Tenant scoping is optional in service signatures | `follow-ups/service.ts` (all methods `organizationId?`), `assignmentService`, `LeadService.assignLead/changeStatus`, `sourceService` | Omit the arg and the query silently becomes unscoped (e.g. `assignmentService.ts:~245` `whereCondition = organizationId ? … : eq(leads.id, leadId)`) | A future caller bug = cross-tenant write; there is **no RLS** as a backstop | make `organizationId` required; add Postgres RLS (`SET app.org_id`) as defence in depth | lint rule / type tests |
| M4 | Client-IP rate limits trust the leftmost `X-Forwarded-For` | `lib/clientIp.ts`, `lib/auth.ts` login, `actions/auth.ts` (signup/reset/OTP), webhooks use the *whole* header (`[provider]/route.ts:73`) | Spoofable unless the edge overwrites the header; inconsistent between files | Brute-force/OTP-cost/spam throttles can be dodged (login also has a per-email limit, which still holds) | one `clientIp()` honouring the platform's trusted header (`x-vercel-forwarded-for` / `cf-connecting-ip`), use it everywhere | unit |
| M5 | Public booking/OTP can email/WhatsApp arbitrary third parties | `actions/booking.ts`, `sendWhatsAppOtpAction` | no CAPTCHA, only per-slug (15/min) | spam relay & WhatsApp OTP cost drain | CAPTCHA + per-IP + per-destination limits | — |
| M6 | Web and mobile disagree on which leads a rep may see | web: owner **or** attends a meeting **or** has a follow-up (`lib/leads/access.ts`); v1: `app/api/v1/leads/route.ts:47` and `changesFeed` use `ownerId = me` only | A lead the user can open on web is missing from (or marked `gone` in) the phone | Data appears/disappears between clients | use `visibleToUserSql` in list + sync feed | parity test |
| M7 | `users.phone` has no unique constraint; phone ownership never verified when an admin adds a user | `db/schema/users.ts`; `UserService.create`; `authorizePhoneOtp` `.limit(1)` | duplicate phones possible (race); OTP login picks an arbitrary row; the check at `domains/users/service.ts` uses `'\D'` (JS template → `'D'`) instead of `'\\D'` so formatting differences defeat it | A tenant admin can register someone else's number and the real owner's OTP login lands in the admin's tenant | partial unique index on normalised phone; fix regex; require OTP when linking | race test |
| M8 | Unlimited sessions after password change | `actions/account.ts:changePasswordAction` | only *reset* revokes sessions | stolen session survives a password change | call `SessionService.revokeUserSessions` | — |
| M9 | Lead purge/hard delete is non-transactional and unbounded | `domains/leads/service.ts:746` | 9 sequential deletes + R2 deletes *before* the lead row; `inArray` of all ids (`emptyRecycleBin`, `purgeExpired` across all orgs → Postgres 65 535-parameter limit) | half-purged leads, orphaned/missing files, job fails once a tenant has ~30k deleted leads | wrap in tx, chunk by 1 000, delete files after commit | — |
| M10 | SSRF checks are assert-then-fetch (DNS-rebinding window) in two places | `leadWebhookEventService.ts:60`, `lib/actions/aiContext.ts:188`; `pinnedPost` exists but is used only by enrichment/SMTP; IPv6 blocklist omits `::ffff:7f00:1` hex form, `64:ff9b::/96`, `fec0::` | rebinding host can pass the check then hit an internal IP | SSRF to internal services/metadata | use `pinnedPost`-style connect-to-validated-IP everywhere; complete the IPv6 list | extend `ssrf.test.ts` |
| M11 | Razorpay webhook has no event-id dedupe and a thin event set | `domains/billing/service.ts:234` | relies on period comparison; `activate()` is also re-run on retries and calls `CouponService.redeem` each time (`:201`, error swallowed) → coupon redemption counted repeatedly; no `payment.failed`/refund handling; `activate` accepts a subscription with **no** `notes.organizationId` (`:160`) | double coupon burn, missed dunning | persist processed `x-razorpay-event-id`; require the org note | replay test |
| M12 | Automations: create button visible to all; `toggle` not plan/feature-gated; free-form action `type` and `config` | `automations/page.tsx`, `actions/automations.ts:~150`, `automationSchema` | a downgraded tenant can re-enable automations (only `runnableIds` caps execution); unknown action types stored | confusing 'Forbidden' for viewers, config injection | gate UI by permission; allow-list action types via `lib/automation/schema.ts` | — |
| M13 | Unindexed substring search | `leadSearchCondition` (`ILIKE '%q%'`); `searchUniversalAction` (unescaped `%`/`_`) | seq-scan within a tenant; wildcards not escaped | slow on 100k+ leads | `pg_trgm` GIN index; escape LIKE metacharacters | — |
| M14 | Two CSV import implementations | `components/leads/ImportCsvDialog.tsx`→`actions/csv.ts` (1 MB/5 000 rows, via ingestion queue, per-lead limit check in worker → silent failures) vs wizard → `domains/leads/importService.ts` | inconsistent limits/dup-detection/audit; legacy path can't report plan-limit failures | remove legacy dialog, add audit entry + progress for large files | import e2e |
| M15 | API keys: no expiry, no scopes below read/write, no per-key rate-limit setting, created-by user removal doesn't revoke | `domains/apiKeys/service.ts`, `lib/apiAuth.ts` | long-lived full-access bearer tokens; 600 req/min fixed | leaked key = persistent access | optional expiry, per-key scope list, auto-revoke with creator, plan gating | — |
| M16 | AI agent: write tools driven by untrusted lead text | `lib/ai/agent.ts` (change status, assign, tag, reminders, meetings) | only the system prompt says "ONLY when the user asks"; lead notes/messages are in context | a hostile lead message can induce reassignments/status changes (reversible but noisy) | human-confirm step for writes (like `propose_message`), per-run write cap, log tool calls | adversarial prompt tests |
| M17 | Audit-log gaps | `AuditService.log` is best-effort and called from ~28 files | not audited: lead create/update/assign/status/bulk assign, CSV import, source create/update/delete/FB connect, webhook endpoint create/delete/toggle, API-key revoke/delete, distribution rules, tenant integrations (CAPI/enrichment), custom statuses, logout, failed login, role *permissions* diffs | weak forensics | add a `withAudit` wrapper to mutating actions; store before/after for settings | — |
| M18 | Maintenance mode is only enforced in the dashboard layout | `app/(dashboard)/layout.tsx:44` | server actions, `/api/v1`, webhooks and public forms keep running | writes during maintenance | check in `authorizeApiRequest`, `requireOrg`, ingestion | — |
| M19 | DB pool sized for long-lived servers, not Fluid/serverless | `db/index.ts:28` (`max: 20`, prepared statements on) | N lambda instances × 20 connections against a Railway Postgres; `prepare: true` breaks behind a transaction-mode pooler | connection exhaustion under load | lower `max` on Vercel, add pgbouncer/Hyperdrive, set `prepare:false` if pooled | load test |
| M20 | Same key encrypts everything and signs JWTs | `lib/crypto/secret.ts` falls back to `NEXTAUTH_SECRET`; SHA-256, no KDF/versioning | rotating one secret bricks SMTP creds/Meta tokens/webhook secrets and logs everyone out; no key id in ciphertext | operational risk | require `EMAIL_SECRET_KEY` in prod (validateEnv), add key version prefix | rotation test |
| M21 | Worker has no graceful shutdown / health | `src/worker.ts:24` `process.exit(0)` on SIGTERM; `numReplicas: 1`; `/api/health` doesn't check workers/queue depth | in-flight jobs aborted; invisible worker death | duplicate/lost jobs on deploy | `worker.close()` on signal; queue-depth + last-heartbeat on health | — |

---

#### E. Low Priority Issues

| # | Issue | Location | Fix |
|---|---|---|---|
| L1 | README is the create-next-app boilerplate | `README.md` | write a real one (Section P) |
| L2 | `/api/health` creates a new Redis client per call and leaks it if `ping` throws before `disconnect()` | `app/api/health/route.ts` | reuse client / `finally` |
| L3 | Negative `limit` → `.limit(-5)` → SQL error 500 | `app/api/v1/leads/route.ts:20` (and similar) | clamp `Math.max(1, …)` |
| L4 | Dev-login defaults (`admin@acme.com` / `password123`) compiled into the login bundle, guarded only by `NODE_ENV==="development"`; seed script writes that user; `.env` DB points at a Railway proxy host so `db:seed` from a laptop would seed that DB | `app/(auth)/login/page.tsx:25`, `db/seed.ts` | refuse seeding unless host is local; drop client-side defaults |
| L5 | Webhook sources with a NULL/legacy secret accept unauthenticated posts | `[provider]/route.ts:107` (`if (secret)`) | backfill secrets, then require |
| L6 | `unsubscribe` token has no expiry and shares `NEXTAUTH_SECRET` | `lib/mail/unsubscribe.ts:20` | purpose-derived key (already done for mobile codes) |
| L7 | No confirmation dialog on: delete attachment, delete template, delete custom status, **merge duplicates (hard delete)** | `LeadAttachmentsTab`, `TemplatesManager`, `StatusManagementModal`, `DuplicatesManager` | use `ui/confirm-dialog` |
| L8 | Misleading error message: UI `catch` shows "We couldn't reach the server" when the action actually threw `Forbidden` (`requirePermission` is called outside the action's try/catch in most actions) | e.g. `LeadsTable.tsx:300` | make `requirePermission` failures return `fail("FORBIDDEN")` consistently |
| L9 | Hard-coded fallback verify token | `webhooks/facebook/route.ts:21` | require env |
| L10 | `revalidatePath("/templates")` points at a route that doesn't exist (it's `/settings/templates`) | `lib/actions/messaging.ts` | fix path |
| L11 | Unused dependencies `@anthropic-ai/sdk`, `zustand`; `ANTHROPIC_API_KEY` still in `.env.example`; stale "Stripe" comment | `package.json`, `.env.example`, `planService.ts:7` | remove |
| L12 | Default AI model `inclusionai/ling-3.1-flash` is used for **tool-calling** and processes lead PII via the AI Gateway | `lib/ai/agent.ts:44`, `.env` | pick a tool-capable model; confirm gateway ZDR/DPA; list sub-processors in the privacy page |
| L13 | Public shared-link view counter is bumped by link previews/bots (false "read receipts") | `contentSharingService.openPage` | ignore known bot UAs / HEAD |
| L14 | Signup distinguishes "email already registered" (user enumeration) | `actions/auth.ts:~96` | acceptable trade-off; document |
| L15 | CI uses Node 20 while the worker image uses Node 22; E2E suite exists but is never run in CI; no `npm audit`/secret-scan step | `.github/workflows/ci.yml` | align, add |
| L16 | `timestamp` columns are all `without time zone` with custom UTC parse/serialise; works but any raw SQL with `now()` in a non-UTC session would silently skew | `db/index.ts`, schema | consider `timestamptz` long-term |

---

#### F. Incomplete Features
- **Outbound webhook DLQ** — backend list/retry/purge exist; tenants have no UI to see or retry failed deliveries.
- **Legacy CSV dialog** coexists with the new import wizard.
- **`bulkUpdateLeadStatusAction`** (customStatuses.ts) duplicates `bulkChangeLeadStatusAction` and is never called.
- **WhatsApp inbound** works only for a single-tenant world (H10).
- **Per-tenant WhatsApp credentials** — one platform Watxio account serves all tenants.
- **Multi-workspace membership** — `users.email` is globally unique and one org per user.
- **Calls** — only mobile sync, no web surface.
- **Contacts/Companies/Customers** as separate entities (everything is a lead).
- **Refunds / failed-payment events** from Razorpay are not reconciled beyond halted/cancelled.

#### G. Missing Frontend
- DLQ management screen (above).
- Permission-aware hiding: Automations "Create", bulk WhatsApp control, Viewer-only states on lead actions.
- Confirmations (L7).
- Usage/limit indicators for sources, automations, sequences, storage, messages (only seats/leads/AI credits are surfaced).
- Export-permission UI; progress UI for large imports/exports.
- No dedicated React Query/Zustand layer despite docs mentioning it: data flows via server components + `router.refresh()`; there is no client cache, optimistic-update or rollback mechanism to audit. Several screens (`DuplicatesManager`) do optimistic local updates after success only, which is safe.

#### H. Missing Backend
- Atomic limit enforcement (H4); message/storage/export/import/API metering (K).
- Webhook event ledger for Razorpay; tenant-aware WhatsApp inbound.
- MFA / step-up auth; email-verification gate; API-key expiry/scopes.
- Central audit wrapper; retention for `webhook_events`, `automation_runs` (exists), `api_idempotency_keys` (exists).
- Maintenance-mode enforcement outside the layout.
- Per-user/per-org send rate limits for WhatsApp and email.
- Postgres RLS.

#### I. Missing Business Logic
- `leads.edit` gate on web write paths (H1); `users.manage` target-privilege check (M1).
- Downgrade handling: automations/sequences are *paused* via `runnableIds`; **sources, seats and leads over the new cap are not** (a downgraded tenant keeps all of them and can keep ingesting up to the existing count).
- AI credits reset on the **UTC calendar month** (`currentPeriod`), not on the subscription's billing period — a customer who subscribes on the 20th gets a reset 10 days later.
- Restored leads re-check the lead cap (good), but bulk restore/purge-undo paths and *merge* don't re-count.
- Two sources of truth for "who can see a lead" (M6) and for "what is an admin": `isAdmin()` = role name `admin`, `canSeeAll` = `settings.manage`, last-admin check = `users.manage`/`*`.
- `PlanService.plan()` swallows every DB error and returns `"free"` — a transient DB error silently downgrades a paying tenant's limits for that request (fail-closed but invisible; also hides outages).

#### J. Tenant Isolation Findings
Verified safe (spot-checked end-to-end): automations CRUD, sequences update, DLQ retry, custom-field update, follow-up delete, tags, attachments (web + v1 + mobile signed link), imports (owner/source/team re-validated), API-key revoke/delete, API v1 lead routes (`leadForApi`), notifications (scoped by `userId`), idempotency (scoped by org), webhook ingestion (`organizationId` from the source row, never from payload), Facebook ingestion (fans out per org), missed-call webhook (org mandatory), Razorpay webhook (org from stored subscription id), impersonation (super-admin only, cookie ignored otherwise).

Findings:
1. **C2** cross-tenant WhatsApp send + timeline write by lead id.
2. **H10** inbound WhatsApp matched across all tenants.
3. **M2** global webhook idempotency namespace.
4. **M3** optional `organizationId` parameters (+ no RLS) — latent.
5. `ActivityService.addActivity` and `WhatsAppService.listForLead` take only a `leadId`; safe today only because every caller pre-validates.
6. Many id-keyed `update/delete` statements have no org predicate (≈100 flagged by script); I traced the high-risk ones and found a prior scoped lookup each time, but the *pattern* is the risk (see M3).
7. Tenant columns that are nullable "backfilled": `users.organization_id`, `teams.organization_id`, `lead_sources.organization_id`; `assignment_rules` has no tenant column at all.
8. **Config-dependent:** public R2 bucket (H11).
9. Missed-call and WhatsApp share one platform-wide provider account, so *provider-side* isolation (number, templates, quality rating) is shared across tenants.

#### K. Usage Limit Findings
Enforced (backend): seats (users+open invites), leads (incl. import batch, restore, ingestion, API), automations, sequences, sources, AI credits. Enforced in the right layer (service), not just the UI.

Problems:
1. **Race conditions (H4)** — all of the above are count-then-insert.
2. **Not metered at all:** WhatsApp/email messages (drips, automations, campaigns, OTP), storage/attachments (25 MB per file, unlimited count), exports, imports (per batch only), API requests (600/min flat, no monthly quota), meetings, outbound webhooks, API keys, saved views, custom fields, custom statuses, teams, enrichment calls, notifications.
3. **Billing period:** AI credits use UTC calendar month, not the subscription period (I).
4. **Downgrade:** only automations/sequences are paused; seats/sources/leads over cap persist (I).
5. **Failure refunds:** credits are refunded on failure in `leadAssist`, `aiContext` and `ai.ts`; the one consumer I found with no refund path is `lib/actions/agent.ts:25` (a failed or fallback agent turn still costs a credit).
6. **Seat counting:** includes deactivated (not deleted) users, and open invites; consistent, but `seat_overrides` (platform config) can silently differ from `PLAN_LIMITS` shown in the UI.
7. **Frontend vs backend:** UI shows seats/leads/AI only; the backend enforces sources/automations/sequences too, so users hit errors without a meter. (The reverse — a frontend-only limit — was **not** found.)
8. `plan()` returns `"free"` on DB errors (I).
9. Direct API: `POST /api/v1/leads` does enforce the lead cap; API-key requests are not plan-gated at all (a Free tenant gets full API).

#### L. API and Integration Findings
- **Razorpay:** signature verified with raw body, constant-time; stale-event drop is good. Gaps: M11, no event-id ledger, no refund/payment-failed events, `setPlanManuallyAction` fallback (H3).
- **Facebook Lead Ads:** signature mandatory in production, per-org fan-out, token refresh service, "needs reconnect" flow, replay of auth-failed events — solid. Tokens are read through `readSecret` which tolerates legacy plaintext; run `encrypt:source-secrets` and then make `readSecret` strict.
- **Google Calendar:** OAuth `state` is HMAC-bound to the user (verified in callback); tokens encrypted; disconnect deletes credentials. Refresh failures are swallowed in places — not traced end-to-end.
- **Generic webhook/hosted form:** secret via `?key=` (ends up in access logs) or HMAC; idempotency per (provider,key) (M2); no payload size cap (App Router reads the whole body); events stored with full PII and no retention found.
- **WhatsApp (Watxio):** H10, C2; single shared account; `X-Idempotency-Key` used on sends (good); no timeout on `fetch` in `client.ts` (a hung provider ties up the lambda/worker); response not schema-validated.
- **Outbound webhooks:** HMAC signing, retries, SSRF guard, DLQ — good; M10.
- **AI Gateway:** no `AbortSignal`/timeout verified on `generateText`; model hard-coded fallback.
- **Resend/SMTP:** tenant SMTP is SSRF-pinned (good).
- **External responses are mostly cast, not validated** (`as any`, `res.json() as T`) — Razorpay, Graph, Watxio, Google.
- **OAuth lifecycle matrix** (connect → store → refresh → disconnect → reconnect → delete): complete for Facebook and Google; Meta CAPI/enrichment tokens are per-tenant encrypted with disconnect actions; no dangling-credential cleanup on user deletion for `google_credentials` outside tenant hard-delete.

#### M. Database Findings
- **H6** migration journal gap; snapshots stop at 0087.
- Tenant-key columns nullable/backfilled: `users`, `teams`, `lead_sources`; none on `activities`, `follow_ups`, `reminders`, `whatsapp_messages`, `assignment_rules`, `automation_*` children → every access needs a join; RLS impossible without adding them.
- `users.phone` not unique (M7); `users.email` global unique (design limit).
- `leads(email)` unique index is case-sensitive while dedupe matches `lower(email)` → `A@x.com` and `a@x.com` can coexist.
- Missing/unsuitable indexes: normalised phone (`regexp_replace` in inbound webhook and login — seq scans), trigram for search, `webhook_events(status, created_at)` for the pending sweeper (not verified), `whatsapp_messages.provider_message_id` unique.
- Inconsistent types: `lead_sources.is_active` is integer while others are boolean; `organizations.cancel_at_period_end`, `complimentary` are integers.
- FK cascade design is mixed: some tables cascade on lead delete, others (`activities`, `follow_ups`, `lead_attachments`, `notifications`, `whatsapp_messages`, `lead_status_history`) don't, which is why `hardDeleteLeads` hand-deletes (M9).
- `timestamp` without TZ throughout (L16).
- 63 of 95 migrations lack `IF [NOT] EXISTS` guards (fine for ordered migrate, bad for the `db:baseline` workflow they also support).
- Pool/prepared-statement settings vs serverless (M19).
- Audit table `audit_logs` has no retention/archival and no append-only protection.
- Seed script creates a deterministic admin with `password123`.

#### N. Performance Findings (top expensive operations)
1. **Insights page:** ~20 analytics services (`revenueForecast`, `winLoss`, `pipelineAging`, `ltv`, `cohort`, `geo`, `teamPerformance`, `sourceRoi`, `qualificationMatrix`, `engagementHealth/Velocity`, `stageStagnation`, …) each load every lead (and for velocity, every activity/status-history row) of the tenant into Node and aggregate in JS. A shared `tenantLeads` fetch and a cached snapshot soften it, but the Unlimited plan has **no lead cap**. Move to SQL aggregation / materialised daily rollups.
2. **WhatsApp inbound / phone login:** `regexp_replace(phone)` predicate = full scan (cross-tenant for inbound).
3. **Lead search:** unindexed `ILIKE '%…%'` (M13).
4. **Mobile sync feed:** reads `pg_stat_activity` in every call to compute a horizon (`v1/leads/route.ts`), needs superuser-ish visibility and is slow on busy DBs.
5. **Bulk status change** loops per lead (N+1) up to `MAX_BULK`; `bulkAssign`, CSV export of 10 000 rows run in one request.
6. **Hard purge / `purgeExpired`:** unbounded IN lists (M9).
7. **Per-request layout cost:** the dashboard layout runs ~8 queries per render and again on every `router.refresh()`; `requireOrg` adds an org-suspension read per call (memoised per request).
8. **Connection pool/prepared statements** (M19).
9. **Duplicate work in serverless:** consumers per lambda (H5).
10. 37 `console.log/debug` calls outside scripts; 217 `any` casts; 118 `.catch(() => {})` swallow patterns (some intentional).
- Caching: 17 uses of `unstable_cache`/tags; per-process role cache (15 s) and user cache (60 s) with a Redis mirror — OK, but "evict on role change" only clears the instance that handled the change (other instances up to 60 s stale).
- Pagination: list screens and API v1 are paginated; exports capped at 10 000; some admin/DLQ lists use hard `limit(500)` without paging.

#### O. Security Findings
Strengths: passwords bcrypt; JWT sessions re-checked against DB every 60 s with revoke support; suspended orgs locked out; HMAC-verified Razorpay/Facebook/Meta webhooks; constant-time compares; SSRF guard + pinned connect for tenant SMTP/enrichment; attachment allow-list + sandbox CSP + `nosniff`; formula-safe CSV; open-redirect checks on `callbackUrl`; no `dangerouslySetInnerHTML`; `.env*` ignored and absent from git history; no secrets found in tracked files (scan covered common key patterns and PEM headers); source maps/DB query debug logging disabled in production; rate limiting with Redis and in-memory fallback.

Findings (cross-referenced): **C1, C2, H1, H2, H3, H7, H8, H9, H10, H11**, M1, M2, M4, M5, M7, M8, M10, M16, M20, L4–L6, L9, L13. Additional:
- **Security headers:** `nosniff`, HSTS, Referrer-Policy, frame-ancestors present; **no CSP `script-src`** (only `frame-ancestors`) and no CSRF token beyond Next's built-in Origin check for server actions; `serverActions.bodySizeLimit: "25mb"` applies to every action (DoS surface) while per-action limits vary.
- **CORS:** no CORS config for `/api/v1` (fine for native/server clients; browser integrations won't work).
- **Cookies:** NextAuth defaults; `NEXTAUTH_URL` must be https in prod for `Secure` cookies — not validated by `validateEnv`.
- **Mobile JWT:** HS256, 30-day, revocation by jti, live role re-read — good; refresh endpoint re-issues for any valid token (no rotation/replay detection).
- **Account enumeration:** signup (L14); login is generic.
- **File upload:** extension-only type check (no magic-byte sniff), entire file buffered in memory, `zip`/`mp4` allowed.
- **Secret handling:** SMTP/Meta/webhook secrets encrypted at rest (AES-GCM); the reveal action is audited (good); key hygiene M20.
- **Local dev points at a Railway proxy DB** (`.env`): a developer machine has a production-grade credential; confirm it is a dev database.

#### P. Documentation Findings
- `README.md`: unmodified create-next-app text; no setup, env, architecture, deploy or runbook.
- `docs/` (≈9.8k lines) and `docs-consolidated/` (≈12.2k lines) **duplicate each other** — guaranteed drift. No single source of truth.
- Five docs describe React Query/Zustand-style client state; the code has neither (Server Components + actions). `zustand` is a dependency but unused.
- Two incompatible deployment stories: DigitalOcean droplet + docker-compose (`deploy/docker-compose.yml`, `instrumentation.ts` comments) vs Railway worker + Vercel (`railway.json`, `deploy/railway-setup.md`, `.env`). `railway.json` builds `Dockerfile.worker` only; the web deployment config isn't in the repo.
- `.env.example` lacks ~40 variables the code reads (`AI_GATEWAY_API_KEY`, `AI_MODEL`, `AI_AGENT_MODEL`, `R2_*`, `META_CAPI_*`, `GST_SUPPLIER_*`, `MAIL_DOMAIN`, `WATXIO_OTP_TEMPLATE`, `RAZORPAY_PLAN_PRO/BUSINESS`, `FIREBASE_SERVICE_ACCOUNT`, `WORDPRESS_ORIGIN`, …) and still lists `ANTHROPIC_API_KEY`. `validateEnv` requires only `DATABASE_URL` and `NEXTAUTH_SECRET`.
- No OpenAPI/API reference for `/api/v1` beyond `docs/SETTINGS_API_ACCESS.md`; no webhook payload reference for outbound events beyond the settings doc; no DB/ER documentation; no incident/backup-restore runbook beyond `railway-setup.md`.
- Docs and code disagree on permissions ("backend actions now enforce [leads.edit]", H1) and on workers ("droplet only", H5).
- Prior audit files record status updates but not the current state of items still open (WhatsApp inbound, pooler).

#### Q. Testing Gaps
Present and good: auth, rate-limit, idempotency, billing (8 files), SSRF, signature verifiers, leads domain (57 files), webhook route tests (generic, Facebook, Google), v1 lead/meeting routes.

Missing or thin (priority order):
1. **Authorization matrix test** — every server action × role (admin, member, Viewer, other-tenant user, super-admin read-only). Would have caught C2 and H1.
2. **Tenant isolation tests** — `e2e/tenant-isolation.spec.ts` is 22 lines and only checks a list renders. Need API-level A-vs-B tests for each id-taking route and action (incl. campaigns, WhatsApp inbound, attachments).
3. **Usage-limit concurrency tests** (parallel inserts at cap) and downgrade tests.
4. **WhatsApp**: inbound routing, status ordering, signature-missing behaviour; Razorpay replay/out-of-order events and coupon double-redeem.
5. **Fresh-DB migration + schema-drift test** (H6); CI result for the `migrations` job.
6. **Worker bootstrap test** that web entrypoints don't construct consumers (H5).
7. Action files with **no test file**: agent, aiContext, apiKeys, attachments, audit, automations, billing, booking, campaigns, csv, customFields, dedup, exportLeads, follow-ups, import, integrations, invitations, leadDistribution, meetings, notifications, organizations, platform (partial), publicLead, roles, savedViews, sequences, sharedContent, sources, staleLeads, support, tags, teams, users. Domains with none: activities, invitations, savedViews, teams.
8. E2E suite exists (10 specs) but is **not executed in CI** and runs against `npm run dev`.
9. Super-admin impersonation/read-only and account-takeover scenarios (C1, H2) beyond unit mocks.

---

#### R. Recommended Fix Order

**Phase 0 — same day (small, high blast radius)**
1. C1 — require `phone_number` match; plan removal of Firebase fallback.
2. C2 — guard `sendCampaignAction`; org-check in `WhatsAppService.send`.
3. H3 — gate manual plan switch on a non-prod flag.
4. Confirm in production: `WATXIO_APP_SECRET`, `FACEBOOK_APP_SECRET`, `MISSED_CALL_WEBHOOK_SECRET`, `R2_PUBLIC_URL` unset, Firebase providers, Postgres/Redis TLS, `DATABASE_URL` for local dev.

**Phase 1 — this week**
4. H1 — enforce `leads.edit` inside the shared access helper; add the role-matrix test.
5. H5 — split queue/worker modules.
6. H6 — fix the migration journal; make CI migrations job a required check.
7. H2 — verify-before-link; revoke on Google link; raise password policy.
8. H10 — tenant-aware WhatsApp inbound; fail closed without signature secret; unique provider id.
9. H11 — presigned URLs or private-only.
10. M1 — target-privilege check for user management.

**Phase 2 — next 2 weeks**
11. H4/K — atomic limit enforcement; message/storage/API metering; downgrade handling; billing-period AI credits.
12. H8 — super-admin MFA/step-up.
13. H9/M5 — CAPTCHA, per-org ceilings, retention for `webhook_events`.
14. M2, M3 (make `organizationId` required; plan RLS), M4 (one trusted-IP helper), M6, M7, M8, M11.
15. H7 — retire/secure the compose topology; env validation expansion; `.env.example` complete.

**Phase 3 — hardening and hygiene**
16. M9, M10, M12–M21; L-items; N (SQL aggregation for insights, trigram search, phone index, pool tuning); audit wrapper (M17); DLQ UI; remove duplicate import path.
17. Documentation consolidation (P) and CI additions (E2E, audit, secret scan, Node version parity).
18. The testing gaps in Q, prioritising 1–3.

# Audits & Reviews

Web app audit and the pre-marketing audit (point-in-time findings).

> Consolidated from 2 source file(s). Content is verbatim; headings are nested two levels deeper under each section. Edit the original files if they still exist, then regenerate.

## Contents

1. [Ridhzo Web App — Data Loading, Performance & Sync Audit (2026-09-28)](#1-ridhzo-web-app--data-loading-performance--sync-audit-2026-09-28) — `docs/WEB_APP_AUDIT_2026-09-28.md`
2. [Ridhzo — Pre-Marketing Product Audit (2026-10-01)](#2-ridhzo--pre-marketing-product-audit-2026-10-01) — `docs/PRE_MARKETING_AUDIT_2026-10-01.md`

---

## 1. Ridhzo Web App — Data Loading, Performance & Sync Audit (2026-09-28)

> Source: `docs/WEB_APP_AUDIT_2026-09-28.md`

### Ridhzo Web App — Data Loading, Performance & Sync Audit (2026-09-28)

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

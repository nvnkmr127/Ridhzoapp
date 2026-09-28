# Ridhzo Web App — Data Loading, Performance & Sync Audit (2026-09-28)

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

## Fix status (2026-09-28, same day)

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

## Measurements (local DB, ~0 ms network; production adds one DB round-trip per sequential query wave)

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

## Critical

### C1 · Hot Leads page renders every open lead and pins the server CPU
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

## High

### H1 · Smart Segments load the whole workspace on every `/leads` visit, and their counts are wrong for reps
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

### H2 · List → detail break: follow-up assignees can list a lead but can't open it
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

### H3 · The leads list never refreshes on its own (placeholder component)
- **File:** `src/components/leads/LeadsAutoRefresh.tsx`. It returns `null`, with the comment "will be implemented in a subsequent phase".
- **Current:**
  - Leads from Facebook, webhooks, the phone app or teammates don't appear until a manual reload.
  - The one exception: the bell's unread count rises, which triggers a full-page refresh.
- **Expected:** new or changed leads appear within ~30 s without a full re-render.
- **Fix:**
  - Add a server action returning a cheap change token: `max(sync_at)` and a count for the org, owner-scoped for reps. The `leads_org_sync_idx` index already exists.
  - Poll it while the tab is visible and call `router.refresh()` only when it changes. `LiveNextBestAction` already does this for a single lead.
- **Impact:** stale data on the main screen, and a web ↔ mobile sync gap.

### H4 · `pageSize` is not clamped
- **Files:**
  - `src/app/(dashboard)/leads/page.tsx:40`
  - `src/domains/leads/service.ts:442`: `Math.max(options.limit || 50, 1)`. No upper bound.
- **Measured:** `?pageSize=5000` took 3.3 s and returned 31 MB. `?pageSize=100000` would load the whole tenant.
- **Fix:** allow only 20, 50 or 100. Clamp in `listLeads`, because the kanban board and `listStageLeadsAction` also call it.

### H5 · Insights loads the entire tenant into Node and aggregates in JS
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

### H6 · Executive dashboard SLA card loads every lead and ignores the dashboard filters
- **File:** `src/domains/leads/slaAnalyticsService.ts:31-41`, called from `src/app/(dashboard)/page.tsx:62`.
- **Current:**
  - A full-tenant `SELECT` feeds a JS loop.
  - The card ignores `range`, `ownerId` and `teamId`, so it disagrees with the charts next to it.
- **Fix:** one aggregate query built from `AnalyticsService.buildLeadConditions(filters)`. `getLeadMetrics` already has the right SQL shape.

### H7 · Web offline queue can duplicate leads or silently drop them
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

### H8 · Duplicates page scans the whole tenant, includes recycle-bin leads, and bypasses owner isolation
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

### H9 · Phone sync feed can permanently miss a change
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

## Medium

### M1 · Notification panel: mark-all-read, whole-page re-render, misleading empty state
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

### M2 · Bell polling causes full-page refreshes and runs once per tab
- **File:** `NotificationBell.tsx:28-56`
- **Current:**
  - Any rise in unread count calls `router.refresh()`, which re-runs the layout (~12 statements) and the whole page.
  - Admins get a `new_lead` notification per lead, so a busy workspace re-renders every 30 s.
  - Every tab runs its own poller.
- **Fix:**
  - Once H3 exists, refresh only when the relevant change token moves.
  - Share one poller across tabs via `BroadcastChannel` or a leader tab.

### M3 · Dashboard layout runs ~8 sequential awaits on every render
- **File:** `src/app/(dashboard)/layout.tsx:31-72`
- **Current:**
  - The chain: `isSuperAdmin` → `requireOrg` → maintenance → billing → usage → permissions → org format → `me`.
  - About 12 statements, mostly independent.
  - It re-runs on every `router.refresh()` (60 call sites) and every `revalidatePath` that hits the current page.
  - Against the remote DB (~300 ms round-trip per the code comments), the sequence alone costs seconds.
- **Fix:** one `Promise.all` after `requireOrg`.

### M4 · Search: phone-digit search can't use its index, and the two search boxes disagree
- **Files:**
  - `src/domains/leads/service.ts:454-472`: `regexp_replace(phone…) ILIKE` defeats `leads_phone_trgm_idx`. It measured a 29 ms filtered scan at 100k rows and grows linearly.
  - `src/lib/actions/search.ts:43-52`: the command palette uses raw `ILIKE` on phone. "98765 43210" finds the lead on `/leads` but not in ⌘K.
  - Two-character queries are allowed, but trigram indexes need three characters.
- **Fix:**
  - Add a generated `phone_digits` column with a trigram index.
  - Share one search-condition builder between `listLeads`, ⌘K and `/api/v1/leads`.
  - Require at least 3 characters.

### M5 · Unstable pagination, and the default sort never applies
- **Files:**
  - `src/domains/leads/service.ts:512-532`
  - `src/app/(dashboard)/leads/page.tsx:35`
- **Current:**
  - Sorting by name, status, owner, priority, score or next follow-up has no `id` tiebreaker. With offset paging, rows repeat or vanish between pages.
  - The page always passes `sortField="createdAt"`, so the documented "unworked `new` first" default never runs.
- **Fix:**
  - Append `id` to every `ORDER BY`.
  - Pass `undefined` when there's no `?sort`.

### M6 · Leads list fetches more than the table needs
- **File:** `src/domains/leads/service.ts:539-540`
- **Current:**
  - `SELECT *` returns the full `custom_data` blob, including `_aiRecap` and `_scoreFactors`, for rows that show a few columns.
  - The page also runs a separate `count(*)` over the filtered tenant on every navigation.
- **Fix:**
  - Select only the table columns plus the visible custom keys.
  - For large tenants, use an estimated count or "more than N" beyond the first pages.

### M7 · Lead detail: unbounded timelines and a sequential tail
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

### M8 · Follow-ups page silently truncates at 500 rows
- **File:** `src/app/(dashboard)/follow-ups/page.tsx:18, 58-66`
- **Measured:**
  - A member with 2,498 pending follow-ups saw 500, while the counters said 2,498. There's no pager.
  - The page took 1.5 s and 3.4 MB.
- **Fix:** paginate each section (overdue, today, later) with a cursor on `(due_at, id)`.

### M9 · Going-cold page renders every stale lead
- **File:** `src/app/(dashboard)/leads/cold/page.tsx:29-33`
- **Current:** the same failure mode as C1, with no limit.
- **Fix:** paginate, and do the query and sort in SQL.

### M10 · Rep sync feed scans the whole workspace and returns other reps' lead ids
- **File:** `src/app/api/v1/leads/route.ts:113-119`
- **Current:**
  - For non-admins the SQL has no owner filter.
  - Every lead in the org is paged through, and other reps' leads come back as `{id, updatedAt, gone:true}` stubs.
  - A rep's first sync in a 100k-lead workspace pages through all 100k leads.
- **Fix:**
  - Filter by owner in SQL.
  - Emit "gone" only for leads the rep lost. Log reassignments, or compare against the ids the client sends.

### M11 · Access rules drift between surfaces
- **File:** `src/lib/leads/access.ts`
- **Current:**
  - `filterAccessibleLeadIds` omits meeting attendees, so their bulk actions silently drop leads.
  - The list and ⌘K omit meeting-attendee leads, but the detail page allows them.
- **Fix:** the same single predicate as in H2.

### M12 · Notification emails interpolate unescaped lead data into HTML
- **File:** `src/domains/notifications/service.ts:83-88`
- **Current:** the title and body contain a lead name, phone or email from public forms and webhooks, and they're inserted raw into `html`.
- **Fix:** HTML-escape them.

### M13 · OTP and email fail open in production
- **Files:**
  - `src/lib/actions/auth.ts:279-284`
  - `src/lib/mail/mailer.ts:28-31`
- **Current:** when WATXIO or Resend isn't configured, OTP codes and email bodies (including reset links) go to stdout, and the action reports success.
- **Fix:** throw when `NODE_ENV === "production"`.

### M14 · `/favicon.ico` returns 500 on every request
- **Files:** both `src/app/favicon.ico` and `public/favicon.ico` exist.
- **Current:** the server logs "conflicting public file and page file" on each request.
- **Fix:** delete one of the two files.

### M15 · Command palette races
- **File:** `src/components/layout/CommandPalette.tsx:27-35`
- **Current:**
  - A slower earlier response can overwrite newer results.
  - If the query drops below 2 characters mid-search, "Searching…" sticks.
- **Fix:** keep a request counter and ignore stale responses; reset `loading` in the short-query branch.

---

## Low

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

## Checked and working

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

## Web ↔ mobile sync

| Flow | Status |
|---|---|
| Web creates or updates a lead → phone | Works through the `sync_at` trigger. The commit-order gap (H9) can lose a change. |
| Web soft-deletes a lead → phone | Works: the feed emits a `gone` stub. Hard purges after 30 days rely on the app's full re-pull. |
| Phone updates a lead → web lead page | Shows within ~10 s via the `LiveNextBestAction` change-token poll. |
| Phone updates or creates → web leads list | **Never shows until reload** (H3), unless a notification bumps the bell (M2). |
| Phone offline create → web | Shows after the phone syncs and the web user reloads. |
| Notes, activities and follow-ups | These don't change the lead row. The phone depends on per-lead fetches. Not verified on a device. |

## Offline web

Only Quick Add is offline-aware, and its queue has the problems in H7. Other forms show an error toast on network failure; I didn't verify whether they keep the typed input. Before adding offline support elsewhere, decide which web workflows need it. Quick Add probably covers the realistic need.

---

## Category index

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

## Prioritized implementation plan

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

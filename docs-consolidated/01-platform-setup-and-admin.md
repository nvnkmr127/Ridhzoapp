# Platform, Setup & Admin

Project README, Railway deployment, UI theme, and the Super-Admin platform console spec.

> Consolidated from 6 source file(s). Content is verbatim; headings are nested two levels deeper under each section. Edit the original files if they still exist, then regenerate.

## Contents

1. [README](#1-readme) — `README.md`
2. [Railway Migration Runbook](#2-railway-migration-runbook) — `deploy/railway-setup.md`
3. [Theme & Design System (`THEME.md`)](#3-theme--design-system-thememd) — `docs/THEME.md`
4. [PRD — Super-Admin Platform Console (Full)](#4-prd--super-admin-platform-console-full) — `docs/SUPERADMIN_PLATFORM_CONSOLE_PRD.md`
5. [Ridhzo Runbook](#5-ridhzo-runbook) — `docs/RUNBOOK.md`
6. [Database Reference](#6-database-reference) — `docs/DATABASE.md`

---

## 1. README

> Source: `README.md`

### Ridhzo

A multi-tenant, WhatsApp-first lead CRM: capture leads from forms, webhooks, Facebook/Google Lead Ads and
CSV; assign, follow up, run sequences and automations; track meetings, pipeline and analytics; mobile API.

**Stack:** Next.js 15 (App Router, server components + server actions) · React 19 · TypeScript · Drizzle ORM +
PostgreSQL · BullMQ + Redis (background jobs) · NextAuth (JWT) · Razorpay billing · Cloudflare R2 (files) ·
Resend/SMTP (email) · Watxio (WhatsApp) · Vercel AI Gateway (AI).

#### Architecture in one screen

```
Browser / mobile app ──► Next.js (Vercel)  ── server actions + /api/v1 + webhooks
                              │                      │ enqueue
                              ▼                      ▼
                         PostgreSQL ◄────────── Worker process (src/worker.ts, always-on: Railway/VM)
                                                 └ BullMQ consumers + schedulers (reminders, sequences, …)
```

- **Tenancy:** every row hangs off an `organization_id`; the tenant comes from the session (`requireOrg()`),
  never from user input. Services take `organizationId` as a required argument.
- **Permissions:** `src/lib/permissions.ts` (keys) + `src/lib/rbac` (checks). Enforce on the **server**
  (`requirePermission`, `assertLeadWrite`); hidden buttons are not security.
- **Web vs worker:** the web app only *enqueues* (`src/lib/jobs/queues/*`). Consumers live in
  `src/lib/jobs/workers/*` and are started only by `startWorkers` (`npm run worker`, or in-process off Vercel).
  Never import a `workers/*` module from web code.
- **Domains:** business logic in `src/domains/*`, server actions in `src/lib/actions/*`, public API in
  `src/app/api/v1/*`, webhooks in `src/app/api/webhooks/*`.

#### Getting started

Requirements: Node 22, PostgreSQL 16, Redis 7 (optional locally — jobs and shared rate limits are disabled without it).

```bash
npm ci
cp .env.example .env          # fill DATABASE_URL and NEXTAUTH_SECRET at minimum
npm run db:migrate            # apply drizzle/ migrations
npm run db:seed               # LOCAL databases only: demo org, admin@acme.com / password123
npm run dev                   # http://localhost:3000
npm run worker                # separate terminal: background jobs (needs REDIS_URL)
```

`validateEnv()` (src/lib/env.ts) fails fast on missing required variables and warns about unsafe production
settings. Every variable the code reads is listed in `.env.example`.

#### Commands

| | |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npx tsc --noEmit` · `npm run lint` · `npx vitest run` | typecheck · lint · unit/integration tests |
| `npx playwright test` | e2e (`e2e/`, needs a seeded local DB) |
| `npm run db:generate` / `db:migrate` / `db:baseline` | migrations (see `drizzle/`) |
| `npm run worker` | background worker |
| `npm run grant:superadmin -- you@example.com` | make a platform operator |
| `npm run admin:reset-mfa -- you@example.com` | clear a lost operator authenticator |

#### Operating notes

- **Platform console** (`/admin`) is for super-admins and needs TOTP two-factor (enrol on first visit).
- **Production checklist:** `NEXTAUTH_SECRET` and a *separate* `EMAIL_SECRET_KEY`; TLS (or private networking)
  for Postgres and Redis; `RAZORPAY_*`; `FACEBOOK_APP_SECRET` + `FACEBOOK_VERIFY_TOKEN`;
  `WATXIO_APP_SECRET` or `WATXIO_VERIFY_TOKEN`; Turnstile keys for public forms; a private R2 bucket;
  `/api/health` as the uptime probe (set `HEALTH_REQUIRE_WORKER=1` to include the worker heartbeat).
- **Deploy:** web on Vercel; worker via `railway.json` → `deploy/Dockerfile.worker` (see `deploy/railway-setup.md`,
  which also covers backups and recovery). CI: `.github/workflows/ci.yml` (typecheck, lint, tests, empty-DB migrate + build).
- **Docs:** feature specs are in `docs/` (`docs-consolidated/` is a consolidated copy — edit `docs/` first). The latest
  engineering audit is `docs/PRODUCTION_AUDIT_2026-10-02.md`.

---

## 2. Railway Migration Runbook

> Source: `deploy/railway-setup.md`

### Railway Migration Runbook

This guide covers migrating the backend stack (**PostgreSQL**, **Redis**, and **BullMQ worker**) from the DigitalOcean Droplet to [Railway](https://railway.app).

Your Next.js web application continues to run on **Vercel**, connecting securely to Railway's managed Postgres and Redis instances via TCP proxies.

---

#### Architecture Overview

| Component | Railway Service | Network Access |
|---|---|---|
| **PostgreSQL** | Managed Database Plugin | Private internal to Worker; Public TCP proxy to Vercel |
| **Redis** | Managed Database Plugin (`noeviction`) | Private internal to Worker; Public TCP proxy to Vercel |
| **Worker** | Dockerfile service (`deploy/Dockerfile.worker`) | Private internal connection to DB & Redis; auto-deploy on git push |
| **Web (Next.js)** | Vercel (existing) | Connects to Railway via Public TCP URLs |

---

#### Step 1: Create Railway Project & Databases

1. Log in to [Railway](https://railway.app) and click **"New Project"**.
2. **Add PostgreSQL**:
   - Click **`+ New`** → **`Database`** → **`Add PostgreSQL`**.
   - Select the PostgreSQL service → go to the **`Settings`** tab.
   - Under **Networking**, click **`Enable Public Networking`** (or **`TCP Proxy`**).
   - Go to the **`Connect`** tab and copy the **Public Connection URL** (format: `postgresql://postgres:...@...proxy.rlwy.net:.../railway`).
3. **Add Redis**:
   - Click **`+ New`** → **`Database`** → **`Add Redis`**.
   - Select the Redis service → go to the **`Settings`** tab.
   - Under **Networking**, click **`Enable Public Networking`** (or **`TCP Proxy`**).
   - Go to the **`Connect`** tab and copy the **Public Connection URL** (format: `redis://default:...@...proxy.rlwy.net:...`).

---

#### Step 2: Deploy the Background Worker Service

1. In the same Railway project, click **`+ New`** → **`GitHub Repo`** → select your repository (`privyr-v2`).
2. Railway detects [`railway.json`](file:///Users/naveenadicharla/Documents/privyr-v2/railway.json) in the repository root and builds using [`deploy/Dockerfile.worker`](file:///Users/naveenadicharla/Documents/privyr-v2/deploy/Dockerfile.worker).
3. Select the worker service, click the **`Variables`** tab, and add:

   | Variable | Value | Description |
   |---|---|---|
   | `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` | Railway internal reference (zero latency, zero egress) |
   | `REDIS_URL` | `${{Redis.REDIS_URL}}` | Railway internal reference |
   | `NEXTAUTH_SECRET` | *(same secret as in Vercel)* | Required for environment boot validation |
   | `NODE_ENV` | `production` | Production mode |
   | `RESEND_API_KEY` | *(optional)* | Optional feature key if sending emails from worker |

4. Railway will trigger a build and start the container.
5. In the **`Deployments`** tab → click **View Logs**, and verify you see:
   ```
   [worker] up — draining queues. Ctrl+C to stop.
   ```

---

#### Step 3: Database Schema & Data Migration

Choose either **Option A** (fresh schema) or **Option B** (migrate existing data from Droplet):

##### Option A: Fresh Database Initialization
Run locally from this repository:
```bash
DATABASE_URL="<RAILWAY_POSTGRES_PUBLIC_URL>" npm run db:push
```

##### Option B: Migrate Existing Droplet Data
If you have data on the Droplet PostgreSQL instance to carry over:

```bash
# 1. SSH into the droplet and export the database
ssh <DROPLET_USER>@<DROPLET_HOST>
docker exec -t $(docker ps -qf "name=postgres") pg_dump -U leadapp -d leadapp > /tmp/droplet_db_backup.sql
exit

# 2. Download the backup to your machine
scp <DROPLET_USER>@<DROPLET_HOST>:/tmp/droplet_db_backup.sql ./droplet_db_backup.sql

# 3. Restore the dump into Railway PostgreSQL
psql "<RAILWAY_POSTGRES_PUBLIC_URL>" < droplet_db_backup.sql
```

---

#### Step 4: Update Vercel Environment Variables

1. Go to your project on [Vercel](https://vercel.com) → **Settings** → **Environment Variables**.
2. Update the following variables:
   - **`DATABASE_URL`**: Set to Railway PostgreSQL **Public Connection URL**.
   - **`REDIS_URL`**: Set to Railway Redis **Public Connection URL**.
3. Trigger a redeployment in Vercel (or push a commit to redeploy).

---

#### Step 5: Verify End-to-End

1. **Web App**: Open your Vercel URL. Confirm login works and leads load properly.
2. **Background Jobs**:
   - Create or assign a lead.
   - Check the Railway Worker service logs in Railway dashboard: you should see the event processed and queue job drained.
3. **Automated CI/CD**:
   - On every push to `main`, GitHub Actions will run test gates, and Railway will automatically build and redeploy the worker.

---

#### Step 6: Decommission the Droplet

Once you have verified that Vercel and Railway are running seamlessly:
```bash
ssh <DROPLET_USER>@<DROPLET_HOST>
# Stop and remove droplet docker containers
cd ~/privyr-v2 && docker compose -f deploy/docker-compose.yml down -v
# Stop legacy systemd service if active
sudo systemctl stop privyr-worker || true
sudo systemctl disable privyr-worker || true
```
You can now destroy the DigitalOcean Droplet in the DigitalOcean Cloud console.

---

#### Backups & Recovery

Railway Hobby has **no** database backups. The only backup is `.github/workflows/db-backup.yml`:
every 6 hours it dumps Postgres, proves the dump restores, and uploads it to a private R2 bucket.
Worst case you lose up to 6 hours of data.

| What | Backed up by |
|---|---|
| Postgres | `db-backup.yml` → R2 (kept 30 days) |
| Deleted leads (< 30 days) | In-app recycle bin — no backup needed |
| `NEXTAUTH_SECRET`, `EMAIL_SECRET_KEY` | Password manager — without them a restored DB can't decrypt SMTP passwords or keep sessions |
| Redis | Nothing — workers re-create their schedulers on boot |
| R2 attachments | Nothing — R2 is durable; files are only deleted when their lead is purged |

##### One-time setup

1. **Read-only DB user** (so GitHub never holds a write-capable password), via `psql "<RAILWAY_POSTGRES_PUBLIC_URL>"`:
   ```sql
   CREATE ROLE backup LOGIN PASSWORD '<random>';
   GRANT pg_read_all_data TO backup;
   ```
2. **R2 bucket** `ridhzo-db-backups` (separate from the attachments bucket), in its Settings:
   - **Object lifecycle rule**: delete objects after 30 days.
   - **Bucket lock rule**: retain 29 days — so even a leaked token can't delete or overwrite backups.
   - **API token**: Object Read & Write, scoped to this bucket only.
3. **GitHub → Settings → Secrets → Actions**: `BACKUP_DATABASE_URL` (public URL with the `backup`
   user), `BACKUP_R2_BUCKET`, `BACKUP_R2_ACCOUNT_ID`, `BACKUP_R2_KEY_ID`, `BACKUP_R2_SECRET`.
4. Actions → **DB backup** → **Run workflow**, confirm it's green and a file appears in the bucket.

##### Recovery

Download the dump you need (newest before the incident):
```bash
aws s3 ls s3://ridhzo-db-backups/pg/ --endpoint-url https://<ACCOUNT_ID>.r2.cloudflarestorage.com
aws s3 cp s3://ridhzo-db-backups/pg/<file>.dump db.dump --endpoint-url https://<ACCOUNT_ID>.r2.cloudflarestorage.com
```

**A. Whole database lost or wiped** (Railway failure, leaked credentials, destroyed volume):
1. Create a new Railway Postgres (or any Postgres of the same major version).
2. `pg_restore -d "<NEW_DATABASE_URL>" --no-owner --no-acl db.dump`
3. Point `DATABASE_URL` at it in Vercel **and** the Railway worker; redeploy both.
4. Rotate `NEXTAUTH_SECRET` only if it leaked (it logs everyone out).

**B. One tenant's data lost** (purged leads, wrong tenant hard-deleted, bad bulk edit) — never
restore over prod, every other tenant would lose newer data:
1. Restore into a scratch DB: `docker run -d -e POSTGRES_PASSWORD=x -p 5433:5432 postgres:<MAJOR>`,
   then `pg_restore -d postgresql://postgres:x@localhost:5433/postgres --no-owner --no-acl db.dump`.
2. Copy that org's missing rows back, parents first (organizations → users → leads → child tables),
   inserting with `ON CONFLICT (id) DO NOTHING` so nothing current is overwritten.
3. Check in the app, then drop the scratch DB.

**C. Bug corrupted data for everyone:** if caught within hours and nothing important came in since,
use A. Otherwise use B's scratch DB and copy back only the damaged tables/columns.

---

## 3. Theme & Design System (`THEME.md`)

> Source: `docs/THEME.md`

### Theme & Design System (`THEME.md`)

#### 1. Executive Summary & Design Philosophy

Ridhzo CRM employs a **dark-first, strictly monochrome design system** built upon a neutral grayscale (Hue 0, Saturation 0). Rather than relying on multi-colored UI chrome, the interface reads cleanly across shades of black, charcoal, and white.

##### Core Tenets:
- **Monochrome Dark-First:** The base page surface is deep pitch-black (`#0a0a0a` / `hsl(0, 0%, 4%)`), with lifted card surfaces (`#121212` / `hsl(0, 0%, 7%)`) and high-contrast near-white ink (`hsl(0, 0%, 96%)`).
- **CRED-Style Primary Actions:** Primary action buttons are high-contrast white blocks filled with black text (`bg-primary text-primary-foreground`), drawing immediate, unambiguous visual focus without competing colored CTA buttons.
- **Color As a Deliberate Exception:** True hues (blues, emeralds, reds, ambers) are strictly quarantined from the structural UI and reserved exclusively for high-signal domain data—specifically lead status badges, pipeline velocity warnings, and external integration brand markers.
- **Monochrome Destructive Pattern:** Destructive actions retain a muted monochrome appearance (`hsl(0, 0%, 17%)`); destructive intent is communicated via clear iconography, explicit copy, and confirmation dialogs rather than alarming red button floods.
- **Native Dark Integration:** Form inputs, date pickers, native checkboxes, and scrollbars enforce browser-level dark schemes (`color-scheme: dark`, monochrome `accent-color`) to eliminate white flashbangs and OS-level blue accents.

---

#### 2. File & Configuration Architecture

| Layer / Purpose | File Path |
| :--- | :--- |
| **Global Design Tokens & CSS Variables** | [`src/app/globals.css`](file:///Users/naveenadicharla/Documents/ridhzo/src/app/globals.css) |
| **Tailwind Configuration & Extensions** | [`tailwind.config.ts`](file:///Users/naveenadicharla/Documents/ridhzo/tailwind.config.ts) |
| **Shadcn UI Configuration** | [`components.json`](file:///Users/naveenadicharla/Documents/ridhzo/components.json) |
| **Root Layout & Fonts** | [`src/app/layout.tsx`](file:///Users/naveenadicharla/Documents/ridhzo/src/app/layout.tsx) |
| **PWA Manifest & Theme Color** | [`src/app/manifest.ts`](file:///Users/naveenadicharla/Documents/ridhzo/src/app/manifest.ts) |
| **Chart Visualization Theme** | [`src/components/dashboard/Charts.tsx`](file:///Users/naveenadicharla/Documents/ridhzo/src/components/dashboard/Charts.tsx) |
| **Core Button Primitive** | [`src/components/ui/button.tsx`](file:///Users/naveenadicharla/Documents/ridhzo/src/components/ui/button.tsx) |
| **Core Badge Primitive** | [`src/components/ui/badge.tsx`](file:///Users/naveenadicharla/Documents/ridhzo/src/components/ui/badge.tsx) |

---

#### 3. Color Tokens & Palette

All color tokens in Ridhzo CRM are defined via CSS custom properties in `src/app/globals.css` and mapped to Tailwind utilities:

```css
:root {
  --background: 0 0% 4%;          /* #0a0a0a — canvas background */
  --foreground: 0 0% 96%;         /* near-white primary text */

  --card: 0 0% 7%;                /* #121212 — elevated container / card surface */
  --card-foreground: 0 0% 96%;

  --popover: 0 0% 8%;             /* #141414 — dropdown menus, dialogs, command palettes */
  --popover-foreground: 0 0% 96%;

  --primary: 0 0% 96%;            /* high-contrast white block */
  --primary-foreground: 0 0% 6%;  /* black text inside primary block */

  --secondary: 0 0% 13%;          /* #212121 — subtle control background */
  --secondary-foreground: 0 0% 96%;

  --muted: 0 0% 12%;              /* #1f1f1f — disabled or non-interactive surfaces */
  --muted-foreground: 0 0% 60%;   /* secondary / helper text */

  --accent: 0 0% 15%;             /* #262626 — hover states and selection fills */
  --accent-foreground: 0 0% 98%;

  --destructive: 0 0% 17%;        /* #2b2b2b — monochrome destructive button fill */
  --destructive-foreground: 0 0% 98%;

  --border: 0 0% 16%;             /* #292929 — structural borders and dividers */
  --input: 0 0% 16%;              /* input boundary borders */
  --ring: 0 0% 45%;               /* focus outline ring */

  --radius: 0.75rem;              /* 12px default corner radius */
}
```

##### Visual Contrast Hierarchy

```
+-------------------------------------------------------------+
| Background: hsl(0 0% 4%) [#0a0a0a]                          |
|  +-------------------------------------------------------+  |
|  | Card: hsl(0 0% 7%) [#121212] | Border: hsl(0 0% 16%)  |  |
|  |                                                       |  |
|  | Heading: hsl(0 0% 96%)                                |  |
|  | Description: hsl(0 0% 60%) (muted-foreground)         |  |
|  |                                                       |  |
|  | [ Secondary Action ]        [ Primary Action ]        |  |
|  | bg: hsl(0 0% 13%)           bg: hsl(0 0% 96%)         |  |
|  | text: hsl(0 0% 96%)         text: hsl(0 0% 6%)        |  |
|  +-------------------------------------------------------+  |
+-------------------------------------------------------------+
```

---

#### 4. Typography System

The application relies on Vercel's **Geist** font family loaded via `next/font/local` in [`src/app/layout.tsx`](file:///Users/naveenadicharla/Documents/ridhzo/src/app/layout.tsx):

```typescript
const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});
```

##### Typographic Specifications:
- **Body & Headings (`font-sans`):** `var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif`.
- **Code & Keyboard Shortcuts (`font-mono`):** `var(--font-geist-mono), ui-monospace, monospace`.
- **Font Smoothing:** `-webkit-font-smoothing: antialiased`.
- **OpenType Feature Settings:** `cv02`, `cv03`, `cv04`, `cv11` enabled by default in `globals.css` for enhanced punctuation and tabular-friendly digit geometry.

---

#### 5. Shape & Corner Radii

Ridhzo uses rounded geometries configured in [`tailwind.config.ts`](file:///Users/naveenadicharla/Documents/ridhzo/tailwind.config.ts):

| Token | CSS Calculation | Resolved Value | Standard Usage |
| :--- | :--- | :--- | :--- |
| `rounded-lg` | `var(--radius)` | `0.75rem` (12px) | Cards, Modals, Drawers, Large Action Buttons |
| `rounded-md` | `calc(var(--radius) - 2px)` | `0.625rem` (10px) | Standard Form Controls, Text Inputs, Small Buttons |
| `rounded-sm` | `calc(var(--radius) - 4px)` | `0.5rem` (8px) | Tooltips, Nested Badges, Dropdown Menu Items |
| `rounded-full` | `9999px` | `9999px` | Avatars, Pill Badges, Status Dots |

---

#### 6. Component Styling Specifications

##### 6.1 Buttons ([`src/components/ui/button.tsx`](file:///Users/naveenadicharla/Documents/ridhzo/src/components/ui/button.tsx))
- **`default` (Primary):** `bg-primary text-primary-foreground hover:bg-primary/90` — Solid near-white block with black text.
- **`secondary`:** `bg-secondary text-secondary-foreground hover:bg-accent` — Subtle dark surface (`#212121`).
- **`outline`:** `border border-border bg-transparent hover:bg-accent hover:text-accent-foreground`.
- **`destructive`:** `bg-destructive text-destructive-foreground hover:bg-destructive/80` — Dark monochrome surface (`#2b2b2b`).
- **`ghost`:** `hover:bg-accent hover:text-accent-foreground`.
- **Interaction Micro-feedback:** Built-in active scaling (`active:scale-[0.98]`) for tactile physical button press response.

##### 6.2 Form Inputs & Controls ([`src/app/globals.css`](file:///Users/naveenadicharla/Documents/ridhzo/src/app/globals.css))
- **Native Checkboxes & Radios:** Styled via `accent-color: hsl(var(--foreground));` so they render crisp white when checked instead of browser-default blue.
- **Date / Time Inputs:** Explicitly forced to `color-scheme: dark` to ensure native calendar dropouts match the dark palette without flashing white.
- **Text Selection:** `::selection { background: hsl(var(--foreground)); color: hsl(var(--background)); }` (Inverted high contrast).
- **Scrollbars:** Thin 8px scrollbars with transparent track and `hsl(var(--border))` thumb.

##### 6.3 Charts & Visualizations ([`src/components/dashboard/Charts.tsx`](file:///Users/naveenadicharla/Documents/ridhzo/src/components/dashboard/Charts.tsx))
Every metric chart uses a unified monochrome palette:
- **Series Fill (`INK`):** `#e0e0e0` (clean off-white for bars and area strokes)
- **Area Fill Gradient:** `from: rgba(224,224,224, 0.25)` to `to: rgba(224,224,224, 0.0)`
- **Grid Lines (`GRID`):** `#242427` (subtle dark separation lines)
- **Axis Text (`AXIS`):** `#8a8a8f` (12px muted label text)
- **Tooltip Container:** Surface `#141414`, Border `1px solid #242427`, Radius `8px`, Text `#f5f5f5`

---

#### 7. Status Color Taxonomy (The Color Exception Rule)

While the chrome and controls are monochrome, business status data utilizes standardized semantic hues to provide immediate cognitive recognition:

| Status Key | Status Label | Hex Color | Category | Meaning |
| :--- | :--- | :--- | :--- | :--- |
| `new` | **New** | `#3B82F6` | Open | Fresh incoming lead requiring first response |
| `active` | **Active** | `#10B981` | In Progress | Actively engaged in conversation / sales process |
| `won` | **Won** | `#059669` | Won | Successfully closed customer deal |
| `lost` | **Lost** | `#EF4444` | Lost | Closed lost opportunity (with mandatory loss reason) |
| `unqualified` | **Unqualified**| `#6B7280` | Unqualified | Lead does not meet qualification criteria |

These colors are applied as subtle indicators:
- 2.5px circular status dots (`<Dot color={color} />`)
- Status pill badges with 15% opacity backgrounds and solid text color
- Pipeline Kanban column header accent bars

---

#### 8. Mobile & PWA App Presentation

Ridhzo is designed for native standalone execution on mobile devices:
- **Theme Color:** `#0a0a0a` configured across [`src/app/layout.tsx`](file:///Users/naveenadicharla/Documents/ridhzo/src/app/layout.tsx) and [`src/app/manifest.ts`](file:///Users/naveenadicharla/Documents/ridhzo/src/app/manifest.ts).
- **iOS Status Bar:** Configured as `appleWebApp: { capable: true, statusBarStyle: "black-translucent" }` to allow full edge-to-edge dark immersion under the iOS notch and Dynamic Island.
- **Viewport:** `viewportFit: "cover"` with `initialScale: 1` preventing responsive scaling artifacts.

---

## 4. PRD — Super-Admin Platform Console (Full)

> Source: `docs/SUPERADMIN_PLATFORM_CONSOLE_PRD.md`

### PRD — Super-Admin Platform Console (Full)

**Status:** Documenting shipped surface + prioritized gaps · **Last updated:** 2026-09-29
**Owner:** Platform / Founder-ops · **Scope:** `/admin`, tenant impersonation, and all `requireSuperAdmin`-gated actions

> This is a "reverse + forward" spec: it documents the platform-operator console that already exists (`src/app/(dashboard)/admin`, `src/components/platform/*`, `src/lib/actions/platform.ts`, `src/domains/platform/*`) and specs the remaining gaps found in review. Requirements already implemented are marked **[Shipped]**; gaps are **[Gap]**.

---

#### Problem Statement

Ridhzo is a multi-tenant lead CRM. Running it as a business requires a single operator surface to manage the whole fleet — provision plans, resolve billing, support tenants, investigate incidents, and satisfy compliance (GDPR/DSR) requests — **without** shipping DB scripts or giving engineers ad-hoc production access. Without one governed console, every operational task becomes a manual SQL/one-off, which is slow, unauditable, and risky (a mistyped `WHERE` can touch the wrong tenant).

**Who experiences it:** the platform operator(s) / founder-ops (1–5 people today), plus, indirectly, every tenant whose plan, suspension, credits, or support ticket flows through it.

**Cost of not solving:** unauditable production access, slow support/billing resolution, compliance exposure (no DSR tooling), and no safe way to reproduce a tenant's view when debugging.

---

#### Goals

1. **One governed surface for all fleet operations** — a super-admin can run every routine platform task (plan, suspend, credits, billing, support, compliance, incident) from `/admin` with no direct DB access. *(Measure: % of ops tasks doable in-console vs. requiring a script.)*
2. **Every privileged action is authorized and audited** — 100% of state-changing platform actions pass `requireSuperAdmin` and write an `audit_logs` row attributable to the operator. *(Measure: audit coverage = mutating actions with a log ÷ total mutating actions.)*
3. **Safe tenant reproduction** — an operator can view a tenant exactly as its users do, in a read-only mode that cannot alter tenant data. *(Measure: 0 tenant writes originate from read-only impersonation sessions.)*
4. **Fast incident containment** — an operator can suspend a tenant, revoke sessions, and enable maintenance mode, and the effect is enforced within one session-refresh window (≤60s). *(Measure: time from action → enforced.)*
5. **Compliance-ready** — DSR subject lookup, dossier export, and right-to-be-forgotten are self-serve for the operator. *(Measure: DSR request turnaround.)*

---

#### Non-Goals

1. **Tenant-facing admin** — this console is for the platform operator, not tenant admins (tenant settings live under `/settings`). *Separate surface, separate RBAC.*
2. **A general BI/analytics warehouse** — RevOps metrics here are operational, not a replacement for a data warehouse. *Different tool, different latency needs.*
3. **Multi-operator RBAC granularity** — super-admin is currently all-or-nothing; per-permission platform roles (e.g. "support-only" operator) are out of scope for v1. *(See P2.)*
4. **Editing tenant business data at will** — impersonation exists to reproduce/support, not to routinely author a tenant's leads; read-only is the default posture we want to encourage.
5. **Self-service operator onboarding** — super-admin is granted via CLI (`grant:superadmin`), not a UI. *Low volume; UI is unjustified.*

---

#### Personas

- **Platform Operator (primary)** — founder / ops. Manages the whole fleet. Trusted, low-volume, high-blast-radius.
- **Support Operator (secondary, future)** — handles tickets and read-only tenant lookups; should *not* have destructive powers. Today collapses into "super-admin".
- **Compliance Operator (secondary)** — runs DSR/RTBF. Today collapses into "super-admin".

---

#### User Stories

##### Fleet & tenant management
- As a **platform operator**, I want to see every organization with plan, status, and health so that I can triage the fleet at a glance. **[Shipped]**
- As a **platform operator**, I want to set a tenant's plan / trial so that I can provision or comp accounts. **[Shipped]**
- As a **platform operator**, I want to suspend/reactivate a tenant so that I can contain abuse or non-payment, and have it take effect immediately. **[Shipped]**
- As a **platform operator**, I want to hard-delete a tenant (with typed confirmation) so that I can honor account-closure requests. **[Shipped]**
- As a **platform operator**, I want a Tenant 360 view (usage, billing, sources, health, ingestion failures) so that I can diagnose one tenant deeply. **[Shipped]**

##### Impersonation & support
- As a **platform operator**, I want to impersonate a tenant **read-only** so that I can reproduce their view without any risk of altering their data. **[Shipped]**
- As a **platform operator**, I want a persistent banner while impersonating so that I never forget I'm acting inside a tenant. **[Shipped]**
- As a **support operator**, I want a support-ticket desk (assign, reply, note, status) so that I can resolve tenant issues in one place. **[Shipped]**

##### Billing & RevOps
- As a **platform operator**, I want RevOps metrics (MRR, churn risk, funnel) so that I can see fleet health. **[Shipped]**
- As a **platform operator**, I want to grant credits, generate/void invoices, issue credit notes, and manage coupons so that I can handle billing exceptions. **[Shipped]**
- As a **platform operator**, I want billing-lifecycle tools (extend grace, mark manually paid, dunning, simulate failure) so that I can manage dunning without touching Razorpay directly. **[Shipped]**

##### Security, incident & compliance
- As a **platform operator**, I want to revoke a user's or an org's sessions so that a compromised account is locked out fast. **[Shipped — fixed 2026-09-20]**
- As a **platform operator**, I want a maintenance mode that actually locks tenants out (except super-admins) so that I can safely run migrations. **[Shipped — fixed 2026-09-20]**
- As a **platform operator**, I want anomaly/threat detection with resolve/remediate so that I can respond to security signals. **[Shipped]**
- As a **compliance operator**, I want DSR subject search, dossier export, and right-to-be-forgotten so that I can satisfy GDPR requests. **[Shipped]**
- As a **platform operator**, I want a system broadcast + ops alerts + executive digest so that I can communicate and stay informed. **[Shipped]**

---

#### Requirements

##### Must-Have (P0) — the console is not viable without these
All P0s are **[Shipped]** and gated by `requireSuperAdmin`; listed here as the contract.

| # | Requirement | Acceptance criteria |
|---|-------------|---------------------|
| P0-1 | **Authorization on every mutation** | Given a non-super-admin, when they call any platform action or open `/admin`, then they are refused (`Forbidden`) / redirected to `/leads`. |
| P0-2 | **Audit on every mutation** | Given any state-changing platform action, when it completes, then an `audit_logs` row exists attributing it to the operator (platform-scoped events log under the system org, never dropped). |
| P0-3 | **Plan / trial management** | Operator can set plan (free/pro/business) + trial days; org row + audit updated; unknown org → clear error. |
| P0-4 | **Suspend / reactivate (instant)** | Given a suspended org, when its user loads any page, then they are sent to `/suspended` within ≤60s (session refresh), super-admins exempt. |
| P0-5 | **Read-only impersonation cannot write** | Given read-only impersonation, when the operator attempts *any* mutation (permission-gated **or** `requireOrg`-only), then it is refused. *(Enforced via `hasPermission` `.view`-only + `assertWritable`.)* |
| P0-6 | **Session revocation enforced** | Given an operator revokes a user/org, when that session's next request lands (≤60s), then it is treated as unauthenticated. Sessions issued before the revoke timestamp are the only ones affected. |
| P0-7 | **Hard delete is guarded + transactional** | Requires typing the tenant slug or name; deletes all child rows then the org in one transaction; partial failure rolls back. |
| P0-8 | **DSR / right-to-be-forgotten** | Operator can search a subject, export a dossier, and anonymize a lead; action is audited. |

##### Nice-to-Have (P1) — fast follows
| # | Requirement | Rationale / acceptance |
|---|-------------|------------------------|
| P1-1 | **Confirm dialogs for suspend & bulk-suspend** **[Shipped 2026-09-29]** — every native `confirm()` in the console/Tenant 360 now uses `useConfirm` (`components/ui/confirm-dialog.tsx`); suspend, hard delete and write impersonation also require an audited reason. | Replace native `confirm()` in `PlatformConsole` with the same `AlertDialog` pattern hard-delete uses; consistent, styleable, testable. AC: destructive fleet actions use an in-app dialog naming the tenant(s) and count. |
| P1-2 | **Hard-delete FK-coverage guard** **[Shipped]** (`hardDeleteCoverage.test.ts`) | Add a test/assertion that cross-checks every table with an FK to `organizations`/`leads` against the delete list, so a future schema addition can't silently make hard-delete roll back. AC: test fails if an org-referencing table is missing from the delete routine. |
| P1-3 | **Reduced-motion + tab a11y polish** *(partly done)* | `motion-reduce:animate-none` on the threat badge; `aria-current` on active tabs **[Shipped]**. |
| P1-4 | **Bulk operations beyond suspend** | Bulk plan-set / bulk credit-grant with partial-success reporting (suspend already loops sequentially — `ponytail:` note flags a batch endpoint when fleet > 100). |
| P1-5 | **Maintenance mode scheduling + message preview** | Schedule a window and preview the tenant-facing screen before enabling. |

##### Future Considerations (P2) — design for, don't build
| # | Requirement | Why design for it now |
|---|-------------|-----------------------|
| P2-1 | **Granular platform roles** (support-only, billing-only, compliance-only, read-only auditor) | Today super-admin is all-or-nothing; the audit already records `by: super_admin`. Keep action authorization centralized (`requireSuperAdmin`) so it can later branch on a platform-role without touching call sites. |
| P2-2 | **Session-revocation for pre-fix sessions / global "revoke all"** | Current revoke can't touch sessions issued before `authAt` existed; a token-version column would make revocation absolute. |
| P2-3 | **Config in migrations, not runtime DDL** **[Shipped 2026-09-29]** — `drizzle/0085_platform_tables.sql`; invoices and tickets also moved out of JSON config into `tax_invoices` / `support_tickets`. | `platform_configs` is created lazily via `CREATE TABLE IF NOT EXISTS`; move to a drizzle migration so the schema is declarative and DDL grants aren't needed at runtime. |
| P2-4 | **Batch fleet endpoints** *(partial: `bulkSetOrgSuspendedAction` returns per-org results; still loops server-side)* | For 100+ orgs, replace sequential loops with set-based operations. |
| P2-5 | **Operator activity replay / immutable audit export** | Signed, exportable audit trail for the platform events themselves. |

---

#### Success Metrics

##### Leading (days–weeks)
- **In-console task coverage** — ≥ 95% of routine ops tasks done without a DB script. *Method: ops log / self-report. Eval: 30 days.*
- **Audit coverage** — 100% of mutating platform actions produce an audit row. *Method: static enumeration (mutating actions ÷ actions with `AuditService.log`). Eval: per release.*
- **Read-only write leakage** — **0** tenant writes originate from a read-only impersonation session. *Method: `assertWritable` throws + no `impersonate_readonly` writes in audit. Eval: continuous.*
- **Enforcement latency** — suspend / revoke / maintenance enforced ≤ 60s. *Method: session-refresh interval. Eval: per release.*

##### Lagging (weeks–months)
- **Support/billing resolution time** — trend down as tools replace manual work.
- **Compliance turnaround** — DSR request → dossier/RTBF completed, target < 24h.
- **Incidents caused by direct DB access** — trend to 0.

---

#### Open Questions

- **[stakeholder]** Do we need granular platform roles (P2-1) before adding a second/third operator, or is all-or-nothing acceptable at current headcount? *(Non-blocking; affects when P2-1 lands.)*
- **[legal]** For right-to-be-forgotten, is lead **anonymization** sufficient, or do specific jurisdictions require hard deletion of the row? *(Blocking for any compliance SLA commitment.)*
- **[engineering]** Should platform-scoped audit events keep logging under the system-org sentinel (`00000…000`), or do we want a dedicated `platform_audit` stream? *(Non-blocking; current behavior is "never dropped".)*
- **[data]** What is the authoritative churn-risk definition powering RevOps, and does it match Finance's? *(Non-blocking.)*
- **[engineering]** Do we adopt a token-version column to make session revocation absolute (P2-2), accepting a forced global re-login on rollout? *(Non-blocking.)*

---

#### Timeline Considerations

- **No hard external deadline.** Phasing is driven by operator pain and compliance risk.
- **Delivered this cycle (2026-09-20):** P0-5 (read-only write guard via `assertWritable`), P0-6 (session revocation enforcement), maintenance-mode enforcement, platform audit-log always-on, plus a11y/build/lint cleanups.
- **Phase 1 (next):** P1-1 (confirm dialogs), P1-2 (FK-coverage guard) — both low-effort, high-safety.
- **Phase 2:** P1-4/P1-5 (bulk ops, maintenance scheduling).
- **Phase 3:** P2-1 (granular roles) — largest, gate on second-operator need.
- **Dependency:** P2-3 (config → migrations) should precede any environment where the DB user lacks DDL rights.

---

## 5. Ridhzo Runbook

> Source: `docs/RUNBOOK.md`

### Ridhzo runbook

#### Health
- `GET /api/health` — DB + Redis. Set `HEALTH_REQUIRE_WORKER=1` to also fail when the worker heartbeat is missing.
- Worker down → webhooks, automations, sequences, score decay stop. Check Railway worker logs; the worker shuts down gracefully on SIGTERM (`closeAllWorkers`).
- Failed outbound webhooks: Settings → Webhooks → failed deliveries (DLQ panel).

#### Deploy
1. `npm test && npx tsc --noEmit`, merge to `main` (CI also runs gitleaks and the tenant-isolation integration test).
2. Apply migrations first: `npm run db:migrate` (idempotent; all migrations are safe to re-run).
3. Vercel deploys web; Railway redeploys the worker. Verify `/api/health`.
4. Rollback: Vercel "Instant rollback"; migrations are forward-only — never drop a column in the same release that stops using it.

#### Backup / restore
`.github/workflows/db-backup.yml` dumps every 6h to R2 (30 days). Details: [deploy/railway-setup.md](../deploy/railway-setup.md#backups--recovery).
Restore: fetch the dump from R2, `psql "$DATABASE_URL" < dump.sql` into a fresh DB, then `npm run db:migrate`.
You also need `NEXTAUTH_SECRET` and `EMAIL_SECRET_KEY` (+ `_PREVIOUS`) from the password manager, or encrypted secrets are unreadable.

#### Secret rotation
- **Encryption key:** set the new `EMAIL_SECRET_KEY`, move the old value to `EMAIL_SECRET_KEY_PREVIOUS`, deploy, run `npm run encrypt:source-secrets` to re-encrypt, then drop `_PREVIOUS`. Set `SECRETS_STRICT=1` once nothing is plaintext.
- **NEXTAUTH_SECRET:** rotating signs everyone out (and invalidates the admin MFA step-up cookie).
- **Webhook/API keys:** revoke from Settings → API; keys also expire and are revoked when their user is removed.

#### Operator tasks
- Locked out of platform-admin MFA: `npm run admin:reset-mfa -- <email>`.
- Maintenance mode: toggle in the platform admin; the API returns 503 and writes are blocked.
- Audit logs prune after `AUDIT_RETENTION_DAYS` (default 730, min 90); processed `webhook_events` after 30 days (score-decay worker).

#### Troubleshooting
| Symptom | Check |
|---|---|
| Razorpay events ignored | `webhook_events` ledger (keyed on `x-razorpay-event-id`); signature secret; replayed events are no-ops by design |
| WhatsApp inbound not routed | Tenant webhook token URL; inbound routes to the org of the most recent outbound |
| 402 on exports/uploads/messages | Plan limit hit — see usage in the user menu; counters in `usage_counters` |
| Slow Postgres | `DB_POOL_MAX`, prepared statements off behind pgBouncer (see `src/db/index.ts`) |

---

## 6. Database Reference

> Source: `docs/DATABASE.md`

### Database reference

Generated by `node scripts/gen-db-doc.mjs` from the migrated schema — do not edit by hand. Every tenant table carries `organization_id` (NOT NULL).

#### Foreign keys

- `activities` FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE
- `activities` FOREIGN KEY (user_id) REFERENCES users(id)
- `ai_knowledge_docs` FOREIGN KEY (organization_id) REFERENCES organizations(id)
- `api_idempotency_keys` FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
- `api_idempotency_keys` FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
- `api_keys` FOREIGN KEY (created_by_id) REFERENCES users(id) ON DELETE SET NULL
- `api_keys` FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
- `assignment_rules` FOREIGN KEY (team_id) REFERENCES teams(id)
- `assignment_rules` FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
- `assignment_rules` FOREIGN KEY (user_id) REFERENCES users(id)
- `assignment_rules` FOREIGN KEY (last_assigned_user_id) REFERENCES users(id)
- `assignment_rules` FOREIGN KEY (source_id) REFERENCES lead_sources(id)
- `audit_logs` FOREIGN KEY (user_id) REFERENCES users(id)
- `audit_logs` FOREIGN KEY (organization_id) REFERENCES organizations(id)
- `automation_actions` FOREIGN KEY (automation_id) REFERENCES automations(id) ON DELETE CASCADE
- `automation_conditions` FOREIGN KEY (automation_id) REFERENCES automations(id) ON DELETE CASCADE
- `automation_runs` FOREIGN KEY (automation_id) REFERENCES automations(id) ON DELETE CASCADE
- `automation_runs` FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE
- `automation_triggers` FOREIGN KEY (automation_id) REFERENCES automations(id) ON DELETE CASCADE
- `automations` FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
- `crn_counters` FOREIGN KEY (organization_id) REFERENCES organizations(id)
- `custom_field_defs` FOREIGN KEY (organization_id) REFERENCES organizations(id)
- `custom_status_configs` FOREIGN KEY (organization_id) REFERENCES organizations(id)
- `daily_summary_snapshots` FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
- `device_tokens` FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
- `device_tokens` FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
- `email_settings` FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
- `email_verifications` FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
- `follow_ups` FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE
- `follow_ups` FOREIGN KEY (user_id) REFERENCES users(id)
- `google_credentials` FOREIGN KEY (user_id) REFERENCES users(id)
- `integration_accounts` FOREIGN KEY (integration_id) REFERENCES integrations(id)
- `invitations` FOREIGN KEY (organization_id) REFERENCES organizations(id)
- `invitations` FOREIGN KEY (role_id) REFERENCES roles(id)
- `invitations` FOREIGN KEY (invited_by_id) REFERENCES users(id)
- `lead_attachments` FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE
- `lead_attachments` FOREIGN KEY (organization_id) REFERENCES organizations(id)
- `lead_attachments` FOREIGN KEY (uploaded_by_id) REFERENCES users(id)
- `lead_counters` FOREIGN KEY (organization_id) REFERENCES organizations(id)
- `lead_distribution_deliveries` FOREIGN KEY (organization_id) REFERENCES organizations(id)
- `lead_distribution_deliveries` FOREIGN KEY (rule_id) REFERENCES lead_distribution_rules(id) ON DELETE CASCADE
- `lead_distribution_rules` FOREIGN KEY (organization_id) REFERENCES organizations(id)
- `lead_distribution_rules` FOREIGN KEY (source_id) REFERENCES lead_sources(id)
- `lead_pipeline_stages` FOREIGN KEY (organization_id) REFERENCES organizations(id)
- `lead_pipeline_stages` FOREIGN KEY (pipeline_id) REFERENCES lead_pipelines(id)
- `lead_pipelines` FOREIGN KEY (organization_id) REFERENCES organizations(id)
- `lead_seq_counters` FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE
- `lead_sources` FOREIGN KEY (organization_id) REFERENCES organizations(id)
- `lead_status_history` FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE
- `lead_status_history` FOREIGN KEY (changed_by_id) REFERENCES users(id)
- `lead_tags` FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE
- `lead_tags` FOREIGN KEY (tag_id) REFERENCES tags(id)
- `leads` FOREIGN KEY (source_id) REFERENCES lead_sources(id)
- `leads` FOREIGN KEY (stage_id) REFERENCES lead_pipeline_stages(id)
- `leads` FOREIGN KEY (pipeline_id) REFERENCES lead_pipelines(id)
- `leads` FOREIGN KEY (deleted_by) REFERENCES users(id)
- `leads` FOREIGN KEY (team_id) REFERENCES teams(id)
- `leads` FOREIGN KEY (organization_id) REFERENCES organizations(id)
- `leads` FOREIGN KEY (owner_id) REFERENCES users(id)
- `meeting_locations` FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
- `meetings` FOREIGN KEY (organizer_id) REFERENCES users(id) ON DELETE SET NULL
- `meetings` FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
- `meetings` FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE
- `meetings` FOREIGN KEY (assignee_id) REFERENCES users(id) ON DELETE SET NULL
- `meetings` FOREIGN KEY (google_event_owner_id) REFERENCES users(id) ON DELETE SET NULL
- `message_templates` FOREIGN KEY (organization_id) REFERENCES organizations(id)
- `notifications` FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL
- `notifications` FOREIGN KEY (user_id) REFERENCES users(id)
- `push_subscriptions` FOREIGN KEY (user_id) REFERENCES users(id)
- `reminders` FOREIGN KEY (follow_up_id) REFERENCES follow_ups(id) ON DELETE CASCADE
- `roles` FOREIGN KEY (organization_id) REFERENCES organizations(id)
- `saved_views` FOREIGN KEY (user_id) REFERENCES users(id)
- `saved_views` FOREIGN KEY (organization_id) REFERENCES organizations(id)
- `sequence_enrollments` FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE
- `sequence_enrollments` FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
- `sequence_enrollments` FOREIGN KEY (sequence_id) REFERENCES sequences(id) ON DELETE CASCADE
- `sequence_steps` FOREIGN KEY (sequence_id) REFERENCES sequences(id) ON DELETE CASCADE
- `sequences` FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
- `shared_link_views` FOREIGN KEY (shared_link_id) REFERENCES shared_links(id) ON DELETE CASCADE
- `shared_links` FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
- `shared_links` FOREIGN KEY (owner_id) REFERENCES users(id)
- `shared_links` FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE
- `support_tickets` FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE
- `tags` FOREIGN KEY (organization_id) REFERENCES organizations(id)
- `teams` FOREIGN KEY (organization_id) REFERENCES organizations(id)
- `tenant_integration_settings` FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
- `usage_counters` FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
- `users` FOREIGN KEY (organization_id) REFERENCES organizations(id)
- `users` FOREIGN KEY (team_id) REFERENCES teams(id)
- `users` FOREIGN KEY (role_id) REFERENCES roles(id)
- `webhook_deliveries` FOREIGN KEY (organization_id) REFERENCES organizations(id)
- `webhook_endpoints` FOREIGN KEY (organization_id) REFERENCES organizations(id)
- `whatsapp_messages` FOREIGN KEY (user_id) REFERENCES users(id)
- `whatsapp_messages` FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE

#### activities

| column | type | null |
|---|---|---|
| id | uuid |  |
| lead_id | uuid |  |
| user_id | uuid | yes |
| type | character varying |  |
| content | text | yes |
| occurred_at | timestamp without time zone |  |
| created_at | timestamp without time zone |  |
| updated_at | timestamp without time zone |  |
| duration_sec | integer | yes |
| external_ref | character varying | yes |
| seq | integer | yes |

#### ai_knowledge_docs

| column | type | null |
|---|---|---|
| id | uuid |  |
| organization_id | uuid |  |
| title | character varying |  |
| content | text |  |
| created_at | timestamp without time zone |  |

#### api_idempotency_keys

| column | type | null |
|---|---|---|
| id | uuid |  |
| organization_id | uuid |  |
| user_id | uuid | yes |
| key | character varying |  |
| route | character varying |  |
| status | integer | yes |
| response | jsonb | yes |
| created_at | timestamp without time zone |  |

#### api_keys

| column | type | null |
|---|---|---|
| id | uuid |  |
| organization_id | uuid |  |
| name | character varying |  |
| key_hash | character varying |  |
| prefix | character varying |  |
| created_by_id | uuid | yes |
| last_used_at | timestamp without time zone | yes |
| revoked_at | timestamp without time zone | yes |
| created_at | timestamp without time zone |  |
| scope | character varying |  |
| expires_at | timestamp without time zone | yes |
| scopes | jsonb | yes |

#### assignment_rules

| column | type | null |
|---|---|---|
| id | uuid |  |
| source_id | uuid | yes |
| team_id | uuid | yes |
| user_id | uuid | yes |
| type | character varying |  |
| last_assigned_user_id | uuid | yes |
| priority | integer |  |
| created_at | timestamp without time zone |  |
| organization_id | uuid |  |

#### audit_logs

| column | type | null |
|---|---|---|
| id | uuid |  |
| organization_id | uuid |  |
| user_id | uuid | yes |
| action | character varying |  |
| entity_type | character varying | yes |
| entity_id | uuid | yes |
| metadata | jsonb | yes |
| created_at | timestamp without time zone |  |
| actor_name | character varying | yes |
| actor_email | character varying | yes |

#### automation_actions

| column | type | null |
|---|---|---|
| id | uuid |  |
| automation_id | uuid |  |
| type | character varying |  |
| config | jsonb | yes |
| order_index | integer | yes |

#### automation_conditions

| column | type | null |
|---|---|---|
| id | uuid |  |
| automation_id | uuid |  |
| config | jsonb | yes |

#### automation_runs

| column | type | null |
|---|---|---|
| id | uuid |  |
| automation_id | uuid |  |
| lead_id | uuid | yes |
| status | character varying |  |
| error | character varying | yes |
| started_at | timestamp without time zone |  |
| completed_at | timestamp without time zone | yes |
| idempotency_key | character varying | yes |
| retry_count | integer |  |

#### automation_triggers

| column | type | null |
|---|---|---|
| id | uuid |  |
| automation_id | uuid |  |
| type | character varying |  |
| config | jsonb | yes |

#### automations

| column | type | null |
|---|---|---|
| id | uuid |  |
| name | character varying |  |
| is_active | boolean |  |
| created_at | timestamp without time zone |  |
| updated_at | timestamp without time zone |  |
| organization_id | uuid |  |

#### crn_counters

| column | type | null |
|---|---|---|
| organization_id | uuid |  |
| period | character varying |  |
| last_value | integer |  |

#### custom_field_defs

| column | type | null |
|---|---|---|
| id | uuid |  |
| organization_id | uuid |  |
| key | character varying |  |
| label | character varying |  |
| type | character varying |  |
| options | jsonb | yes |
| required | boolean |  |
| order_index | integer |  |
| created_at | timestamp without time zone |  |
| default_value | text | yes |
| disabled | boolean |  |
| admin_only | boolean |  |
| show_on_table | boolean |  |
| section | character varying | yes |
| subsection | character varying | yes |

#### custom_status_configs

| column | type | null |
|---|---|---|
| id | uuid |  |
| organization_id | uuid |  |
| key | character varying |  |
| label | character varying |  |
| color | character varying |  |
| category | character varying |  |
| order_index | integer |  |
| is_system_default | integer |  |
| created_at | timestamp without time zone |  |

#### daily_summary_snapshots

| column | type | null |
|---|---|---|
| organization_id | uuid |  |
| day | character varying |  |
| counts | jsonb |  |
| updated_at | timestamp without time zone |  |

#### device_tokens

| column | type | null |
|---|---|---|
| id | uuid |  |
| user_id | uuid |  |
| organization_id | uuid |  |
| token | character varying |  |
| platform | character varying | yes |
| created_at | timestamp without time zone |  |
| updated_at | timestamp without time zone |  |

#### email_settings

| column | type | null |
|---|---|---|
| id | uuid |  |
| organization_id | uuid |  |
| from_name | character varying | yes |
| from_email | character varying | yes |
| smtp_host | character varying | yes |
| smtp_port | integer | yes |
| smtp_secure | integer |  |
| smtp_user | character varying | yes |
| smtp_password_enc | text | yes |
| enabled | integer |  |
| created_at | timestamp without time zone |  |
| updated_at | timestamp without time zone |  |
| reply_to | character varying | yes |
| verified_at | timestamp without time zone | yes |
| last_error | text | yes |
| last_error_at | timestamp without time zone | yes |

#### email_verifications

| column | type | null |
|---|---|---|
| id | uuid |  |
| user_id | uuid |  |
| email | character varying |  |
| token_hash | character varying |  |
| expires_at | timestamp without time zone |  |
| used_at | timestamp without time zone | yes |
| created_at | timestamp without time zone |  |

#### follow_ups

| column | type | null |
|---|---|---|
| id | uuid |  |
| lead_id | uuid |  |
| user_id | uuid | yes |
| type | character varying |  |
| title | character varying |  |
| description | text | yes |
| status | character varying |  |
| due_at | timestamp without time zone |  |
| snoozed_until | timestamp without time zone | yes |
| completed_at | timestamp without time zone | yes |
| created_at | timestamp without time zone |  |
| updated_at | timestamp without time zone |  |
| overdue_notified_at | timestamp without time zone | yes |

#### google_credentials

| column | type | null |
|---|---|---|
| user_id | uuid |  |
| access_token | text |  |
| refresh_token | text | yes |
| expiry_date | timestamp without time zone | yes |
| calendar_id | character varying |  |
| created_at | timestamp without time zone |  |
| updated_at | timestamp without time zone |  |

#### integration_accounts

| column | type | null |
|---|---|---|
| id | uuid |  |
| integration_id | uuid |  |
| credentials | jsonb |  |
| status | character varying | yes |
| created_at | timestamp without time zone |  |
| updated_at | timestamp without time zone |  |

#### integrations

| column | type | null |
|---|---|---|
| id | uuid |  |
| name | character varying |  |
| provider | character varying |  |
| created_at | timestamp without time zone |  |

#### invitations

| column | type | null |
|---|---|---|
| id | uuid |  |
| organization_id | uuid |  |
| email | character varying |  |
| role_id | uuid | yes |
| token_hash | character varying |  |
| invited_by_id | uuid | yes |
| expires_at | timestamp without time zone |  |
| accepted_at | timestamp without time zone | yes |
| created_at | timestamp without time zone |  |

#### lead_attachments

| column | type | null |
|---|---|---|
| id | uuid |  |
| lead_id | uuid |  |
| organization_id | uuid | yes |
| file_name | character varying |  |
| file_url | text |  |
| file_size | integer | yes |
| file_type | character varying | yes |
| uploaded_by_id | uuid | yes |
| created_at | timestamp without time zone |  |

#### lead_counters

| column | type | null |
|---|---|---|
| organization_id | uuid |  |
| last_value | integer |  |

#### lead_distribution_deliveries

| column | type | null |
|---|---|---|
| id | uuid |  |
| organization_id | uuid |  |
| rule_id | uuid |  |
| lead_id | uuid | yes |
| channel | character varying |  |
| recipient | character varying |  |
| status | character varying |  |
| error | text | yes |
| is_test | integer |  |
| created_at | timestamp without time zone |  |

#### lead_distribution_rules

| column | type | null |
|---|---|---|
| id | uuid |  |
| organization_id | uuid |  |
| name | character varying | yes |
| source_id | uuid | yes |
| conditions | jsonb |  |
| recipients | jsonb |  |
| mode | character varying |  |
| rr_cursor | integer |  |
| skip_save | integer |  |
| is_active | integer |  |
| created_at | timestamp without time zone |  |

#### lead_ingestion_logs

| column | type | null |
|---|---|---|
| id | uuid |  |
| lead_id | uuid | yes |
| source_id | character varying |  |
| original_payload | jsonb | yes |
| status | character varying |  |
| error | text | yes |
| created_at | timestamp without time zone |  |

#### lead_pipeline_stages

| column | type | null |
|---|---|---|
| id | uuid |  |
| pipeline_id | uuid |  |
| name | character varying |  |
| order_index | integer |  |
| organization_id | uuid |  |

#### lead_pipelines

| column | type | null |
|---|---|---|
| id | uuid |  |
| name | character varying |  |
| created_at | timestamp without time zone |  |
| organization_id | uuid |  |

#### lead_seq_counters

| column | type | null |
|---|---|---|
| lead_id | uuid |  |
| kind | character varying |  |
| last_value | integer |  |

#### lead_sources

| column | type | null |
|---|---|---|
| id | uuid |  |
| name | character varying |  |
| type | character varying | yes |
| is_active | integer |  |
| config | jsonb | yes |
| webhook_secret | character varying | yes |
| created_at | timestamp without time zone |  |
| organization_id | uuid |  |
| ai_context | text | yes |

#### lead_status_history

| column | type | null |
|---|---|---|
| id | uuid |  |
| lead_id | uuid |  |
| old_status | character varying | yes |
| new_status | character varying |  |
| changed_by_id | uuid | yes |
| created_at | timestamp without time zone |  |
| seq | integer | yes |

#### lead_tags

| column | type | null |
|---|---|---|
| lead_id | uuid |  |
| tag_id | uuid |  |

#### leads

| column | type | null |
|---|---|---|
| id | uuid |  |
| name | character varying |  |
| phone | character varying | yes |
| email | character varying | yes |
| company | character varying | yes |
| source_id | uuid | yes |
| owner_id | uuid | yes |
| team_id | uuid | yes |
| pipeline_id | uuid | yes |
| stage_id | uuid | yes |
| status | character varying |  |
| priority | character varying | yes |
| score | integer | yes |
| expected_value | numeric | yes |
| custom_data | jsonb | yes |
| next_follow_up_at | timestamp without time zone | yes |
| last_contacted_at | timestamp without time zone | yes |
| created_at | timestamp without time zone |  |
| updated_at | timestamp without time zone |  |
| organization_id | uuid |  |
| escalated_at | timestamp without time zone | yes |
| lost_reason | character varying | yes |
| won_at | timestamp without time zone | yes |
| deleted_at | timestamp without time zone | yes |
| deleted_by | uuid | yes |
| display_id | integer | yes |
| first_contacted_at | timestamp without time zone | yes |
| sync_at | timestamp without time zone |  |
| crn | character varying | yes |

#### legacy_id_mappings

| column | type | null |
|---|---|---|
| id | uuid |  |
| legacy_id | character varying |  |
| legacy_type | character varying |  |
| new_id | uuid |  |
| created_at | timestamp without time zone |  |

#### meeting_locations

| column | type | null |
|---|---|---|
| id | uuid |  |
| organization_id | uuid |  |
| name | character varying |  |
| address | text | yes |
| map_url | text | yes |
| phone | character varying | yes |
| created_at | timestamp without time zone |  |

#### meetings

| column | type | null |
|---|---|---|
| id | uuid |  |
| organization_id | uuid |  |
| lead_id | uuid |  |
| organizer_id | uuid | yes |
| assignee_id | uuid | yes |
| mode | character varying |  |
| title | character varying |  |
| start_at | timestamp without time zone |  |
| duration_minutes | integer |  |
| location_name | character varying | yes |
| address | text | yes |
| map_url | text | yes |
| meeting_url | text | yes |
| notes | text | yes |
| status | character varying |  |
| outcome | text | yes |
| completed_at | timestamp without time zone | yes |
| checked_in_at | timestamp without time zone | yes |
| check_in_lat | double precision | yes |
| check_in_lng | double precision | yes |
| google_event_id | character varying | yes |
| google_event_owner_id | uuid | yes |
| booked_at | timestamp without time zone |  |
| lead_reminder_24h_sent_at | timestamp without time zone | yes |
| lead_reminder_1h_sent_at | timestamp without time zone | yes |
| rep_reminder_sent_at | timestamp without time zone | yes |
| outcome_prompt_sent_at | timestamp without time zone | yes |
| created_at | timestamp without time zone |  |
| updated_at | timestamp without time zone |  |
| co_attendee_ids | ARRAY |  |

#### message_templates

| column | type | null |
|---|---|---|
| id | uuid |  |
| name | character varying |  |
| channel | character varying |  |
| subject | character varying | yes |
| body | text |  |
| created_at | timestamp without time zone |  |
| updated_at | timestamp without time zone |  |
| organization_id | uuid | yes |

#### notifications

| column | type | null |
|---|---|---|
| id | uuid |  |
| user_id | uuid |  |
| type | character varying |  |
| title | character varying |  |
| body | text | yes |
| lead_id | uuid | yes |
| read_at | timestamp without time zone | yes |
| created_at | timestamp without time zone |  |

#### organizations

| column | type | null |
|---|---|---|
| id | uuid |  |
| name | character varying |  |
| slug | character varying |  |
| plan | character varying |  |
| created_at | timestamp without time zone |  |
| timezone | character varying |  |
| locale | character varying |  |
| currency | character varying |  |
| date_format | character varying |  |
| industry | character varying | yes |
| phone | character varying | yes |
| website | character varying | yes |
| address_line1 | character varying | yes |
| city | character varying | yes |
| country | character varying | yes |
| required_lead_fields | jsonb |  |
| sla_hours | integer | yes |
| razorpay_customer_id | character varying | yes |
| razorpay_subscription_id | character varying | yes |
| plan_status | character varying |  |
| current_period_end | timestamp without time zone | yes |
| whatsapp_mode | character varying |  |
| suspended_at | timestamp without time zone | yes |
| ai_context | text | yes |
| auto_merge_duplicates | integer |  |
| sequence_window_start | integer | yes |
| sequence_window_end | integer | yes |
| updated_at | timestamp without time zone |  |
| trial_ends_at | timestamp without time zone | yes |
| meeting_confirm_template | character varying | yes |
| meeting_reminder_template | character varying | yes |
| meeting_template_language | character varying |  |
| daily_summary | integer |  |
| daily_summary_sent_on | character varying | yes |
| ai_credits_used | integer |  |
| ai_credits_period | character varying | yes |
| work_days | jsonb |  |
| work_start_hour | integer |  |
| work_end_hour | integer |  |
| cancel_at_period_end | integer |  |
| billing_name | character varying | yes |
| gstin | character varying | yes |
| complimentary | integer |  |
| complimentary_until | timestamp without time zone | yes |
| complimentary_note | character varying | yes |
| lead_field_config | jsonb | yes |
| billing_email | character varying | yes |
| ai_profile | jsonb |  |
| ai_context_history | jsonb |  |

#### password_resets

| column | type | null |
|---|---|---|
| id | uuid |  |
| email | character varying |  |
| token_hash | character varying |  |
| expires_at | timestamp without time zone |  |
| used_at | timestamp without time zone | yes |
| created_at | timestamp without time zone |  |

#### phone_otps

| column | type | null |
|---|---|---|
| id | uuid |  |
| phone | character varying |  |
| otp_hash | character varying |  |
| expires_at | timestamp without time zone |  |
| used_at | timestamp without time zone | yes |
| attempts | integer |  |
| created_at | timestamp without time zone |  |

#### platform_configs

| column | type | null |
|---|---|---|
| key | character varying |  |
| value | jsonb |  |
| updated_at | timestamp without time zone |  |

#### push_subscriptions

| column | type | null |
|---|---|---|
| id | uuid |  |
| user_id | uuid |  |
| endpoint | text |  |
| p256dh | character varying |  |
| auth | character varying |  |
| created_at | timestamp without time zone |  |

#### reminders

| column | type | null |
|---|---|---|
| id | uuid |  |
| follow_up_id | uuid |  |
| remind_at | timestamp without time zone |  |
| sent_at | timestamp without time zone | yes |
| created_at | timestamp without time zone |  |

#### roles

| column | type | null |
|---|---|---|
| id | uuid |  |
| name | character varying |  |
| description | text | yes |
| created_at | timestamp without time zone |  |
| updated_at | timestamp without time zone |  |
| organization_id | uuid | yes |
| permissions | jsonb |  |

#### saved_views

| column | type | null |
|---|---|---|
| id | uuid |  |
| organization_id | uuid |  |
| user_id | uuid | yes |
| name | character varying |  |
| filters | jsonb |  |
| sort_field | character varying | yes |
| sort_order | character varying | yes |
| is_preset | integer |  |
| created_at | timestamp without time zone |  |
| updated_at | timestamp without time zone |  |

#### sequence_enrollments

| column | type | null |
|---|---|---|
| id | uuid |  |
| sequence_id | uuid |  |
| lead_id | uuid |  |
| organization_id | uuid |  |
| current_step | integer |  |
| status | character varying |  |
| next_run_at | timestamp without time zone | yes |
| created_at | timestamp without time zone |  |
| retry_count | integer |  |
| paused_at | timestamp without time zone | yes |

#### sequence_steps

| column | type | null |
|---|---|---|
| id | uuid |  |
| sequence_id | uuid |  |
| step_index | integer |  |
| day_offset | integer |  |
| channel | character varying |  |
| body | text |  |
| attachment_url | character varying | yes |
| attachment_name | character varying | yes |

#### sequences

| column | type | null |
|---|---|---|
| id | uuid |  |
| organization_id | uuid |  |
| name | character varying |  |
| is_active | boolean |  |
| created_at | timestamp without time zone |  |
| description | text | yes |

#### shared_link_views

| column | type | null |
|---|---|---|
| id | uuid |  |
| shared_link_id | uuid |  |
| viewed_at | timestamp without time zone |  |
| user_agent | character varying | yes |

#### shared_links

| column | type | null |
|---|---|---|
| id | uuid |  |
| organization_id | uuid |  |
| lead_id | uuid |  |
| owner_id | uuid | yes |
| slug | character varying |  |
| title | character varying |  |
| target_url | character varying | yes |
| view_count | integer |  |
| last_viewed_at | timestamp without time zone | yes |
| created_at | timestamp without time zone |  |
| body_text | text | yes |
| image_url | character varying | yes |

#### support_tickets

| column | type | null |
|---|---|---|
| id | character varying |  |
| org_id | uuid |  |
| org_name | character varying |  |
| user_id | uuid |  |
| user_email | character varying |  |
| subject | text |  |
| category | character varying |  |
| priority | character varying |  |
| status | character varying |  |
| assigned_to | character varying | yes |
| sla_deadline | timestamp without time zone |  |
| messages | jsonb |  |
| internal_notes | jsonb |  |
| created_at | timestamp without time zone |  |
| updated_at | timestamp without time zone |  |
| sla_alerted_at | timestamp without time zone | yes |

#### tags

| column | type | null |
|---|---|---|
| id | uuid |  |
| name | character varying |  |
| created_at | timestamp without time zone |  |
| organization_id | uuid |  |

#### tax_invoices

| column | type | null |
|---|---|---|
| id | character varying |  |
| invoice_number | character varying |  |
| org_id | uuid |  |
| org_name | character varying |  |
| buyer_name | character varying | yes |
| plan | character varying |  |
| amount | numeric |  |
| tax_rate | numeric |  |
| tax_amount | numeric |  |
| cgst | numeric | yes |
| sgst | numeric | yes |
| igst | numeric | yes |
| place_of_supply | character varying | yes |
| total_amount | numeric |  |
| sac_code | character varying |  |
| gstin | character varying | yes |
| status | character varying |  |
| type | character varying |  |
| original_invoice_id | character varying | yes |
| payment_id | character varying | yes |
| issued_at | timestamp without time zone |  |
| paid_at | timestamp without time zone | yes |
| period_start | timestamp without time zone |  |
| period_end | timestamp without time zone |  |

#### teams

| column | type | null |
|---|---|---|
| id | uuid |  |
| name | character varying |  |
| created_at | timestamp without time zone |  |
| updated_at | timestamp without time zone |  |
| organization_id | uuid |  |

#### tenant_integration_settings

| column | type | null |
|---|---|---|
| id | uuid |  |
| organization_id | uuid |  |
| enrichment_enabled | integer |  |
| enrichment_api_url | character varying | yes |
| enrichment_auth_header | character varying | yes |
| enrichment_auth_value_enc | text | yes |
| enrichment_timeout_ms | integer | yes |
| inbound_email_enabled | integer |  |
| inbound_email_token | character varying | yes |
| created_at | timestamp without time zone |  |
| updated_at | timestamp without time zone |  |
| capi_enabled | integer |  |
| capi_pixel_id | character varying | yes |
| capi_access_token_enc | text | yes |
| capi_test_event_code | character varying | yes |
| capi_lead_stage_map | jsonb | yes |
| capi_last_status | character varying | yes |
| capi_last_error | text | yes |
| capi_last_at | timestamp without time zone | yes |
| capi_token_expires_at | timestamp without time zone | yes |
| whatsapp_enabled | integer |  |
| whatsapp_api_key_enc | text | yes |
| whatsapp_tenant_id | character varying | yes |
| whatsapp_inbound_token | character varying | yes |

#### usage_counters

| column | type | null |
|---|---|---|
| organization_id | uuid |  |
| period | character varying |  |
| metric | character varying |  |
| used | integer |  |
| updated_at | timestamp without time zone |  |

#### users

| column | type | null |
|---|---|---|
| id | uuid |  |
| email | character varying | yes |
| password_hash | character varying |  |
| first_name | character varying | yes |
| last_name | character varying | yes |
| role_id | uuid | yes |
| team_id | uuid | yes |
| is_active | boolean |  |
| created_at | timestamp without time zone |  |
| updated_at | timestamp without time zone |  |
| organization_id | uuid | yes |
| deleted_at | timestamp without time zone | yes |
| email_opt_out | jsonb |  |
| is_super_admin | boolean |  |
| phone | character varying | yes |
| language | character varying |  |
| last_call_sync_at | timestamp without time zone | yes |
| password_set | boolean |  |
| signup_method | character varying | yes |
| email_verified_at | timestamp without time zone | yes |
| google_linked_at | timestamp without time zone | yes |
| totp_secret | text | yes |
| totp_enabled_at | timestamp without time zone | yes |

#### webhook_deliveries

| column | type | null |
|---|---|---|
| id | uuid |  |
| organization_id | uuid |  |
| endpoint_id | uuid | yes |
| job_id | character varying | yes |
| event_id | character varying |  |
| event | character varying |  |
| url | character varying |  |
| status | character varying |  |
| attempts | integer |  |
| last_status_code | integer | yes |
| error_reason | text | yes |
| payload | jsonb |  |
| created_at | timestamp without time zone |  |
| updated_at | timestamp without time zone |  |

#### webhook_endpoints

| column | type | null |
|---|---|---|
| id | uuid |  |
| organization_id | uuid |  |
| url | character varying |  |
| secret | character varying |  |
| events | jsonb |  |
| is_active | integer |  |
| created_at | timestamp without time zone |  |

#### webhook_events

| column | type | null |
|---|---|---|
| id | uuid |  |
| provider | character varying |  |
| payload | jsonb |  |
| status | character varying | yes |
| idempotency_key | character varying | yes |
| retry_count | integer |  |
| error_log | jsonb | yes |
| processed_at | timestamp without time zone | yes |
| created_at | timestamp without time zone |  |

#### whatsapp_messages

| column | type | null |
|---|---|---|
| id | uuid |  |
| lead_id | uuid |  |
| user_id | uuid | yes |
| direction | character varying |  |
| provider_message_id | character varying | yes |
| template_name | character varying | yes |
| body | text | yes |
| status | character varying |  |
| error | text | yes |
| created_at | timestamp without time zone |  |
| updated_at | timestamp without time zone |  |

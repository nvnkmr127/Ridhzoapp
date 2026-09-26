# Railway Migration Runbook

This guide covers migrating the backend stack (**PostgreSQL**, **Redis**, and **BullMQ worker**) from the DigitalOcean Droplet to [Railway](https://railway.app).

Your Next.js web application continues to run on **Vercel**, connecting securely to Railway's managed Postgres and Redis instances via TCP proxies.

---

## Architecture Overview

| Component | Railway Service | Network Access |
|---|---|---|
| **PostgreSQL** | Managed Database Plugin | Private internal to Worker; Public TCP proxy to Vercel |
| **Redis** | Managed Database Plugin (`noeviction`) | Private internal to Worker; Public TCP proxy to Vercel |
| **Worker** | Dockerfile service (`deploy/Dockerfile.worker`) | Private internal connection to DB & Redis; auto-deploy on git push |
| **Web (Next.js)** | Vercel (existing) | Connects to Railway via Public TCP URLs |

---

## Step 1: Create Railway Project & Databases

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

## Step 2: Deploy the Background Worker Service

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

## Step 3: Database Schema & Data Migration

Choose either **Option A** (fresh schema) or **Option B** (migrate existing data from Droplet):

### Option A: Fresh Database Initialization
Run locally from this repository:
```bash
DATABASE_URL="<RAILWAY_POSTGRES_PUBLIC_URL>" npm run db:push
```

### Option B: Migrate Existing Droplet Data
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

## Step 4: Update Vercel Environment Variables

1. Go to your project on [Vercel](https://vercel.com) → **Settings** → **Environment Variables**.
2. Update the following variables:
   - **`DATABASE_URL`**: Set to Railway PostgreSQL **Public Connection URL**.
   - **`REDIS_URL`**: Set to Railway Redis **Public Connection URL**.
3. Trigger a redeployment in Vercel (or push a commit to redeploy).

---

## Step 5: Verify End-to-End

1. **Web App**: Open your Vercel URL. Confirm login works and leads load properly.
2. **Background Jobs**:
   - Create or assign a lead.
   - Check the Railway Worker service logs in Railway dashboard: you should see the event processed and queue job drained.
3. **Automated CI/CD**:
   - On every push to `main`, GitHub Actions will run test gates, and Railway will automatically build and redeploy the worker.

---

## Step 6: Decommission the Droplet

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

## Backups & Recovery

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

### One-time setup

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

### Recovery

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

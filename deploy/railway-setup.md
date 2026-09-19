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

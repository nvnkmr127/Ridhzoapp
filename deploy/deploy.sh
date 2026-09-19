#!/usr/bin/env bash
# Auto-deploy the privyr-worker on the droplet. Invoked by CI over SSH on every push to main
# (Vercel-style "push = deploy"), and safe to run by hand. Deploys exactly origin/main.
set -euo pipefail

cd "$(dirname "$0")/.."
echo "→ deploy start (was $(git rev-parse --short HEAD))"

git fetch --quiet origin main
git reset --hard origin/main       # match the pushed commit exactly; drop any local drift
npm ci                             # worker runs via tsx (a devDependency) — keep the full install

# ponytail: intentionally NO `drizzle-kit migrate` here. Neon's migration journal is empty (schema
# was created with `push`), so migrate would replay from 0000 and fail on existing tables. Apply
# schema changes by hand (e.g. ALTER TABLE ... ADD COLUMN) — see the deploy runbook.

sudo systemctl restart ridhzo-worker || sudo systemctl restart privyr-worker
sleep 2
sudo systemctl --no-pager --lines=8 status ridhzo-worker || sudo systemctl --no-pager --lines=8 status privyr-worker || true
echo "✓ deployed $(git rev-parse --short HEAD)"

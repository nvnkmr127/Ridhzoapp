import { validateEnv } from "@/lib/env";
import { startWorkers } from "@/lib/jobs/startWorkers";
import { closeAllWorkers, createRedis, WORKER_HEARTBEAT_KEY } from "@/lib/jobs/redis";

// Standalone background-worker process. Deploy this ALONGSIDE (not on) a serverless web app: the
// Vercel web app enqueues jobs, this long-lived process drains them. Run it on any always-on host
// (Railway, Render, Fly, a VM, docker) with the same env as the web app.
//   npm run worker
async function main() {
  validateEnv();

  if (!process.env.REDIS_URL) {
    console.error("[worker] REDIS_URL is required to run background workers. Set it and restart.");
    process.exit(1);
  }

  await startWorkers();
  // Liveness the web tier's /api/health can read: refreshed every 30 s, expires after 90 s of silence.
  const beat = createRedis();
  const tick = () => beat.set(WORKER_HEARTBEAT_KEY, String(Date.now()), "EX", 90).catch(() => {});
  void tick();
  setInterval(tick, 30_000).unref();
  console.log("[worker] up — draining queues. Ctrl+C to stop.");
  // The BullMQ workers keep the event loop alive; nothing else to do here.
}

let stopping = false;
for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    if (stopping) return;
    stopping = true;
    console.log(`[worker] ${sig} received — finishing running jobs, then exiting.`);
    // Stop taking new jobs, let in-flight ones finish (bounded), then exit.
    closeAllWorkers().finally(() => process.exit(0));
  });
}

main().catch((err) => {
  console.error("[worker] fatal startup error:", err);
  process.exit(1);
});

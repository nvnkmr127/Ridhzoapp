import { redisConfigured } from "./redis";

// Starts every background-job consumer + repeatable scheduler. Shared by two callers:
//   • the Next instrumentation hook — in-process, for local dev / a single long-lived Node server;
//   • the standalone worker entrypoint (src/worker.ts) — for a serverless web deploy (Vercel),
//     where the web app only ENQUEUES and a separate always-on process drains the queue.
// No-op (with a warning) when REDIS_URL is unset. Throws on a real startup failure so the caller
// decides what to do (the web server logs and continues; the worker process exits to be restarted).
export async function startWorkers(): Promise<void> {
  if (!redisConfigured()) {
    console.warn("[workers] REDIS_URL not set — background job workers disabled.");
    return;
  }

  // Bind the domain event handlers in THIS process. The event bus is in-process, so without this
  // the standalone worker would emit lead.created / lead.assigned into a void — no notifications,
  // push, activity logging, automations, or outbound webhooks for anything the worker ingests.
  // Idempotent: a global guard stops double-binding when the web process already loaded it.
  await import("@/lib/events/handlers");

  // Consumers whose worker is constructed at module load.
  await import("@/lib/jobs/workers/automationWorker");
  await import("@/lib/jobs/workers/ingestionWorker");

  // Consumers + their repeatable producer scans.
  const { createFollowUpReminderWorker, scheduleFollowUpReminderScan } = await import("@/lib/jobs/workers/followUpReminderWorker");
  createFollowUpReminderWorker();
  await scheduleFollowUpReminderScan();

  const { createEscalationWorker, scheduleEscalationScan } = await import("@/lib/jobs/workers/escalationWorker");
  createEscalationWorker();
  await scheduleEscalationScan();

  const { createScoreDecayWorker, scheduleScoreDecayScan } = await import("@/lib/jobs/workers/scoreDecayWorker");
  createScoreDecayWorker();
  await scheduleScoreDecayScan();

  const { createSequenceWorker, scheduleSequenceScan } = await import("@/lib/jobs/workers/sequenceWorker");
  createSequenceWorker();
  await scheduleSequenceScan();

  const { createRecycleBinWorker, scheduleRecycleBinScan } = await import("@/lib/jobs/workers/recycleBinWorker");
  createRecycleBinWorker();
  await scheduleRecycleBinScan();

  const { createAnomalyWorker, scheduleAnomalyScan } = await import("@/lib/jobs/workers/anomalyWorker");
  createAnomalyWorker();
  await scheduleAnomalyScan();

  const { createSuspensionRetentionWorker, scheduleSuspensionRetentionScan } = await import("@/lib/jobs/workers/suspensionRetentionWorker");
  createSuspensionRetentionWorker();
  await scheduleSuspensionRetentionScan();

  const { createTrialDowngradeWorker, scheduleTrialDowngradeScan } = await import("@/lib/jobs/workers/trialDowngradeWorker");
  createTrialDowngradeWorker();
  await scheduleTrialDowngradeScan();

  // Consumers with an external producer (event bus).
  const { createWebhookRetryWorker } = await import("@/lib/jobs/workers/webhookRetryWorker");
  createWebhookRetryWorker();

  const { createEnrichmentWorker } = await import("@/lib/jobs/workers/enrichmentWorker");
  createEnrichmentWorker();

  console.log("[workers] all background workers started.");
}

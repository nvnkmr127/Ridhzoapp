import { Worker, Queue, Job } from "bullmq";
import { createRedis, quietErrors } from "../redis";
import { ScoringService } from "@/domains/leads/scoringService";
import { db } from "@/db";
import { automationRuns, webhookEvents, auditLogs } from "@/db/schema";
import { and, eq, lt, inArray } from "drizzle-orm";

export const SCORE_DECAY_QUEUE_NAME = "score-decay";

// The automation_runs ledger grows with every trigger and is only ever read for the idempotency
// check (which the completed row satisfies) — terminal rows older than the window are dead weight.
// ponytail: piggybacked on the daily scan instead of a second scheduler; raise RETENTION_DAYS or
// split it out if run volume ever makes the single daily DELETE too heavy.
const RETENTION_DAYS = 30;
export async function pruneOldAutomationRuns(retentionDays = RETENTION_DAYS) {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  const deleted = await db
    .delete(automationRuns)
    .where(and(lt(automationRuns.startedAt, cutoff), inArray(automationRuns.status, ["completed", "skipped", "failed"])))
    .returning({ id: automationRuns.id });
  return deleted.length;
}

// webhook_events keeps the full inbound payload (lead PII) of every form/webhook/Facebook delivery. Once
// processed and past the window it is dead weight and a privacy liability. 'failed' and 'pending' rows
// are kept: they are replayed after a Facebook reconnect / by the pending sweeper.
const WEBHOOK_EVENT_RETENTION_DAYS = 30;
export async function pruneProcessedWebhookEvents(retentionDays = WEBHOOK_EVENT_RETENTION_DAYS) {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  const deleted = await db
    .delete(webhookEvents)
    .where(and(lt(webhookEvents.createdAt, cutoff), eq(webhookEvents.status, "processed")))
    .returning({ id: webhookEvents.id });
  return deleted.length;
}

// The audit log is the trail for security reviews and disputes, so it is kept long (default 2 years) but not
// forever: unbounded growth slows the audit screen and keeps personal data past any purpose. Override with
// AUDIT_RETENTION_DAYS (min 90 — never trim the recent trail).
export async function pruneOldAuditLogs() {
  const days = Math.max(90, Number(process.env.AUDIT_RETENTION_DAYS) || 730);
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const deleted = await db.delete(auditLogs).where(lt(auditLogs.createdAt, cutoff)).returning({ id: auditLogs.id });
  return deleted.length;
}

export interface ScoreDecayJobData {
  organizationId?: string;
  leadId?: string;
}

export async function processScoreDecayJob(job: Job<ScoreDecayJobData>) {
  console.log(`[SCORE_DECAY_WORKER] Processing score decay job ${job.id}`);

  if (job.data?.leadId) {
    const score = await ScoringService.updateLeadScore(job.data.leadId);
    console.log(`[SCORE_DECAY_WORKER] Recalculated score for lead ${job.data.leadId}: ${score}`);
    return { leadId: job.data.leadId, score };
  }

  const count = await ScoringService.recalculateAllScores(job.data?.organizationId);
  // Daily housekeeping slot: trim the automation_runs ledger while we're here (all-orgs pass only).
  const prunedRuns = await pruneOldAutomationRuns().catch((e) => {
    console.error("[SCORE_DECAY_WORKER] automation_runs prune failed:", e);
    return 0;
  });
  const prunedEvents = await pruneProcessedWebhookEvents().catch((e) => {
    console.error("[SCORE_DECAY_WORKER] webhook_events prune failed:", e);
    return 0;
  });
  const prunedAudit = await pruneOldAuditLogs().catch((e) => {
    console.error("[SCORE_DECAY_WORKER] audit_logs prune failed:", e);
    return 0;
  });
  console.log(`[SCORE_DECAY_WORKER] Processed score decay for ${count} leads (Org: ${job.data?.organizationId ?? "all"}); pruned ${prunedRuns} old automation runs, ${prunedEvents} processed webhook events, ${prunedAudit} expired audit entries`);
  return { processed: count, prunedRuns, prunedEvents, prunedAudit };
}

export function createScoreDecayWorker(redisUrl?: string) {
  const connection = createRedis({ maxRetriesPerRequest: null }, redisUrl);

  const worker = new Worker<ScoreDecayJobData>(
    SCORE_DECAY_QUEUE_NAME,
    async (job) => {
      return processScoreDecayJob(job);
    },
    { connection }
  );

  worker.on("failed", (job, err) => {
    console.error(`[SCORE_DECAY_WORKER] Job ${job?.id} failed with error:`, err);
  });
  quietErrors(worker);

  return worker;
}

// Producer: a daily repeating job that recalculates scores across all orgs. Without this the
// worker has nothing to consume. Call once at startup alongside createScoreDecayWorker().
export async function scheduleScoreDecayScan(redisUrl?: string) {
  const connection = createRedis({ maxRetriesPerRequest: null }, redisUrl);
  const queue = new Queue(SCORE_DECAY_QUEUE_NAME, { connection });
  await queue.upsertJobScheduler("score-decay-daily", { every: 24 * 60 * 60 * 1000 }, { name: "decay", opts: { removeOnComplete: true, removeOnFail: 20 } });
  return queue;
}

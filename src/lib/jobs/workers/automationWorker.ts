import { Queue, Worker, Job } from "bullmq";
import { createRedis, quietErrors } from "../redis";
import { db } from "@/db";
import { automationRuns } from "@/db/schema";
import { eq, lt } from "drizzle-orm";
import { AutomationEngine } from "@/lib/automation/engine";
import { EventPayload } from "@/lib/events/emitter";

const connection = createRedis({ maxRetriesPerRequest: null });

export const AUTOMATION_QUEUE_NAME = "automations";
export const automationQueue = new Queue(AUTOMATION_QUEUE_NAME, {
  connection,
  defaultJobOptions: { removeOnComplete: true, removeOnFail: 100 },
});

export interface AutomationJobData {
  automationId: string;
  leadId: string;
  triggerType: string;
  idempotencyKey: string;
  payload: EventPayload;
}

export const automationWorker = new Worker<AutomationJobData>(
  AUTOMATION_QUEUE_NAME,
  async (job: Job<AutomationJobData>) => {
    const { automationId, leadId, idempotencyKey, payload } = job.data;

    // 1. Check Idempotency (Prevent double runs)
    const [existingRun] = await db
      .select()
      .from(automationRuns)
      .where(eq(automationRuns.idempotencyKey, idempotencyKey))
      .limit(1);

    if (existingRun && (existingRun.status === 'completed' || existingRun.status === 'skipped')) {
      return { status: 'skipped', reason: 'already_run' };
    }

    // Register or get the run record
    let runId = existingRun?.id;
    if (!existingRun) {
      const [newRun] = await db.insert(automationRuns).values({
        automationId,
        leadId,
        idempotencyKey,
        status: 'running',
      }).onConflictDoNothing().returning();

      if (!newRun) {
        // Race condition: another worker inserted the record concurrently
        const [concurrentRun] = await db
          .select()
          .from(automationRuns)
          .where(eq(automationRuns.idempotencyKey, idempotencyKey))
          .limit(1);
        
        if (concurrentRun && (concurrentRun.status === 'completed' || concurrentRun.status === 'skipped')) {
          return { status: 'skipped', reason: 'already_run' };
        }
        runId = concurrentRun?.id;
      } else {
        runId = newRun.id;
      }
    } else {
      await db.update(automationRuns)
        .set({ status: 'running', retryCount: existingRun.retryCount + 1 })
        .where(eq(automationRuns.id, runId!));
    }

    if (!runId) {
      return { status: 'skipped', reason: 'concurrent_execution' };
    }

    try {
      // 2. Evaluate & Execute
      const result = await AutomationEngine.evaluateAndExecute(automationId, leadId, payload);

      if (result.skipped) {
        await db.update(automationRuns)
          .set({ status: 'skipped', error: 'Conditions not met', completedAt: new Date() })
          .where(eq(automationRuns.id, runId));
        return { status: 'skipped', reason: 'conditions_not_met' };
      }

      // Partial success still completes (no retry), but record which actions failed for visibility.
      const partial = (result as { failures?: string[] }).failures;
      await db.update(automationRuns)
        .set({ status: 'completed', completedAt: new Date(), error: partial && partial.length ? partial.join('; ') : null })
        .where(eq(automationRuns.id, runId));

      return { status: 'completed', executedActions: result.executedCount };

    } catch (error: any) {
      await db.update(automationRuns)
        .set({ 
          status: 'failed', 
          error: error.stack || error.message,
          completedAt: new Date() 
        })
        .where(eq(automationRuns.id, runId));
        
      throw error; // Let BullMQ handle the retry based on its config
    }
  },
  { connection, concurrency: 3 }
);
quietErrors(automationWorker);

/**
 * Retention cleanup for automation_runs table to prevent unbounded DB growth.
 */
export async function pruneOldAutomationRuns(retentionDays = 30) {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  return db.delete(automationRuns).where(lt(automationRuns.startedAt, cutoff));
}


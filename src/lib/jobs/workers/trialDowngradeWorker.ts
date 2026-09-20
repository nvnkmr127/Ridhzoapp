import { Worker, Queue } from "bullmq";
import { createRedis, quietErrors } from "../redis";
import { BillingLifecycleService } from "@/domains/billing/lifecycleService";

export const TRIAL_DOWNGRADE_QUEUE_NAME = "trial-downgrade-scan";

export async function processTrialDowngradeJob() {
  const result = await BillingLifecycleService.downgradeExpiredTrials();
  if (result.downgradedCount > 0) {
    console.log(`[TRIAL_DOWNGRADE_WORKER] Reverted ${result.downgradedCount} expired trials to free`);
  }
  return result;
}

export function createTrialDowngradeWorker(redisUrl?: string) {
  const connection = createRedis({ maxRetriesPerRequest: null }, redisUrl);
  const worker = new Worker(TRIAL_DOWNGRADE_QUEUE_NAME, processTrialDowngradeJob, { connection });
  worker.on("failed", (job, err) =>
    console.error(`[TRIAL_DOWNGRADE_WORKER] Job ${job?.id} failed:`, err)
  );
  quietErrors(worker);
  return worker;
}

// Hourly scan for expired prospect trials
export async function scheduleTrialDowngradeScan(redisUrl?: string) {
  const connection = createRedis({ maxRetriesPerRequest: null }, redisUrl);
  const queue = new Queue(TRIAL_DOWNGRADE_QUEUE_NAME, { connection });
  await queue.upsertJobScheduler(
    "trial-downgrade-scan",
    { every: 60 * 60 * 1000 },
    { name: "scan", opts: { removeOnComplete: true, removeOnFail: 20 } }
  );
  return queue;
}

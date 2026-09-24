import { Worker, Queue } from "bullmq";
import { createRedis, quietErrors } from "../redis";
import { DailySummaryService } from "@/domains/organizations/dailySummaryService";

export const DAILY_SUMMARY_QUEUE_NAME = "daily-summary-scan";

// Hourly: each org gets its team summary once, in its own 8–11 AM window (see DailySummaryService).
export function createDailySummaryWorker(redisUrl?: string) {
  const connection = createRedis({ maxRetriesPerRequest: null }, redisUrl);
  const worker = new Worker(DAILY_SUMMARY_QUEUE_NAME, () => DailySummaryService.runDue(), { connection });
  worker.on("failed", (job, err) => console.error(`[DAILY_SUMMARY_WORKER] Job ${job?.id} failed:`, err));
  quietErrors(worker);
  return worker;
}

export async function scheduleDailySummaryScan(redisUrl?: string) {
  const connection = createRedis({ maxRetriesPerRequest: null }, redisUrl);
  const queue = new Queue(DAILY_SUMMARY_QUEUE_NAME, { connection });
  await queue.upsertJobScheduler(
    "daily-summary-scan",
    { every: 60 * 60 * 1000 },
    { name: "scan", opts: { removeOnComplete: true, removeOnFail: 20 } },
  );
  return queue;
}

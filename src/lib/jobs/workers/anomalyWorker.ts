import { Worker, Queue } from "bullmq";
import { createRedis, quietErrors } from "../redis";
import { AnomalyDetectionService } from "@/domains/platform/anomalyDetectionService";

export const ANOMALY_QUEUE_NAME = "anomaly-scan";

export async function processAnomalyJob() {
  const anomalies = await AnomalyDetectionService.scanAndCacheAnomalies();
  const activeCount = anomalies.filter((a) => a.status === "active").length;
  if (activeCount > 0) {
    console.log(`[ANOMALY_WORKER] Fleet scan detected ${activeCount} active security anomalies`);
  }
  return { scannedCount: anomalies.length, activeCount };
}

export function createAnomalyWorker(redisUrl?: string) {
  const connection = createRedis({ maxRetriesPerRequest: null }, redisUrl);
  const worker = new Worker(ANOMALY_QUEUE_NAME, processAnomalyJob, { connection });
  worker.on("failed", (job, err) => console.error(`[ANOMALY_WORKER] Job ${job?.id} failed:`, err));
  quietErrors(worker);
  return worker;
}

// 15-minute repeatable scan that inspects cross-tenant anomalies and caches results.
export async function scheduleAnomalyScan(redisUrl?: string) {
  const connection = createRedis({ maxRetriesPerRequest: null }, redisUrl);
  const queue = new Queue(ANOMALY_QUEUE_NAME, { connection });
  await queue.upsertJobScheduler(
    "anomaly-scan",
    { every: 15 * 60 * 1000 },
    { name: "scan", opts: { removeOnComplete: true, removeOnFail: 20 } }
  );
  return queue;
}

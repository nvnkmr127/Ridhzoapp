import { Worker, Queue } from "bullmq";
import { createRedis, quietErrors } from "../redis";
import { ComplianceService } from "@/domains/platform/complianceService";

export const SUSPENSION_RETENTION_QUEUE_NAME = "suspension-retention-purge";

export async function processSuspensionRetentionJob() {
  const result = await ComplianceService.processSuspensionRetention();
  if (result.warnedCount > 0 || result.anonymizedCount > 0) {
    console.log(
      `[SUSPENSION_RETENTION_WORKER] Scanned ${result.scannedCount} suspended tenants: warned ${result.warnedCount}, anonymized ${result.anonymizedCount}`
    );
  }
  return result;
}

export function createSuspensionRetentionWorker(redisUrl?: string) {
  const connection = createRedis({ maxRetriesPerRequest: null }, redisUrl);
  const worker = new Worker(SUSPENSION_RETENTION_QUEUE_NAME, processSuspensionRetentionJob, { connection });
  worker.on("failed", (job, err) =>
    console.error(`[SUSPENSION_RETENTION_WORKER] Job ${job?.id} failed:`, err)
  );
  quietErrors(worker);
  return worker;
}

// Daily scan for long-suspended tenants (180-day retention policy)
export async function scheduleSuspensionRetentionScan(redisUrl?: string) {
  const connection = createRedis({ maxRetriesPerRequest: null }, redisUrl);
  const queue = new Queue(SUSPENSION_RETENTION_QUEUE_NAME, { connection });
  await queue.upsertJobScheduler(
    "suspension-retention-scan",
    { every: 24 * 60 * 60 * 1000 },
    { name: "scan", opts: { removeOnComplete: true, removeOnFail: 20 } }
  );
  return queue;
}

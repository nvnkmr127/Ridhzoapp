import { Worker, Queue } from "bullmq";
import { createRedis, quietErrors } from "../redis";
import { LeadService } from "@/domains/leads/service";
import { purgeExpiredIdempotencyKeys } from "@/lib/idempotency";

export const RECYCLE_BIN_QUEUE_NAME = "recycle-bin-purge";

export async function processRecycleBinJob() {
  const { purgedCount } = await LeadService.purgeExpired(30);
  if (purgedCount) console.log(`[RECYCLE_BIN_WORKER] Auto-purged ${purgedCount} leads deleted 30+ days ago`);
  // Same daily sweep: forget mobile Idempotency-Keys once no queued retry can still send them.
  const idempotencyKeys = await purgeExpiredIdempotencyKeys();
  return { purgedCount, idempotencyKeys };
}

export function createRecycleBinWorker(redisUrl?: string) {
  const connection = createRedis({ maxRetriesPerRequest: null }, redisUrl);
  const worker = new Worker(RECYCLE_BIN_QUEUE_NAME, processRecycleBinJob, { connection });
  worker.on("failed", (job, err) => console.error(`[RECYCLE_BIN_WORKER] Job ${job?.id} failed:`, err));
  quietErrors(worker);
  return worker;
}

// Daily scan that permanently removes leads soft-deleted more than 30 days ago.
export async function scheduleRecycleBinScan(redisUrl?: string) {
  const connection = createRedis({ maxRetriesPerRequest: null }, redisUrl);
  const queue = new Queue(RECYCLE_BIN_QUEUE_NAME, { connection });
  await queue.upsertJobScheduler("recycle-bin-scan", { every: 24 * 60 * 60 * 1000 }, { name: "scan", opts: { removeOnComplete: true, removeOnFail: 20 } });
  return queue;
}

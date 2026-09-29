import { Worker, Queue } from "bullmq";
import { createRedis, quietErrors } from "../redis";
import { SequenceService } from "@/domains/leads/sequenceService";

export const SEQUENCE_QUEUE_NAME = "sequence-runner";

export async function processSequenceJob() {
  // A full batch means more may be waiting: keep draining (bounded) rather than one batch per 5 min.
  const BATCH = 200;
  let processed = 0;
  for (let round = 0; round < 10; round++) {
    const r = await SequenceService.runDue(BATCH);
    processed += r.processed;
    if (r.scanned < BATCH) break;
  }
  if (processed) console.log(`[SEQUENCE_WORKER] Delivered ${processed} sequence steps`);
  return { processed };
}

export function createSequenceWorker(redisUrl?: string) {
  const connection = createRedis({ maxRetriesPerRequest: null }, redisUrl);
  const worker = new Worker(SEQUENCE_QUEUE_NAME, processSequenceJob, { connection });
  worker.on("failed", (job, err) => console.error(`[SEQUENCE_WORKER] Job ${job?.id} failed:`, err));
  quietErrors(worker);
  return worker;
}

// Repeating scan every 5 minutes — the drip's clock. ponytail: a periodic scan, not per-step
// delayed jobs; steps fire within 5 min of their due time, which is plenty for a day-scale drip.
export async function scheduleSequenceScan(redisUrl?: string) {
  const connection = createRedis({ maxRetriesPerRequest: null }, redisUrl);
  const queue = new Queue(SEQUENCE_QUEUE_NAME, { connection });
  await queue.upsertJobScheduler("sequence-scan", { every: 5 * 60 * 1000 }, { name: "scan", opts: { removeOnComplete: true, removeOnFail: 20 } });
  return queue;
}

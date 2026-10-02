// PRODUCER side only: safe to import from web routes / server actions. The consumer (Worker) lives in
// workers/ingestionWorker.ts and is started ONLY by startWorkers — importing a Worker module in the web
// process would turn every serverless instance into a queue consumer.
import { Queue } from "bullmq";
import { createRedis } from "../redis";

const connection = createRedis({ maxRetriesPerRequest: null });

export const INGESTION_QUEUE_NAME = "lead-ingestion";
export const ingestionQueue = new Queue(INGESTION_QUEUE_NAME, {
  connection,
  // A Graph fetch inside the worker can fail transiently (rate limits, blips); without retries a
  // single hiccup would lose the lead. Retry with exponential backoff before giving up.
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: 1000,
    removeOnFail: 5000,
  },
});

export interface IngestionJobData {
  webhookEventId: string;
}


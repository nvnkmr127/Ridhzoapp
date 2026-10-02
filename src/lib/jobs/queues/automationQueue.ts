// PRODUCER side only — see queues/ingestionQueue.ts. The Worker is in workers/automationWorker.ts.
import { Queue } from "bullmq";
import { createRedis } from "../redis";
import type { EventPayload } from "@/lib/events/emitter";

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


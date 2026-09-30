import { Worker, Queue } from "bullmq";
import { createRedis, quietErrors } from "../redis";
import { SupportTicketService } from "@/domains/platform/supportService";

export const SUPPORT_SLA_QUEUE_NAME = "support-sla-scan";

export async function processSupportSlaJob() {
  const alerted = await SupportTicketService.alertSlaBreaches();
  if (alerted) console.log(`[SUPPORT_SLA_WORKER] Alerted ${alerted} SLA-breached tickets`);
  return { alerted };
}

export function createSupportSlaWorker(redisUrl?: string) {
  const connection = createRedis({ maxRetriesPerRequest: null }, redisUrl);
  const worker = new Worker(SUPPORT_SLA_QUEUE_NAME, processSupportSlaJob, { connection });
  worker.on("failed", (job, err) => console.error(`[SUPPORT_SLA_WORKER] Job ${job?.id} failed:`, err));
  quietErrors(worker);
  return worker;
}

// Every 10 minutes: post tickets that just crossed their SLA deadline to the ops channel.
export async function scheduleSupportSlaScan(redisUrl?: string) {
  const connection = createRedis({ maxRetriesPerRequest: null }, redisUrl);
  const queue = new Queue(SUPPORT_SLA_QUEUE_NAME, { connection });
  await queue.upsertJobScheduler("support-sla-scan", { every: 10 * 60 * 1000 }, { name: "scan", opts: { removeOnComplete: true, removeOnFail: 20 } });
  return queue;
}

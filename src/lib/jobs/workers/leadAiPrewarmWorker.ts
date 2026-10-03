import { Worker, Queue } from "bullmq";
import { createRedis, quietErrors } from "../redis";
import { db } from "@/db";
import { leads, organizations } from "@/db/schema";
import { and, desc, eq, isNull, notInArray, sql } from "drizzle-orm";
import { aiEnabled } from "@/lib/ai/client";
import { recapForLead } from "@/lib/ai/leadAssist";
import { trialExpired } from "@/domains/billing/planNames";

export const LEAD_AI_PREWARM_QUEUE_NAME = "lead-ai-prewarm-scan";
export const PREWARM_INTERVAL_MS = 3 * 60 * 60 * 1000; // 3 hours

export async function processLeadAiPrewarm(batchLimit = 50): Promise<{ warmed: number; skipped: number }> {
  if (!aiEnabled()) return { warmed: 0, skipped: 0 };

  const cutoff = new Date(Date.now() - PREWARM_INTERVAL_MS).toISOString();
  // Target open, non-terminal leads in active orgs whose recap is missing or older than 3 hours
  const candidates = await db
    .select({
      lead: leads,
      plan: organizations.plan,
      trialEndsAt: organizations.trialEndsAt,
      suspendedAt: organizations.suspendedAt,
    })
    .from(leads)
    .innerJoin(organizations, eq(leads.organizationId, organizations.id))
    .where(
      and(
        isNull(leads.deletedAt),
        isNull(organizations.suspendedAt),
        notInArray(leads.status, ["won", "lost", "unqualified"]),
        sql`(${leads.customData}->'_aiRecap'->>'at' IS NULL OR ${leads.customData}->'_aiRecap'->>'at' < ${cutoff})`,
      ),
    )
    .orderBy(desc(leads.updatedAt))
    .limit(batchLimit);

  let warmed = 0;
  let skipped = 0;
  const exhaustedOrgs = new Set<string>();

  for (const { lead, plan, trialEndsAt } of candidates) {
    if (exhaustedOrgs.has(lead.organizationId)) {
      skipped++;
      continue;
    }
    // Only pre-warm for paid tiers or active trials (never burn limited Free plan credits in background)
    if (plan === "free" && trialExpired({ trialEndsAt })) {
      skipped++;
      continue;
    }

    try {
      const res = await recapForLead(lead, lead.organizationId, true);
      if (res.outOfCredits) {
        exhaustedOrgs.add(lead.organizationId);
        skipped++;
      } else if (res.ai) {
        warmed++;
      }
    } catch (e) {
      console.error(`[LEAD_AI_PREWARM_WORKER] failed to prewarm lead ${lead.id}`, e);
      skipped++;
    }
  }

  if (warmed > 0) {
    console.log(`[LEAD_AI_PREWARM_WORKER] Prewarmed ${warmed} leads (${skipped} skipped)`);
  }
  return { warmed, skipped };
}

export function createLeadAiPrewarmWorker(redisUrl?: string) {
  const connection = createRedis({ maxRetriesPerRequest: null }, redisUrl);
  const worker = new Worker(LEAD_AI_PREWARM_QUEUE_NAME, () => processLeadAiPrewarm(), { connection });
  worker.on("failed", (job, err) => console.error(`[LEAD_AI_PREWARM_WORKER] Job ${job?.id} failed:`, err));
  quietErrors(worker);
  return worker;
}

export async function scheduleLeadAiPrewarmScan(redisUrl?: string) {
  const connection = createRedis({ maxRetriesPerRequest: null }, redisUrl);
  const queue = new Queue(LEAD_AI_PREWARM_QUEUE_NAME, { connection });
  await queue.upsertJobScheduler(
    "lead-ai-prewarm-scan",
    { every: PREWARM_INTERVAL_MS },
    { name: "scan", opts: { removeOnComplete: true, removeOnFail: 20 } },
  );
  return queue;
}

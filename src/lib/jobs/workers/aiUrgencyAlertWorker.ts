import { Worker, Queue } from "bullmq";
import { and, eq, gte, inArray, isNull, notInArray, or, sql } from "drizzle-orm";
import { createRedis, quietErrors } from "../redis";
import { db } from "@/db";
import { leads, organizations, users } from "@/db/schema";
import { NotificationService } from "@/domains/notifications/service";
import { NextBestActionService } from "@/domains/leads/nextBestActionService";
import type { RecapCache } from "@/lib/ai/leadAssist";

export const AI_URGENCY_QUEUE_NAME = "ai-urgency-scan";
export const AI_URGENCY_INTERVAL_MS = 30 * 60 * 1000;

/**
 * Quiet period after a lead was alerted. This is the flood guard: whatever happens — downtime, a
 * model that suddenly gets enthusiastic, a workspace that suddenly has 400 urgent leads — no rep
 * gets more than one of these a day per lead.
 */
export const AI_URGENCY_COOLDOWN_MS = 24 * 60 * 60 * 1000;

/**
 * How recently a lead must have moved for it to be considered at all. Without this, a scan after
 * downtime would alert on everything urgent in the database, including leads nobody has touched in
 * months — the oldest rows are exactly the ones the model rates highest.
 */
export const AI_URGENCY_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;

/** Per-org ceiling per run, for the same reason the prewarm scan has one. */
export const AI_URGENCY_MAX_PER_ORG = 10;

const isNotTerminal = notInArray(leads.status, ["won", "lost", "unqualified"]);
/** The claim column, still unclaimed (never alerted, or the cooldown has lapsed). */
const claimable = (cutoff: Date) => or(isNull(leads.aiUrgencyAlertedAt), sql`${leads.aiUrgencyAlertedAt} < ${cutoff}`);

export interface UrgencyCandidate {
  lead: typeof leads.$inferSelect;
}

/**
 * The gate, as a pure function so it can be tested without a database: an alert only goes out when
 * the AI says act now and is sure, the rep hasn't dismissed that exact action, and the rule engine
 * — which never saw the model — independently ranks the lead high priority.
 *
 * Two independent opinions is the whole point. The AI alone would alert on its own hunches; the
 * rule alone is what the app already showed. Only where they agree is it worth someone's phone.
 */
export function isAlertWorthy(next: { urgency: string; confidence: string } | null, rulePriority: string) {
  return next?.urgency === "now" && next.confidence === "high" && rulePriority === "high";
}

/**
 * Scans open leads for a cached AI next-action that says "now, and I'm sure", and notifies the
 * owner when the rule engine agrees.
 *
 * Free by policy and free in practice: it only ever *reads* the plan the prewarm worker already
 * wrote. It never calls a model, never touches a credit, and never generates a recap. If there is
 * no cached plan, the lead is simply not a candidate.
 */
export async function processAiUrgencyAlerts(now = new Date()): Promise<{ alerted: number; considered: number }> {
  const cooldownCutoff = new Date(now.getTime() - AI_URGENCY_COOLDOWN_MS);
  const lookbackCutoff = new Date(now.getTime() - AI_URGENCY_LOOKBACK_MS);

  const candidates = await db
    .select({ lead: leads })
    .from(leads)
    .innerJoin(organizations, eq(leads.organizationId, organizations.id))
    .where(
      and(
        isNull(leads.deletedAt),
        isNull(organizations.suspendedAt),
        isNotTerminal,
        // Somebody has to be there to tell.
        sql`${leads.ownerId} IS NOT NULL`,
        // Untouched for a week is a re-engagement campaign, not an "act now" alert.
        gte(leads.updatedAt, lookbackCutoff),
        // Only leads that already carry a cached AI plan. This is what keeps the scan free.
        sql`${leads.customData}->'_aiRecap'->'plan'->'next' IS NOT NULL`,
        claimable(cooldownCutoff),
      ),
    )
    .orderBy(sql`${leads.updatedAt} DESC`)
    .limit(200);

  if (candidates.length === 0) return { alerted: 0, considered: 0 };

  // Only notify people who can still act on it.
  const ownerIds = [...new Set(candidates.map((c) => c.lead.ownerId).filter((x): x is string => !!x))];
  const activeOwners = new Set(
    ownerIds.length
      ? (await db.select({ id: users.id }).from(users).where(and(inArray(users.id, ownerIds), eq(users.isActive, true), isNull(users.deletedAt)))).map((u) => u.id)
      : [],
  );

  const perOrg = new Map<string, number>();
  let alerted = 0;
  let considered = 0;

  for (const { lead } of candidates) {
    if (!lead.ownerId || !activeOwners.has(lead.ownerId)) continue;
    const orgId = lead.organizationId;
    if ((perOrg.get(orgId) ?? 0) >= AI_URGENCY_MAX_PER_ORG) continue;

    const cached = ((lead.customData ?? {}) as Record<string, unknown>)._aiRecap as RecapCache | undefined;
    const next = cached?.plan?.next ?? null;
    if (!next || cached?.dismissed?.includes(next.id)) continue;

    const rule = NextBestActionService.getRecommendation({
      status: lead.status,
      lastContactedAt: lead.lastContactedAt,
      nextFollowUpAt: lead.nextFollowUpAt,
      score: lead.score ?? undefined,
      phone: lead.phone,
      email: lead.email,
    });
    if (!isAlertWorthy(next, rule.priority)) continue;
    considered++;

    // Claim before sending, so two overlapping scans can't both notify. `aiUrgencyActionId` records
    // which action fired, for support ("why did I get this?"), not for gating — the cooldown does that.
    const [claimed] = await db
      .update(leads)
      .set({ aiUrgencyAlertedAt: now, aiUrgencyActionId: next.id })
      .where(and(eq(leads.id, lead.id), claimable(cooldownCutoff)))
      .returning({ id: leads.id });
    if (!claimed) continue;

    try {
      await NotificationService.create({
        userId: lead.ownerId,
        type: "ai_urgency",
        // The reason the model gave, verbatim — it cites a concrete fact, which is what makes this
        // alert worth interrupting someone for. Untranslatable by nature; the title carries the i18n.
        title: "Act now on {name}",
        titleVars: { name: lead.name },
        body: next.reason,
        leadId: lead.id,
      });
    } catch (e) {
      // Hand the claim back so the alert isn't lost — it's still urgent, and the cooldown would
      // otherwise swallow it for a day.
      console.error("[AI_URGENCY_WORKER] alert failed for lead", lead.id, e);
      await db.update(leads).set({ aiUrgencyAlertedAt: null, aiUrgencyActionId: null }).where(eq(leads.id, lead.id)).catch(() => {});
      continue;
    }
    perOrg.set(orgId, (perOrg.get(orgId) ?? 0) + 1);
    alerted++;
  }

  if (alerted > 0) console.log(`[AI_URGENCY_WORKER] Sent ${alerted} time-sensitive lead alerts (of ${considered} qualifying)`);
  return { alerted, considered };
}

export function createAiUrgencyWorker(redisUrl?: string) {
  const connection = createRedis({ maxRetriesPerRequest: null }, redisUrl);
  const worker = new Worker(AI_URGENCY_QUEUE_NAME, () => processAiUrgencyAlerts(), { connection });
  worker.on("failed", (job, err) => console.error(`[AI_URGENCY_WORKER] Job ${job?.id} failed:`, err));
  quietErrors(worker);
  return worker;
}

export async function scheduleAiUrgencyScan(redisUrl?: string) {
  const connection = createRedis({ maxRetriesPerRequest: null }, redisUrl);
  const queue = new Queue(AI_URGENCY_QUEUE_NAME, { connection });
  await queue.upsertJobScheduler(
    "ai-urgency-scan",
    { every: AI_URGENCY_INTERVAL_MS },
    { name: "scan", opts: { removeOnComplete: true, removeOnFail: 20 } },
  );
  return queue;
}
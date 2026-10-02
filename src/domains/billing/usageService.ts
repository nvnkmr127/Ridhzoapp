import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { usageCounters, leadAttachments } from "@/db/schema";
import { PlanService, limitsFor, currentPeriod, type PlanLimits } from "./planService";

// Monthly metered usage (outbound messages, emails, exports, imported rows). Every spend is ONE atomic upsert
// that refuses to pass the plan's cap, so parallel requests can't overshoot it, and failed operations hand
// the unit back (refund) so they don't eat the allowance.
export type Metric = "messages" | "emails" | "exports" | "import_rows";

const FIELD: Record<Metric, keyof Pick<PlanLimits, "messages" | "emails" | "exports" | "importRows">> = {
  messages: "messages", emails: "emails", exports: "exports", import_rows: "importRows",
};
const LABEL: Record<Metric, string> = { messages: "WhatsApp messages", emails: "emails", exports: "exports", import_rows: "imported rows" };

export class UsageLimitError extends Error {
  code = "LIMIT" as const;
  constructor(message: string) { super(message); }
}

export class UsageService {
  /** Reserve `n` units. Throws UsageLimitError (message mentions "plan" → the UI opens the upgrade dialog). */
  static async consume(organizationId: string, metric: Metric, n = 1): Promise<void> {
    const max = limitsFor(await PlanService.plan(organizationId))[FIELD[metric]];
    if (max === Infinity) return; // unmetered: skip the write entirely
    const fail = () => new UsageLimitError(`Your plan allows ${max.toLocaleString("en-IN")} ${LABEL[metric]} a month and this would go over it. Upgrade your plan to continue.`);
    if (n > max) throw fail();
    const period = currentPeriod();
    const rows = await db
      .insert(usageCounters)
      .values({ organizationId, period, metric, used: n })
      .onConflictDoUpdate({
        target: [usageCounters.organizationId, usageCounters.period, usageCounters.metric],
        set: { used: sql`${usageCounters.used} + ${n}`, updatedAt: new Date() },
        setWhere: sql`${usageCounters.used} + ${n} <= ${max}`,
      })
      .returning({ used: usageCounters.used });
    if (rows.length === 0) throw fail();
  }

  /** Give units back (the send/export failed). Never goes below zero. */
  static async refund(organizationId: string, metric: Metric, n = 1): Promise<void> {
    await db
      .update(usageCounters)
      .set({ used: sql`GREATEST(${usageCounters.used} - ${n}, 0)`, updatedAt: new Date() })
      .where(and(eq(usageCounters.organizationId, organizationId), eq(usageCounters.period, currentPeriod()), eq(usageCounters.metric, metric)));
  }

  /** This month's usage for the meters. */
  static async current(organizationId: string): Promise<Record<Metric, number>> {
    const rows = await db
      .select({ metric: usageCounters.metric, used: usageCounters.used })
      .from(usageCounters)
      .where(and(eq(usageCounters.organizationId, organizationId), eq(usageCounters.period, currentPeriod())));
    const out: Record<Metric, number> = { messages: 0, emails: 0, exports: 0, import_rows: 0 };
    for (const r of rows) if (r.metric in out) out[r.metric as Metric] = r.used;
    return out;
  }

  static async storageUsedBytes(organizationId: string): Promise<number> {
    const [r] = await db.select({ n: sql<number>`coalesce(sum(${leadAttachments.fileSize}), 0)::float8` }).from(leadAttachments).where(eq(leadAttachments.organizationId, organizationId));
    return Number(r?.n ?? 0);
  }

  /** Attachment storage cap (MB, from the plan). */
  static async assertCanStore(organizationId: string, addingBytes: number): Promise<void> {
    const maxMb = limitsFor(await PlanService.plan(organizationId)).storageMb;
    if (maxMb === Infinity) return;
    const used = await this.storageUsedBytes(organizationId);
    if (used + addingBytes > maxMb * 1024 * 1024) {
      throw new UsageLimitError(`Your plan includes ${maxMb.toLocaleString("en-IN")} MB of file storage and this upload would go over it. Delete some files or upgrade your plan.`);
    }
  }
}

import { db } from "@/db";
import { users, leads, invitations, organizations, automations, sequences, leadSources } from "@/db/schema";
import { and, asc, count, eq, gt, isNull, sql } from "drizzle-orm";
import { PlatformConfigService } from "@/domains/platform/configService";
import { canonicalPlan, trialExpired } from "./planNames";

// Per-plan ceilings. Infinity = unlimited. Enforcement lives here; charging is Razorpay
// (domains/billing/service + the /api/webhooks/razorpay route), which sets the org's plan column.
// aiCredits = AI generations per calendar month (draft, recap, assistant turn, sequence, improve).
// aiAutoTag = background AI tagging of inbound replies (paid only — it would silently burn credits).
// branding = "Powered by Ridhzo" on hosted web forms.
export type PlanLimits = {
  seats: number; leads: number; automations: number; sequences: number; sources: number;
  aiCredits: number; aiAutoTag: boolean; branding: boolean;
  /** Metered per calendar month (UTC): outbound WhatsApp, outbound email, CSV exports, imported rows, /api/v1 requests. Infinity = unmetered. */
  messages: number; emails: number; exports: number; importRows: number; apiRequests: number;
  /** Attachment storage in MB (a gauge, not monthly). */
  storageMb: number;
  /** yearlyPrice must match the RAZORPAY_PLAN_*_YEARLY plan amount (2 months free = 10× monthly). */
  price: string; yearlyPrice: string | null; description: string;
};
export const PLAN_LIMITS: Record<string, PlanLimits> = {
  free: { seats: 1, leads: 300, automations: 2, sequences: 1, sources: 1, aiCredits: 15, aiAutoTag: false, branding: true, messages: 100, emails: 100, exports: 5, importRows: 500, apiRequests: 10_000, storageMb: 100, price: "₹0", yearlyPrice: null, description: "For individuals getting started" },
  starter: { seats: 3, leads: 5_000, automations: 15, sequences: 10, sources: 5, aiCredits: 300, aiAutoTag: true, branding: false, messages: 3_000, emails: 3_000, exports: 100, importRows: 20_000, apiRequests: 300_000, storageMb: 5_000, price: "₹249 / mo", yearlyPrice: "₹2,490 / yr", description: "For solo agents & growing teams" },
  // Messages stay finite even here: every WhatsApp send is real money (the platform number is shared).
  unlimited: { seats: Infinity, leads: Infinity, automations: Infinity, sequences: Infinity, sources: Infinity, aiCredits: 2_000, aiAutoTag: true, branding: false, messages: 30_000, emails: 30_000, exports: Infinity, importRows: Infinity, apiRequests: 3_000_000, storageMb: 100_000, price: "₹449 / mo", yearlyPrice: "₹4,490 / yr", description: "Unlimited leads, seats & full access" },
};

// New workspaces start on a Starter trial. Limits treat it as Free the moment it ends (trialExpired);
// the hourly trial-downgrade worker then rewrites the row.
export const SIGNUP_TRIAL_DAYS = 14;
export function signupTrial() {
  return { plan: "starter", trialEndsAt: new Date(Date.now() + SIGNUP_TRIAL_DAYS * 86_400_000) };
}

export const currentPeriod = () => new Date().toISOString().slice(0, 7); // 'YYYY-MM' (UTC)

// Countable per-org resources capped by plan. Counts every row (active or paused) so pausing
// one can't be used to create more.
const COUNTED = {
  automations: { table: automations, org: automations.organizationId, id: automations.id, createdAt: automations.createdAt, label: "automations" },
  sequences: { table: sequences, org: sequences.organizationId, id: sequences.id, createdAt: sequences.createdAt, label: "sequences" },
  sources: { table: leadSources, org: leadSources.organizationId, id: leadSources.id, createdAt: leadSources.createdAt, label: "lead sources" },
} as const;
export type CountedResource = keyof typeof COUNTED;

export function limitsFor(plan: string) {
  return PLAN_LIMITS[canonicalPlan(plan)];
}

// Caps how many callers may hold a lock transaction (= a pooled connection) at once, so a burst of
// limit-checked writes can't starve the pool of the connection each one needs for its own insert.
let lockSlots = 6;
const lockWaiters: (() => void)[] = [];
async function acquireSlot() {
  if (lockSlots > 0) { lockSlots--; return; }
  await new Promise<void>((r) => lockWaiters.push(r));
}
const releaseSlot = () => { const next = lockWaiters.shift(); if (next) next(); else lockSlots++; };

// pg_advisory_xact_lock key for one org + one limit bucket ('leads' | 'seats' | a counted resource).
export const limitLockSql = (organizationId: string, bucket: string) =>
  sql`select pg_advisory_xact_lock(hashtext(${`limit:${organizationId}:${bucket}`}))`;

export class PlanService {
  // Runs `fn` (an assertCanAdd… check followed by the INSERT it guards) one-at-a-time per org+bucket, so
  // two concurrent requests can't both see "under the limit" and both insert. The lock is released
  // when the insert has committed. ponytail: a Postgres advisory lock — no schema change, no Redis.
  static async serialized<T>(organizationId: string, bucket: string, fn: () => Promise<T>): Promise<T> {
    await acquireSlot();
    try {
      return await db.transaction(async (tx) => {
        await tx.execute(limitLockSql(organizationId, bucket));
        return fn();
      });
    } finally {
      releaseSlot();
    }
  }

  static async plan(organizationId: string) {
    try {
      const res = await db
        .select({ plan: organizations.plan, planStatus: organizations.planStatus, trialEndsAt: organizations.trialEndsAt })
        .from(organizations)
        .where(eq(organizations.id, organizationId))
        .limit(1);
      const org = Array.isArray(res) ? res[0] : res;
      if (!org || trialExpired(org)) return "free";
      if (org.planStatus && org.planStatus !== "active") {
        const { BillingLifecycleService } = await import("./lifecycleService");
        const lifecycle = await BillingLifecycleService.getLifecycle(organizationId);
        const { status } = BillingLifecycleService.computeStatus(org, lifecycle);
        if (status === "locked" || status === "free") return "free";
        return org.plan ?? "free";
      }
      return org.plan ?? "free";
    } catch {
      return "free";
    }
  }

  // Computes real-time usage against plan limits.
  static async getUsageStats(organizationId: string, knownPlan?: string) {
    let customSeats: number | undefined;
    try {
      const overrides = await PlatformConfigService.get<Record<string, number>>("seat_overrides", {});
      customSeats = overrides?.[organizationId];
    } catch {
      // ignore
    }

    const planName = knownPlan ?? (await this.plan(organizationId));
    const { seats: defaultSeats, leads: maxLeads } = limitsFor(planName);
    const maxSeats = customSeats != null ? customSeats : defaultSeats;

    let userCount = 0;
    let inviteCount = 0;
    let leadCount = 0;

    try {
      const resU = await db.select({ n: count() }).from(users).where(and(eq(users.organizationId, organizationId), isNull(users.deletedAt)));
      const resI = await db.select({ n: count() }).from(invitations).where(and(eq(invitations.organizationId, organizationId), isNull(invitations.acceptedAt), gt(invitations.expiresAt, new Date())));
      const resL = await db.select({ n: count() }).from(leads).where(and(eq(leads.organizationId, organizationId), isNull(leads.deletedAt)));
      
      const u = Array.isArray(resU) ? resU[0] : resU;
      const i = Array.isArray(resI) ? resI[0] : resI;
      const l = Array.isArray(resL) ? resL[0] : resL;

      userCount = u?.n != null ? Number(u.n) : 0;
      inviteCount = i?.n != null ? Number(i.n) : 0;
      leadCount = l?.n != null ? Number(l.n) : 0;
    } catch {
      // Return 0 usage if db fails, but limits will still be enforced below if max is hit
    }

    // The other plan-capped things, in ONE round trip (this runs on every dashboard render).
    let counted = { sources: 0, automations: 0, sequences: 0, messages: 0, storageMb: 0 };
    try {
      const res = (await db.execute(sql`select
        (select count(*)::int from lead_sources where organization_id = ${organizationId}) as sources,
        (select count(*)::int from automations where organization_id = ${organizationId}) as automations,
        (select count(*)::int from sequences where organization_id = ${organizationId}) as sequences,
        (select coalesce(sum(used), 0)::int from usage_counters where organization_id = ${organizationId} and period = ${currentPeriod()} and metric = 'messages') as messages,
        (select coalesce(sum(file_size), 0)::float8 / 1048576 from lead_attachments where organization_id = ${organizationId}) as storage_mb`)) as unknown as { sources: number; automations: number; sequences: number; messages: number; storage_mb: number }[];
      if (res[0]) counted = { sources: Number(res[0].sources), automations: Number(res[0].automations), sequences: Number(res[0].sequences), messages: Number(res[0].messages), storageMb: Math.round(Number(res[0].storage_mb)) };
    } catch {
      // meters show 0 used if the read fails; enforcement doesn't depend on this
    }
    const caps = limitsFor(planName);

    let aiCredits = { used: 0, max: limitsFor(planName).aiCredits };
    try {
      aiCredits = await this.aiCredits(organizationId, planName);
    } catch {
      // show the plan max with 0 used if the read fails
    }

    return {
      plan: planName,
      seats: { current: userCount + inviteCount, max: maxSeats },
      leads: { current: leadCount, max: maxLeads },
      aiCredits: { current: aiCredits.used, max: aiCredits.max },
      sources: { current: counted.sources, max: caps.sources },
      automations: { current: counted.automations, max: caps.automations },
      sequences: { current: counted.sequences, max: caps.sequences },
      messages: { current: counted.messages, max: caps.messages },
      storage: { current: counted.storageMb, max: caps.storageMb }, // MB
    };
  }

  // Counts active users + still-open invitations against the seat limit. `alreadyCounted` is the
  // number of seats the caller's own operation is already holding — the invite being accepted, or the
  // pending invite a re-invite replaces — so it isn't counted against itself.
  static async assertCanAddSeat(organizationId: string, alreadyCounted = 0) {
    const stats = await this.getUsageStats(organizationId);
    if (stats.seats.max === Infinity) return;
    if (stats.seats.current - alreadyCounted >= stats.seats.max) {
      throw new Error(`Your plan allows ${stats.seats.max} seats. Upgrade to add more.`);
    }
  }

  // `adding` = how many leads the caller is about to create (a bulk import passes its batch size).
  // Counts directly rather than via getUsageStats, which swallows DB errors and would report 0 used
  // — letting a transient failure through as "under the limit".
  static async assertCanAddLead(organizationId: string, adding = 1) {
    const max = limitsFor(await this.plan(organizationId)).leads;
    if (max === Infinity) return;
    const res = await db.select({ n: count() }).from(leads).where(and(eq(leads.organizationId, organizationId), isNull(leads.deletedAt)));
    const row = Array.isArray(res) ? res[0] : res;
    const current = Number(row?.n ?? 0);
    if (current + adding > max) {
      throw new Error(
        adding > 1
          ? `Your plan allows ${max} leads and you have ${current}, so ${adding} more won't fit. Remove some rows or upgrade.`
          : `Your plan allows ${max} leads. Upgrade to add more.`,
      );
    }
  }

  // Background AI (inbound reply tagging) — paid plans only.
  static async aiAutoTagAllowed(organizationId: string) {
    return limitsFor(await this.plan(organizationId)).aiAutoTag;
  }

  static async aiCredits(organizationId: string, knownPlan?: string) {
    // Plan and credit usage are independent reads — run them together (they were sequential, so
    // every /me and AI-credit check paid two org round trips).
    const [planName, rows] = await Promise.all([
      knownPlan ?? this.plan(organizationId),
      db
        .select({ used: organizations.aiCreditsUsed, period: organizations.aiCreditsPeriod })
        .from(organizations)
        .where(eq(organizations.id, organizationId)),
    ]);
    const max = limitsFor(planName).aiCredits;
    const row = Array.isArray(rows) ? rows[0] : rows;
    const used = row?.period === currentPeriod() ? row.used : 0;
    // A super-admin grant drives `used` below zero (bonus credits); show it as extra allowance so
    // the meter never reads negative: same remaining credits, used >= 0.
    return { used: Math.max(0, used), max: max - used + Math.max(0, used) };
  }

  // Atomically spends one AI credit. One UPDATE that resets on a new month and refuses at the cap,
  // so concurrent requests can't overdraw. false = out of credits for this month.
  static async consumeAiCredit(organizationId: string): Promise<boolean> {
    const max = limitsFor(await this.plan(organizationId)).aiCredits;
    const period = currentPeriod();
    const rows = await db
      .update(organizations)
      .set({
        aiCreditsUsed: sql`CASE WHEN ${organizations.aiCreditsPeriod} = ${period} THEN ${organizations.aiCreditsUsed} + 1 ELSE 1 END`,
        aiCreditsPeriod: period,
      })
      .where(and(
        eq(organizations.id, organizationId),
        sql`(${organizations.aiCreditsPeriod} IS DISTINCT FROM ${period} OR ${organizations.aiCreditsUsed} < ${max})`,
      ))
      .returning({ id: organizations.id });
    return rows.length > 0;
  }

  // Gives a credit back when the AI call failed and the user got the non-AI fallback.
  static async refundAiCredit(organizationId: string) {
    await db
      .update(organizations)
      .set({ aiCreditsUsed: sql`GREATEST(${organizations.aiCreditsUsed} - 1, 0)` })
      .where(and(eq(organizations.id, organizationId), eq(organizations.aiCreditsPeriod, currentPeriod())));
  }

  // Message contains "plan" so actionFail maps it to code LIMIT → the UI opens the upgrade dialog.
  static async assertCanAdd(organizationId: string, resource: CountedResource, adding = 1) {
    const plan = await this.plan(organizationId);
    const max = limitsFor(plan)[resource];
    if (max === Infinity) return;
    const { table, org, label } = COUNTED[resource];
    const [row] = await db.select({ n: count() }).from(table).where(eq(org, organizationId));
    if (Number(row?.n ?? 0) + adding > max) {
      const next = limitsFor(plan) === PLAN_LIMITS.free ? "Starter or Unlimited" : "Unlimited";
      throw new Error(`Your ${plan === "free" ? "Free" : "current"} plan allows ${max} ${label}. Upgrade to ${next} to add more.`);
    }
  }

  // A downgraded workspace may hold more than its plan allows. Only the oldest N keep running;
  // the rest pause until the org upgrades. null = no cap (paid plan).
  static async runnableIds(organizationId: string, resource: "automations" | "sequences" | "sources"): Promise<Set<string> | null> {
    const max = limitsFor(await this.plan(organizationId))[resource];
    if (max === Infinity) return null;
    const { table, org, id, createdAt } = COUNTED[resource];
    const rows = await db.select({ id }).from(table).where(eq(org, organizationId)).orderBy(asc(createdAt)).limit(max);
    return new Set(rows.map((r) => r.id));
  }
}

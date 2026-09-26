import { db } from "@/db";
import { leads, activities, whatsappMessages, sharedLinks } from "@/db/schema";
import { and, eq, isNull, sql, sum } from "drizzle-orm";
import type { StatusCategory } from "./customStatusSchemaService";

export interface LeadScoreInput {
  status: string;
  /** Category of the (possibly custom) status. Derived from the base keys when omitted. */
  statusCategory?: StatusCategory;
  phone?: string | null;
  email?: string | null;
  company?: string | null;
  lastContactedAt?: Date | null;
  nextFollowUpAt?: Date | null;
  /** @deprecated rep effort, no longer scored — kept so older callers still type-check. */
  activitiesCount?: number;
  hasInboundMsg?: boolean;
  /** Calls the lead picked up. */
  answeredCalls?: number;
  /** Calls in a row with no answer / busy since the lead last engaged. */
  unansweredStreak?: number;
  /** Total talk time on connected calls (from the phone's call log). */
  talkTimeSec?: number;
  /** Times the lead called the rep (answered or missed). */
  incomingCalls?: number;
  /** Total opens of content shared with the lead. */
  contentViews?: number;
  /** The lead filled in form questions (budget, requirement…). */
  hasFormAnswers?: boolean;
}

/** One observed contribution to a lead's score — the "why" behind the number. */
export interface ScoreFactor {
  label: string;
  points: number;
}

export interface ScoreBreakdown {
  score: number;
  factors: ScoreFactor[];
}

const BASE_CATEGORY: Record<string, StatusCategory> = {
  new: "open",
  active: "in_progress",
  won: "won",
  lost: "lost",
  unqualified: "unqualified",
};

export class ScoringService {
  /**
   * Explainable scoring: returns the 0-100 score AND the factors that produced it, so the number
   * is never an opaque guess — a rep can see exactly why. `calculateScore` derives from this.
   *
   * Weighted toward what the LEAD did (replied, picked up, opened content, filled the form). It used
   * to be ~90% profile completeness + the rep's own activity, so three unanswered calls raised the
   * "engagement" score while a lead who replied barely moved it.
   */
  static breakdown(input: LeadScoreInput): ScoreBreakdown {
    const factors: ScoreFactor[] = [];
    const category = input.statusCategory ?? BASE_CATEGORY[input.status] ?? "open";

    // Pipeline position (by category, so custom statuses score like their base equivalents)
    const stagePts: Record<StatusCategory, number> = { won: 50, in_progress: 20, open: 10, lost: 0, unqualified: 0 };
    if (stagePts[category]) factors.push({ label: category === "won" ? "Customer (won)" : category === "in_progress" ? "In progress" : "Open lead", points: stagePts[category] });

    // Intent — the lead's own actions
    if (input.hasInboundMsg) factors.push({ label: "Replied to you", points: 25 });
    if (input.answeredCalls) factors.push({ label: `Picked up ${input.answeredCalls} call${input.answeredCalls === 1 ? "" : "s"}`, points: 15 });
    if (input.incomingCalls) factors.push({ label: `Called you ${input.incomingCalls}×`, points: 10 });
    // A real conversation, not a 20-second "call me later".
    const talkMin = Math.floor((input.talkTimeSec ?? 0) / 60);
    if (talkMin >= 5) factors.push({ label: `Talked ${talkMin} min`, points: 10 });
    else if (talkMin >= 1) factors.push({ label: `Talked ${talkMin} min`, points: 5 });
    if (input.contentViews) factors.push({ label: `Opened your content ${input.contentViews}×`, points: 15 });
    if (input.hasFormAnswers) factors.push({ label: "Shared their requirements", points: 5 });

    // Reachability
    if (input.phone) factors.push({ label: "Has phone", points: 5 });
    if (input.email) factors.push({ label: "Has email", points: 5 });

    // Momentum
    if (input.lastContactedAt) {
      const days = (Date.now() - new Date(input.lastContactedAt).getTime()) / (1000 * 60 * 60 * 24);
      if (days <= 7) factors.push({ label: "In touch this week", points: 10 });
      else if (days <= 14) factors.push({ label: "In touch in last 2 weeks", points: 5 });
    }
    if (input.nextFollowUpAt && new Date(input.nextFollowUpAt) >= new Date()) {
      factors.push({ label: "Next follow-up planned", points: 5 });
    }

    // Going unanswered is a negative signal, not engagement.
    if ((input.unansweredStreak ?? 0) >= 3 && !input.hasInboundMsg) {
      factors.push({ label: `${input.unansweredStreak} calls unanswered in a row`, points: -10 });
    }

    const raw = factors.reduce((total, f) => total + f.points, 0);
    return { score: Math.min(100, Math.max(0, raw)), factors };
  }

  /**
   * Pure scoring logic: calculate engagement score (0-100) based on lead data and activity signals.
   */
  static calculateScore(input: LeadScoreInput): number {
    return this.breakdown(input).score;
  }

  /** Call signals from call activities: answered, the current unanswered run, talk time, lead-initiated. */
  static callStats(acts: { type: string; content: string | null; durationSec?: number | null }[]) {
    // acts newest-first. Content as written by recordLeadContact: "Called — Answered (3m 12s)",
    // "Called — No answer", "Called — Busy…", "Incoming call — Answered (45s)", "Missed call from lead".
    let answeredCalls = 0;
    let unansweredStreak = 0;
    let talkTimeSec = 0;
    let incomingCalls = 0;
    let streakOpen = true;
    for (const a of acts) {
      if (a.type !== "call") continue;
      const text = a.content ?? "";
      const incoming = /^(Incoming call|Missed call from lead)/.test(text);
      const answered = (a.durationSec ?? 0) > 0 || /^(Called|Incoming call) — Answered/.test(text);
      talkTimeSec += a.durationSec ?? 0;
      if (incoming) incomingCalls++;
      if (answered) answeredCalls++;
      // The lead picking up or calling back ends a run of unanswered calls.
      if (answered || incoming) streakOpen = false;
      else if (streakOpen && /^Called — (No answer|Busy)/.test(text)) unansweredStreak++;
    }
    return { answeredCalls, unansweredStreak, talkTimeSec, incomingCalls };
  }

  /**
   * Re-evaluates and updates score for a specific lead in the database.
   */
  static async updateLeadScore(leadId: string): Promise<number> {
    const [lead] = await db.select().from(leads).where(eq(leads.id, leadId)).limit(1);
    if (!lead) throw new Error(`Lead ${leadId} not found`);

    const { CustomStatusSchemaService } = await import("./customStatusSchemaService");
    const { hasFormAnswers } = await import("@/lib/leads/formAnswers");
    const [acts, [inbound], [views], statusCategory] = await Promise.all([
      db.select({ type: activities.type, content: activities.content, durationSec: activities.durationSec }).from(activities).where(eq(activities.leadId, leadId)).orderBy(activities.occurredAt),
      db
        .select({ id: whatsappMessages.id })
        .from(whatsappMessages)
        .where(and(eq(whatsappMessages.leadId, leadId), eq(whatsappMessages.direction, "inbound")))
        .limit(1),
      db.select({ total: sum(sharedLinks.viewCount) }).from(sharedLinks).where(eq(sharedLinks.leadId, leadId)),
      lead.organizationId ? CustomStatusSchemaService.getStatusCategory(lead.organizationId, lead.status) : Promise.resolve(undefined),
    ]);

    const { score, factors } = this.breakdown({
      status: lead.status,
      statusCategory,
      phone: lead.phone,
      email: lead.email,
      company: lead.company,
      lastContactedAt: lead.lastContactedAt,
      nextFollowUpAt: lead.nextFollowUpAt,
      hasInboundMsg: !!inbound,
      contentViews: Number(views?.total ?? 0),
      hasFormAnswers: hasFormAnswers(lead.customData),
      ...this.callStats([...acts].reverse()),
    });

    // Nothing changed → no write (the nightly pass used to rewrite every lead and bump updatedAt).
    const prev = (lead.customData as { _scoreFactors?: { score?: number; factors?: unknown } } | null)?._scoreFactors;
    if (lead.score === score && prev?.score === score && JSON.stringify(prev?.factors) === JSON.stringify(factors)) return score;

    // Persist the number for sorting/filtering, and the "why" alongside it as evidence. jsonb_set
    // touches only _scoreFactors, so a concurrent customData write (AI recap, custom fields) survives.
    const evidence = JSON.stringify({ score, factors, computedAt: new Date().toISOString() });
    await db
      .update(leads)
      .set({
        score,
        customData: sql`jsonb_set(coalesce(${leads.customData}, '{}'::jsonb), '{_scoreFactors}', ${evidence}::jsonb)`,
        ...(lead.score !== score ? { updatedAt: new Date() } : {}),
      })
      .where(eq(leads.id, leadId));
    return score;
  }

  /**
   * Recalculates scores for all leads (or scoped to an organization) to process recency decay.
   */
  static async recalculateAllScores(organizationId?: string): Promise<number> {
    const live = isNull(leads.deletedAt); // recycle-bin leads don't need scoring
    const allLeads = await db
      .select({ id: leads.id })
      .from(leads)
      .where(organizationId ? and(eq(leads.organizationId, organizationId), live) : live);

    // ponytail: 8 leads in parallel (each is ~4 small queries); move to per-org jobs if one pass gets too long.
    const CONCURRENCY = 8;
    let updated = 0;
    for (let i = 0; i < allLeads.length; i += CONCURRENCY) {
      await Promise.all(
        allLeads.slice(i, i + CONCURRENCY).map((l) =>
          this.updateLeadScore(l.id).then(
            () => void updated++,
            (e) => console.error(`[score] lead ${l.id} failed`, (e as Error)?.message),
          ),
        ),
      );
    }
    return updated;
  }
}

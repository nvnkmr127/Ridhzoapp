import { db } from "@/db";
import { followUps, leads } from "@/db/schema";
import { and, count, eq, gte, isNotNull, isNull, sql } from "drizzle-orm";

// Numbers that make the product feel alive: "you reply faster than 85% of businesses" and
// "your first week: 42 leads, 18 follow-ups". Used by the dashboard and the morning summary.

export interface Recap {
  leads: number;
  contacted: number;
  followUpsDone: number;
  medianReplyMinutes: number | null;
}

// A benchmark against 2 workspaces is noise; only claim a percentile with enough peers.
export const MIN_PEERS = 5;

/** Pure: % of other workspaces whose median reply is slower than `mine` (0–100, rounded). */
export function fasterThanPct(mine: number, others: number[]): number | null {
  if (others.length < MIN_PEERS) return null;
  return Math.round((others.filter((m) => m > mine).length / others.length) * 100);
}

/** Pure: "4 min", "2 h", "1 day" — short, for push/WhatsApp lines. */
export function shortMinutes(mins: number): string {
  if (mins < 1) return "under a minute";
  if (mins < 60) return `${Math.round(mins)} min`;
  if (mins < 24 * 60) return `${Math.round(mins / 60)} h`;
  const d = Math.round(mins / 1440);
  return `${d} day${d === 1 ? "" : "s"}`;
}

/** Pure: one-line recap for push / WhatsApp / email subject. */
export function recapLine(r: Recap): string {
  const parts = [
    `${r.leads} lead${r.leads === 1 ? "" : "s"} captured`,
    `${r.contacted} contacted`,
    `${r.followUpsDone} follow-up${r.followUpsDone === 1 ? "" : "s"} done`,
  ];
  if (r.medianReplyMinutes != null) parts.push(`typical reply in ${shortMinutes(r.medianReplyMinutes)}`);
  return parts.join(" · ");
}

// Median first-reply minutes per workspace over the last 30 days (min 3 contacted leads).
// ponytail: one cross-tenant scan cached per server for an hour; move to a nightly rollup table
// if leads-per-30-days gets large enough for this to show up in query time.
let medianCache: { at: number; byOrg: Map<string, number> } | null = null;
const HOUR = 60 * 60 * 1000;

async function orgMedians(): Promise<Map<string, number>> {
  if (medianCache && Date.now() - medianCache.at < HOUR) return medianCache.byOrg;
  const rows = (await db.execute(sql`
    select organization_id as org,
      percentile_cont(0.5) within group (order by extract(epoch from (first_contacted_at - created_at)) / 60) as med
    from ${leads}
    where deleted_at is null and first_contacted_at is not null and first_contacted_at >= created_at
      and created_at > now() - interval '30 days'
    group by organization_id
    having count(*) >= 3`)) as unknown as { org: string; med: number | string }[];
  const byOrg = new Map([...rows].map((r) => [r.org, Number(r.med)]));
  medianCache = { at: Date.now(), byOrg };
  return byOrg;
}

export class HabitService {
  /** This workspace's typical (median) first reply and how it ranks against other workspaces. */
  static async speedBenchmark(organizationId: string): Promise<{ medianMinutes: number | null; fasterThan: number | null }> {
    try {
      const byOrg = await orgMedians();
      const mine = byOrg.get(organizationId);
      if (mine == null) return { medianMinutes: null, fasterThan: null };
      const others = [...byOrg].filter(([org]) => org !== organizationId).map(([, m]) => m);
      return { medianMinutes: mine, fasterThan: fasterThanPct(mine, others) };
    } catch {
      return { medianMinutes: null, fasterThan: null };
    }
  }

  /** What the workspace got done since `since` — the "look how much Ridhzo did for you" numbers. */
  static async recap(organizationId: string, since: Date): Promise<Recap> {
    const live = and(eq(leads.organizationId, organizationId), isNull(leads.deletedAt), gte(leads.createdAt, since));
    const [[captured], [contacted], [done], [median]] = await Promise.all([
      db.select({ n: count() }).from(leads).where(live),
      db.select({ n: count() }).from(leads).where(and(live, isNotNull(leads.firstContactedAt))),
      db.select({ n: count() }).from(followUps).innerJoin(leads, eq(followUps.leadId, leads.id))
        .where(and(eq(leads.organizationId, organizationId), isNotNull(followUps.completedAt), gte(followUps.completedAt, since))),
      db.select({
        m: sql<number | null>`percentile_cont(0.5) within group (order by extract(epoch from (${leads.firstContactedAt} - ${leads.createdAt})) / 60)`,
      }).from(leads).where(and(live, isNotNull(leads.firstContactedAt), sql`${leads.firstContactedAt} >= ${leads.createdAt}`)),
    ]);
    return {
      leads: captured.n,
      contacted: contacted.n,
      followUpsDone: done.n,
      medianReplyMinutes: median?.m == null ? null : Number(median.m),
    };
  }
}

import { db } from "@/db";
import { followUps, leads, meetings, organizations, roles, users } from "@/db/schema";
import { and, count, eq, gte, isNull, lt, or, sql } from "drizzle-orm";
import { appUrl, sendEmail } from "@/lib/mail/mailer";

// Morning team summary for workspace admins: what needs attention today. Sent once per org-local
// day between 8 and 11 AM, only when something is actionable, to admins who haven't opted out of email.

export interface DailySummaryStats {
  overdueFollowUps: number;
  meetingsNeedOutcome: number;
  meetingsToday: number;
  newLeads: number;
  uncontactedLeads: number;
  unassignedLeads: number;
  byRep: { name: string; overdue: number; needOutcome: number }[];
}

const SEND_FROM_HOUR = 8;
const SEND_UNTIL_HOUR = 11;

/** Org-local date (YYYY-MM-DD) and hour for `now`. */
export function localClock(now: Date, timeZone: string) {
  let tz = timeZone;
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: tz });
  } catch {
    tz = "UTC";
  }
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hourCycle: "h23" }).format(now));
  return { date, hour };
}

/** Pure: is this the org's send window, and not already sent today? */
export function isDueToSend(now: Date, timeZone: string, lastSentOn: string | null) {
  const { date, hour } = localClock(now, timeZone);
  return hour >= SEND_FROM_HOUR && hour < SEND_UNTIL_HOUR && lastSentOn !== date ? date : null;
}

export function isActionable(s: DailySummaryStats) {
  return s.overdueFollowUps + s.meetingsNeedOutcome + s.meetingsToday + s.newLeads + s.uncontactedLeads + s.unassignedLeads > 0;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Pure: subject line naming only what's non-zero, most urgent first. */
export function summarySubject(orgName: string, s: DailySummaryStats) {
  const parts = [
    s.overdueFollowUps && plural(s.overdueFollowUps, "overdue follow-up"),
    s.meetingsNeedOutcome && `${plural(s.meetingsNeedOutcome, "meeting")} without outcome`,
    s.meetingsToday && `${plural(s.meetingsToday, "meeting")} today`,
    s.newLeads && plural(s.newLeads, "new lead"),
  ].filter(Boolean);
  return `Today at ${orgName}: ${parts.slice(0, 3).join(" · ") || "team summary"}`;
}

const esc = (v: string) => v.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Pure: the email body. */
export function renderSummaryHtml(orgName: string, s: DailySummaryStats) {
  const row = (label: string, n: number, href: string) =>
    n > 0 ? `<tr><td style="padding:6px 12px 6px 0">${label}</td><td style="padding:6px 0;font-weight:600"><a href="${appUrl(href)}">${n}</a></td></tr>` : "";
  const reps = s.byRep
    .filter((r) => r.overdue + r.needOutcome > 0)
    .map((r) => `<li>${esc(r.name)}: ${[r.overdue && `${r.overdue} overdue follow-up${r.overdue === 1 ? "" : "s"}`, r.needOutcome && `${r.needOutcome} meeting${r.needOutcome === 1 ? "" : "s"} without outcome`].filter(Boolean).join(", ")}</li>`)
    .join("");
  return `<div style="font-family:sans-serif;font-size:14px;line-height:1.5">
<p>Good morning — here's what needs attention at <b>${esc(orgName)}</b> today.</p>
<table>${[
    row("Overdue follow-ups", s.overdueFollowUps, "/follow-ups"),
    row("Meetings without an outcome", s.meetingsNeedOutcome, "/meetings"),
    row("Meetings today", s.meetingsToday, "/meetings"),
    row("New leads (last 24h)", s.newLeads, "/leads"),
    row("New leads not contacted after 24h", s.uncontactedLeads, "/leads"),
    row("Unassigned leads", s.unassignedLeads, "/leads"),
  ].join("")}</table>
${reps ? `<p style="margin-top:16px"><b>By team member</b></p><ul>${reps}</ul>` : ""}
<p style="color:#888;font-size:12px;margin-top:24px">Turn this email off in <a href="${appUrl("/settings")}">Settings → General</a>.</p>
</div>`;
}

export class DailySummaryService {
  static async stats(organizationId: string, now = new Date()): Promise<DailySummaryStats> {
    const H = 60 * 60 * 1000;
    const live = and(eq(leads.organizationId, organizationId), isNull(leads.deletedAt));
    const meetingEnded = sql`${meetings.startAt} + ${meetings.durationMinutes} * interval '1 minute' < ${now.toISOString()}::timestamp`;

    const [[overdue], [needOutcome], [today], [fresh], [uncontacted], [unassigned], repRows] = await Promise.all([
      db.select({ n: count() }).from(followUps).innerJoin(leads, eq(followUps.leadId, leads.id))
        .where(and(live, eq(followUps.status, "pending"), lt(followUps.dueAt, now))),
      db.select({ n: count() }).from(meetings).innerJoin(leads, eq(meetings.leadId, leads.id))
        .where(and(live, eq(meetings.status, "scheduled"), meetingEnded, gte(meetings.startAt, new Date(now.getTime() - 14 * 24 * H)))),
      // Sent in the morning, so the next 16h ≈ the rest of today.
      db.select({ n: count() }).from(meetings).innerJoin(leads, eq(meetings.leadId, leads.id))
        .where(and(live, eq(meetings.status, "scheduled"), gte(meetings.startAt, now), lt(meetings.startAt, new Date(now.getTime() + 16 * H)))),
      db.select({ n: count() }).from(leads).where(and(live, gte(leads.createdAt, new Date(now.getTime() - 24 * H)))),
      db.select({ n: count() }).from(leads)
        .where(and(live, isNull(leads.firstContactedAt), lt(leads.createdAt, new Date(now.getTime() - 24 * H)), gte(leads.createdAt, new Date(now.getTime() - 14 * 24 * H)))),
      db.select({ n: count() }).from(leads).where(and(live, isNull(leads.ownerId), gte(leads.createdAt, new Date(now.getTime() - 30 * 24 * H)))),
      db.execute<{ name: string; overdue: number; need_outcome: number }>(sql`
        select coalesce(nullif(trim(concat_ws(' ', u.first_name, u.last_name)), ''), u.email) as name,
          (select count(*)::int from ${followUps} f join ${leads} l on l.id = f.lead_id
            where f.user_id = u.id and f.status = 'pending' and f.due_at < ${now.toISOString()}::timestamp and l.deleted_at is null) as overdue,
          (select count(*)::int from ${meetings} m join ${leads} l on l.id = m.lead_id
            where m.assignee_id = u.id and m.status = 'scheduled' and l.deleted_at is null
              and m.start_at + m.duration_minutes * interval '1 minute' < ${now.toISOString()}::timestamp
              and m.start_at >= ${new Date(now.getTime() - 14 * 24 * H).toISOString()}::timestamp) as need_outcome
        from ${users} u where u.organization_id = ${organizationId} and u.is_active = true and u.deleted_at is null`),
    ]);

    const byRep = [...(repRows as unknown as { name: string; overdue: number; need_outcome: number }[])]
      .map((r) => ({ name: r.name, overdue: Number(r.overdue), needOutcome: Number(r.need_outcome) }))
      .sort((a, b) => b.overdue + b.needOutcome - (a.overdue + a.needOutcome))
      .slice(0, 8);

    return {
      overdueFollowUps: overdue.n,
      meetingsNeedOutcome: needOutcome.n,
      meetingsToday: today.n,
      newLeads: fresh.n,
      uncontactedLeads: uncontacted.n,
      unassignedLeads: unassigned.n,
      byRep,
    };
  }

  private static async adminEmails(organizationId: string) {
    const rows = await db
      .select({ email: users.email, optOut: users.emailOptOut, roleName: roles.name, perms: roles.permissions })
      .from(users)
      .leftJoin(roles, eq(users.roleId, roles.id))
      .where(and(eq(users.organizationId, organizationId), eq(users.isActive, true), isNull(users.deletedAt)));
    return rows
      .filter((u) => !(u.optOut ?? []).includes("daily_summary") && u.email && ((u.roleName ?? "").toLowerCase() === "admin" || (u.perms ?? []).includes("*") || (u.perms ?? []).includes("settings.manage")))
      .map((u) => u.email);
  }

  /** Hourly: send to every org that's in its morning window and hasn't had today's summary. */
  static async runDue(now = new Date()) {
    const orgs = await db
      .select({ id: organizations.id, name: organizations.name, timezone: organizations.timezone, sentOn: organizations.dailySummarySentOn })
      .from(organizations)
      .where(and(eq(organizations.dailySummary, 1), isNull(organizations.suspendedAt)));

    let sent = 0;
    for (const org of orgs) {
      const today = isDueToSend(now, org.timezone, org.sentOn);
      if (!today) continue;
      // Claim the day first so overlapping scans (or a retry) never double-send.
      const [claimed] = await db
        .update(organizations)
        .set({ dailySummarySentOn: today })
        .where(and(eq(organizations.id, org.id), or(isNull(organizations.dailySummarySentOn), sql`${organizations.dailySummarySentOn} <> ${today}`)))
        .returning({ id: organizations.id });
      if (!claimed) continue;
      try {
        const stats = await this.stats(org.id, now);
        if (!isActionable(stats)) continue;
        const html = renderSummaryHtml(org.name, stats);
        for (const to of await this.adminEmails(org.id)) {
          await sendEmail({ to, subject: summarySubject(org.name, stats), html }, org.id);
          sent++;
        }
      } catch (e) {
        console.error(`[daily-summary] org ${org.id} failed`, e);
      }
    }
    return { sent };
  }
}

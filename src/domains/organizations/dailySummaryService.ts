import { db } from "@/db";
import { activities, followUps, leads, meetings, organizations, roles, users } from "@/db/schema";
import { and, count, eq, gte, isNull, lt, or, sql, sum } from "drizzle-orm";
import { callCounts } from "@/domains/leads/callStats";
import { formatCallDuration } from "@/domains/leads/contactLog";
import { appUrl, sendEmail } from "@/lib/mail/mailer";
import { HabitService, recapLine, type Recap } from "@/domains/organizations/habitService";
import { isWorkDay } from "@/lib/workHours";
import { t, type Lang } from "@/lib/i18n";

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
  /** Calls per rep in the last 24h, busiest first. A recap, not a to-do: never makes a day actionable. */
  calls: RepCalls[];
  /** Per-user "your day" for the personal push / WhatsApp nudge. */
  people: Person[];
}

export interface RepCalls {
  name: string;
  calls: number;
  attempts: number; // outgoing
  answered: number; // outgoing that connected
  talkSec: number;
}

/** Pure: "34 calls · 12 of 30 answered · 1h 50m talk time" (talk time only when the phone logged it). */
export function callsLine(r: RepCalls) {
  return [
    plural(r.calls, "call"),
    r.attempts ? `${r.answered} of ${r.attempts} answered` : null,
    r.talkSec ? `${formatCallDuration(r.talkSec)} talk time` : null,
  ].filter(Boolean).join(" · ");
}

export interface Person {
  userId: string;
  firstName: string | null;
  phone: string | null;
  language: string;
  optedOut: boolean;
  overdue: number;
  dueToday: number;
  newLeads: number;
}

/** Pure: the personal morning line, or null when this person has nothing to do today. */
export function personalLine(p: Pick<Person, "overdue" | "dueToday" | "newLeads">, lang: Lang | string = "en"): string | null {
  const parts = [
    p.dueToday && t(lang, "Follow-ups due today: {n}", { n: p.dueToday }),
    p.overdue && t(lang, "Overdue follow-ups: {n}", { n: p.overdue }),
    p.newLeads && t(lang, "New leads since yesterday: {n}", { n: p.newLeads }),
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

export type Milestone = "week_one" | "trial_ends_tomorrow";

const addDays = (ymd: string, n: number) => new Date(Date.parse(`${ymd}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** Pure: which value recap (if any) today's morning run should also send. Local dates, org timezone. */
export function milestoneFor(today: string, tz: string, createdAt: Date, trialEndsAt: Date | null): Milestone | null {
  if (trialEndsAt && localClock(trialEndsAt, tz).date === addDays(today, 1)) return "trial_ends_tomorrow";
  if (addDays(localClock(createdAt, tz).date, 7) === today) return "week_one";
  return null;
}

export function milestoneCopy(m: Milestone, r: Recap) {
  return m === "week_one"
    ? { title: "🎉 Your first week with Ridhzo", body: recapLine(r) }
    : { title: "⏳ Your Starter trial ends tomorrow", body: `So far: ${recapLine(r)}. Keep AI replies and automations running — upgrade in Settings → Billing.` };
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
${s.calls.length ? `<p style="margin-top:16px"><b>Calls in the last 24 hours</b></p><ul>${s.calls.map((r) => `<li>${esc(r.name)}: ${callsLine(r)}</li>`).join("")}</ul>` : ""}
<p style="color:#888;font-size:12px;margin-top:24px">Turn this email off in <a href="${appUrl("/settings")}">Settings → General</a>.</p>
</div>`;
}

export class DailySummaryService {
  static async stats(organizationId: string, now = new Date()): Promise<DailySummaryStats> {
    const H = 60 * 60 * 1000;
    const live = and(eq(leads.organizationId, organizationId), isNull(leads.deletedAt));
    const meetingEnded = sql`${meetings.startAt} + ${meetings.durationMinutes} * interval '1 minute' < ${now.toISOString()}::timestamp`;

    const [[overdue], [needOutcome], [today], [fresh], [uncontacted], [unassigned], repRows, peopleRows, callRows] = await Promise.all([
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
      db.execute(sql`
        select u.id, u.first_name, u.phone, u.language, coalesce(jsonb_exists(u.email_opt_out, 'daily_summary'), false) as opted_out,
          (select count(*)::int from ${followUps} f join ${leads} l on l.id = f.lead_id
            where f.user_id = u.id and f.status = 'pending' and l.deleted_at is null
              and f.due_at < ${now.toISOString()}::timestamp) as overdue,
          (select count(*)::int from ${followUps} f join ${leads} l on l.id = f.lead_id
            where f.user_id = u.id and f.status = 'pending' and l.deleted_at is null
              and f.due_at >= ${now.toISOString()}::timestamp and f.due_at < ${new Date(now.getTime() + 16 * H).toISOString()}::timestamp) as due_today,
          (select count(*)::int from ${leads} l where l.owner_id = u.id and l.deleted_at is null
              and l.created_at >= ${new Date(now.getTime() - 24 * H).toISOString()}::timestamp) as new_leads
        from ${users} u where u.organization_id = ${organizationId} and u.is_active = true and u.deleted_at is null`),
      db
        .select({ firstName: users.firstName, lastName: users.lastName, email: users.email, total: count(), talk: sum(activities.durationSec), ...callCounts })
        .from(activities)
        .innerJoin(users, eq(activities.userId, users.id))
        .where(and(eq(users.organizationId, organizationId), eq(activities.type, "call"), gte(activities.occurredAt, new Date(now.getTime() - 24 * H))))
        .groupBy(activities.userId, users.firstName, users.lastName, users.email),
    ]);

    const people: Person[] = [...(peopleRows as unknown as Record<string, unknown>[])].map((r) => ({
      userId: String(r.id),
      firstName: (r.first_name as string | null) ?? null,
      phone: (r.phone as string | null) ?? null,
      language: String(r.language ?? "en"),
      optedOut: Boolean(r.opted_out),
      overdue: Number(r.overdue),
      dueToday: Number(r.due_today),
      newLeads: Number(r.new_leads),
    }));

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
      calls: callRows
        .map((r) => ({
          name: [r.firstName, r.lastName].filter(Boolean).join(" ") || r.email,
          calls: Number(r.total),
          attempts: Number(r.attempts),
          answered: Number(r.answered),
          talkSec: Number(r.talk ?? 0),
        }))
        .sort((a, b) => b.calls - a.calls)
        .slice(0, 8),
      people,
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
      .select({
        id: organizations.id, name: organizations.name, timezone: organizations.timezone, sentOn: organizations.dailySummarySentOn,
        createdAt: organizations.createdAt, trialEndsAt: organizations.trialEndsAt, workDays: organizations.workDays,
      })
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
        // Day-7 recap / trial-ends-tomorrow go out even on a quiet day — they're the proof of value.
        const milestone = milestoneFor(today, org.timezone, org.createdAt, org.trialEndsAt);
        if (milestone) await this.sendMilestone(org.id, milestone, org.createdAt);
        // No "your day" nudges on the business's day off (milestones above still go — they're one-off).
        if (!isWorkDay(now, org.timezone, org.workDays)) continue;

        const stats = await this.stats(org.id, now);
        if (!isActionable(stats)) continue;
        await this.nudgePeople(stats.people, today);
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

  private static async sendMilestone(organizationId: string, milestone: Milestone, since: Date) {
    const { NotificationService } = await import("@/domains/notifications/service");
    const { title, body } = milestoneCopy(milestone, await HabitService.recap(organizationId, since));
    await NotificationService.notifyOrgAdmins(organizationId, { type: milestone, title, body });
    const html = `<div style="font-family:sans-serif;font-size:14px;line-height:1.5"><p><b>${esc(title)}</b></p><p>${esc(body)}</p>
<p><a href="${appUrl(milestone === "week_one" ? "/" : "/settings/billing")}">${milestone === "week_one" ? "Open your dashboard" : "Keep Starter"}</a></p></div>`;
    for (const to of await this.adminEmails(organizationId)) await sendEmail({ to, subject: title, html }, organizationId);
  }

  // "Your day" push to each person with something to do, plus WhatsApp to their own phone when a
  // Ridhzo-number template is configured (WATXIO_DAILY_SUMMARY_TEMPLATE, variables: [name, line]).
  // Business-initiated WhatsApp needs an approved template, so there's no plain-text fallback.
  private static async nudgePeople(people: Person[], today: string) {
    const { NotificationService } = await import("@/domains/notifications/service");
    const template = process.env.WATXIO_DAILY_SUMMARY_TEMPLATE;
    const { WatxioClient, isConfigured } = await import("@/lib/messaging/whatsapp/client");
    for (const p of people) {
      const line = personalLine(p, p.language);
      if (!line || p.optedOut) continue;
      // Already in their language, so it passes through create()'s translation unchanged.
      await NotificationService.create({
        userId: p.userId,
        type: "daily_summary",
        title: p.firstName ? "☀️ Good morning, {name}" : "☀️ Good morning",
        titleVars: p.firstName ? { name: p.firstName } : undefined,
        body: line,
      });
      if (template && p.phone && isConfigured()) {
        await WatxioClient.sendTemplate(p.phone, template, [p.firstName || "there", line], process.env.WATXIO_TEMPLATE_LANG || "en_US", `daily-${p.userId}-${today}`)
          .catch((e) => console.warn(`[daily-summary] WhatsApp to ${p.userId} failed`, e?.message || e));
      }
    }
  }
}

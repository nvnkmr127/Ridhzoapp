import { db } from "@/db";
import { notifications, users, roles, leads } from "@/db/schema";
import { and, desc, eq, isNull, inArray, lt, sql } from "drizzle-orm";
import { keepAlive } from "@/lib/keepAlive";
import { escapeHtml } from "@/lib/utils";

// High-signal notification types that also warrant an email. Chatty ones (self-completions) don't.
// Email look per notification type: tag text/tone and the button label.
const EMAIL_LOOK: Record<string, { tag: string; tone: "info" | "warn" | "danger" | "ok"; cta: string }> = {
  new_lead: { tag: "New lead", tone: "ok", cta: "Open lead" },
  lead_assigned: { tag: "Lead assigned", tone: "info", cta: "Open lead" },
  follow_up_due: { tag: "Follow-up due", tone: "warn", cta: "Open follow-up" },
  follow_up_overdue: { tag: "Overdue follow-up", tone: "danger", cta: "Follow up now" },
  sla_escalation: { tag: "Needs attention", tone: "danger", cta: "Contact lead" },
  meeting_scheduled: { tag: "Meeting scheduled", tone: "info", cta: "View meeting" },
  meeting_reminder: { tag: "Meeting reminder", tone: "warn", cta: "View meeting" },
};
const EMAIL_TYPES = new Set(["new_lead", "lead_assigned", "follow_up_due", "follow_up_overdue", "sla_escalation", "meeting_scheduled", "meeting_reminder"]);

type Vars = Record<string, string | number>;

export class NotificationService {
  // title/body are English source text (see lib/i18n); pass titleVars/bodyVars for {placeholders}.
  // They're translated into the recipient's language before storing and pushing.
  // mobilePush: false = in-app bell (and browser push) only — for an alert the phone already showed
  // itself (a missed call the app's call receiver notified about the moment it ended).
  static async create(input: { userId: string; type: string; title: string; body?: string; leadId?: string; titleVars?: Vars; bodyVars?: Vars; mobilePush?: boolean }) {
    const { titleVars, bodyVars, mobilePush = true, ...rest } = input;
    const [u] = await db.select({ language: users.language }).from(users).where(eq(users.id, input.userId)).limit(1);
    const { t } = await import("@/lib/i18n");
    const data = {
      ...rest,
      title: t(u?.language, rest.title, titleVars),
      body: rest.body == null ? undefined : t(u?.language, rest.body, bodyVars),
    };
    const [row] = await db.insert(notifications).values(data).returning();
    // Best-effort browser push for closed-tab delivery; the in-app bell is the source of truth.
    const { PushService } = await import("@/lib/push/service");
    keepAlive(PushService.sendToUser(data.userId, {
      title: data.title,
      body: data.body,
      url: data.leadId ? `/leads/${data.leadId}` : "/",
    }), "web push");
    // Best-effort mobile push (Expo + FCM) — same event, native devices. The app routes taps by
    // type/leadId, marks the notification read by id, and shows the unread count on its icon.
    if (mobilePush) keepAlive((async () => {
      const [{ MobilePushService }, { pushChannelFor }, badge] = await Promise.all([
        import("@/lib/push/mobile"),
        import("@/lib/push/channels"),
        NotificationService.unreadCount(data.userId).catch(() => undefined),
      ]);
      await MobilePushService.sendToUser(data.userId, {
        title: data.title,
        body: data.body,
        data: { type: data.type, notificationId: row.id, ...(data.leadId ? { leadId: data.leadId } : {}) },
        channelId: pushChannelFor(data.type),
        badge,
      });
    })(), "mobile push");
    if (EMAIL_TYPES.has(data.type)) keepAlive(NotificationService.email({ ...data, type: data.type }), "notification email");
    return row;
  }

  // Notify the org's admins/owners (role "admin" or a wildcard permission) — used to alert the
  // account that a lead came in, even when it lands unassigned. `excludeUserId` skips the assignee,
  // who already gets their own "assigned" alert, so a solo owner isn't pinged twice for one lead.
  static async notifyOrgAdmins(
    organizationId: string,
    payload: { type: string; title: string; body?: string; leadId?: string; titleVars?: Vars; bodyVars?: Vars },
    excludeUserId?: string,
  ) {
    const rows = await db
      .select({ id: users.id, roleName: roles.name, perms: roles.permissions })
      .from(users)
      .leftJoin(roles, eq(users.roleId, roles.id))
      .where(and(eq(users.organizationId, organizationId), eq(users.isActive, true)));
    const admins = rows.filter((u) => {
      if (excludeUserId && u.id === excludeUserId) return false;
      const name = (u.roleName ?? "").toLowerCase();
      return name === "admin" || (u.perms ?? []).includes("*");
    });
    await Promise.all(admins.map((a) => this.create({ userId: a.id, ...payload })));
  }

  // Best-effort email channel — never throws into the caller. Real delivery needs RESEND_API_KEY;
  // otherwise the mailer logs to the console so the flow still works in dev.
  private static async email(data: { userId: string; type: string; title: string; body?: string; leadId?: string }) {
    try {
      const [user] = await db.select({ email: users.email, emailOptOut: users.emailOptOut, language: users.language }).from(users).where(eq(users.id, data.userId)).limit(1);
      if (!user?.email) return;
      if ((user.emailOptOut ?? []).includes(data.type)) return; // user muted email for this type
      const { sendEmail, appUrl } = await import("@/lib/mail/mailer");
      const { mh, mp, mbtn, mtag, mfine, mfacts, mlinks } = await import("@/lib/mail/layout");
      const { t } = await import("@/lib/i18n");
      const look = EMAIL_LOOK[data.type] ?? { tag: "Notification", tone: "info" as const, cta: "Open in Ridhzo" };
      const link = appUrl(data.leadId ? `/leads/${data.leadId}` : "/");
      // Lead context + one-tap call / WhatsApp so the recipient can act straight from the email.
      let context = "";
      if (data.leadId) {
        const [lead] = await db.select({ name: leads.name, phone: leads.phone, email: leads.email, company: leads.company }).from(leads).where(eq(leads.id, data.leadId)).limit(1);
        if (lead) {
          const rows = ([["Name", lead.name], ["Company", lead.company], ["Phone", lead.phone], ["Email", lead.email]] as [string, string | null][])
            .filter(([, v]) => v).map(([k, v]) => [k, escapeHtml(v!)] as [string, string]);
          const digits = (lead.phone ?? "").replace(/\D/g, "");
          const wa = digits.length === 10 ? `91${digits}` : digits; // ponytail: assumes India for bare 10-digit numbers
          context = (rows.length ? mfacts(rows) : "") + (digits.length >= 10 ? mlinks([[`📞 ${t(user.language, "Call")}`, `tel:+${wa}`], ["💬 WhatsApp", `https://wa.me/${wa}`]]) : "");
        }
      }
      await sendEmail({ from: "notifications",
        to: user.email,
        subject: data.title,
        // Title/body carry lead data from public forms and webhooks — escape before it becomes HTML.
        preheader: data.body ? escapeHtml(data.body).slice(0, 110) : undefined,
        html: mtag(t(user.language, look.tag), look.tone) + mh(escapeHtml(data.title)) + (data.body ? mp(escapeHtml(data.body)) : "") + context + mbtn(t(user.language, look.cta), escapeHtml(link)) + mfine(t(user.language, "The sooner you follow up, the better the chance of winning the lead.")),
      });
    } catch (e) {
      console.error("[notifications] email failed", e);
    }
  }

  // Paging, newest first. cursor: the id of the last one already shown — exact keyset on
  // (created_at, id), so rows sharing a timestamp at a page edge aren't skipped. before: the older
  // app builds' createdAt cursor (millisecond precision; kept so installed apps keep paging).
  static async listForUser(userId: string, opts: { unreadOnly?: boolean; limit?: number; before?: Date; cursor?: string } = {}) {
    const where = and(
      eq(notifications.userId, userId),
      opts.unreadOnly ? isNull(notifications.readAt) : undefined,
      opts.cursor
        ? sql`(${notifications.createdAt}, ${notifications.id}) < (select c.created_at, c.id from notifications c where c.id = ${opts.cursor} and c.user_id = ${userId})`
        : opts.before
          ? lt(notifications.createdAt, opts.before)
          : undefined,
    );
    return db.select().from(notifications)
      .where(where)
      .orderBy(desc(notifications.createdAt), desc(notifications.id))
      .limit(opts.limit ?? 50);
  }

  static async unreadCount(userId: string) {
    // Aggregated in Postgres (was: fetch every unread row's id and count them in Node).
    const [row] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
    return Number(row?.n ?? 0);
  }

  // Mark specific ids read, or all of the user's if ids omitted. Scoped to userId either way.
  static async markRead(userId: string, ids?: string[]) {
    const scope = ids?.length
      ? and(eq(notifications.userId, userId), inArray(notifications.id, ids))
      : and(eq(notifications.userId, userId), isNull(notifications.readAt));
    await db.update(notifications).set({ readAt: new Date() }).where(scope);
  }
}

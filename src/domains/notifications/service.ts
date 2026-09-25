import { db } from "@/db";
import { notifications, users, roles } from "@/db/schema";
import { and, desc, eq, isNull, inArray } from "drizzle-orm";

// High-signal notification types that also warrant an email. Chatty ones (self-completions) don't.
const EMAIL_TYPES = new Set(["new_lead", "lead_assigned", "follow_up_due", "follow_up_overdue", "sla_escalation", "meeting_scheduled", "meeting_reminder"]);

type Vars = Record<string, string | number>;

export class NotificationService {
  // title/body are English source text (see lib/i18n); pass titleVars/bodyVars for {placeholders}.
  // They're translated into the recipient's language before storing and pushing.
  static async create(input: { userId: string; type: string; title: string; body?: string; leadId?: string; titleVars?: Vars; bodyVars?: Vars }) {
    const { titleVars, bodyVars, ...rest } = input;
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
    void PushService.sendToUser(data.userId, {
      title: data.title,
      body: data.body,
      url: data.leadId ? `/leads/${data.leadId}` : "/",
    });
    // Best-effort mobile push (Expo + FCM) — same event, native devices. The app routes taps by
    // type/leadId, marks the notification read by id, and shows the unread count on its icon.
    void (async () => {
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
    })().catch(() => {});
    if (EMAIL_TYPES.has(data.type)) void NotificationService.email({ ...data, type: data.type });
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
      const [user] = await db.select({ email: users.email, emailOptOut: users.emailOptOut }).from(users).where(eq(users.id, data.userId)).limit(1);
      if (!user?.email) return;
      if ((user.emailOptOut ?? []).includes(data.type)) return; // user muted email for this type
      const { sendEmail, appUrl } = await import("@/lib/mail/mailer");
      const link = appUrl(data.leadId ? `/leads/${data.leadId}` : "/");
      await sendEmail({
        to: user.email,
        subject: data.title,
        html: `<p>${data.body ?? data.title}</p><p><a href="${link}">Open in Ridhzo</a></p>`,
      });
    } catch (e) {
      console.error("[notifications] email failed", e);
    }
  }

  static async listForUser(userId: string, opts: { unreadOnly?: boolean; limit?: number } = {}) {
    const where = opts.unreadOnly
      ? and(eq(notifications.userId, userId), isNull(notifications.readAt))
      : eq(notifications.userId, userId);
    return db.select().from(notifications)
      .where(where)
      .orderBy(desc(notifications.createdAt))
      .limit(opts.limit ?? 50);
  }

  static async unreadCount(userId: string) {
    const rows = await db.select({ id: notifications.id }).from(notifications)
      .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
    return rows.length;
  }

  // Mark specific ids read, or all of the user's if ids omitted. Scoped to userId either way.
  static async markRead(userId: string, ids?: string[]) {
    const scope = ids?.length
      ? and(eq(notifications.userId, userId), inArray(notifications.id, ids))
      : and(eq(notifications.userId, userId), isNull(notifications.readAt));
    await db.update(notifications).set({ readAt: new Date() }).where(scope);
  }
}

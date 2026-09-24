import { db } from "@/db";
import { meetings, meetingLocations, leads, users, organizations } from "@/db/schema";
import { and, asc, desc, eq, gte, lte, or, isNull, type SQL } from "drizzle-orm";
import { ActivityService } from "@/domains/activities/service";
import { NotificationService } from "@/domains/notifications/service";
import { GoogleCalendarService } from "@/domains/integrations/googleCalendarService";
import { FollowUpService } from "@/domains/follow-ups/service";
import { syncLeadFollowUpState, markLeadContacted } from "@/domains/follow-ups/state";
import { sendEmail } from "@/lib/mail/mailer";
import {
  formatMeetingTime,
  googleCalendarLink,
  leadMessage,
  meetingEnd,
  meetingWhere,
  modeLabel,
  type MeetingMode,
  type MeetingStatus,
} from "./format";

export type Meeting = typeof meetings.$inferSelect;

export interface MeetingInput {
  leadId: string;
  mode: MeetingMode;
  title?: string;
  startAt: Date;
  durationMinutes: number;
  assigneeId?: string | null;
  locationId?: string | null;
  locationName?: string | null;
  address?: string | null;
  mapUrl?: string | null;
  meetingUrl?: string | null;
  // Online only: have Google Calendar generate a Meet link.
  autoMeet?: boolean;
  notes?: string | null;
  notifyLead?: boolean;
}

// What the caller should show after a create/reschedule/cancel: the lead-facing text for a one-tap
// WhatsApp send, and which channels already went out automatically.
export interface LeadNotice {
  whatsappText: string;
  emailed: boolean;
  whatsappSent: boolean;
}

// Expected, user-facing failures — actionFail passes the message through as a validation error.
class MeetingError extends Error {
  code = "VALIDATION" as const;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function userName(u: { firstName: string | null; lastName: string | null; email: string } | undefined | null) {
  if (!u) return null;
  return [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email;
}

async function getUser(id: string | null | undefined) {
  if (!id) return null;
  const [u] = await db.select({ id: users.id, firstName: users.firstName, lastName: users.lastName, email: users.email }).from(users).where(eq(users.id, id)).limit(1);
  return u ?? null;
}

async function getOrg(organizationId: string) {
  const [org] = await db
    .select({ name: organizations.name, timezone: organizations.timezone, locale: organizations.locale, whatsappMode: organizations.whatsappMode })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);
  return org ?? { name: "us", timezone: "UTC", locale: "en", whatsappMode: "personal" };
}

async function getLead(leadId: string, organizationId: string) {
  const [lead] = await db
    .select({ id: leads.id, name: leads.name, email: leads.email, phone: leads.phone, ownerId: leads.ownerId })
    .from(leads)
    .where(and(eq(leads.id, leadId), eq(leads.organizationId, organizationId)))
    .limit(1);
  if (!lead) throw new Error("Lead not found");
  return lead;
}

function calendarEvent(m: Meeting, lead: { name: string; email: string | null }) {
  return {
    summary: m.title,
    description: [m.notes, `Lead: ${lead.name}`].filter(Boolean).join("\n\n"),
    start: new Date(m.startAt),
    end: meetingEnd(m),
    location: meetingWhere(m) || undefined,
    attendeeEmail: lead.email || undefined,
  };
}

export class MeetingService {
  static scope(id: string, organizationId: string): SQL {
    return and(eq(meetings.id, id), eq(meetings.organizationId, organizationId))!;
  }

  static async get(id: string, organizationId: string) {
    const [m] = await db.select().from(meetings).where(this.scope(id, organizationId)).limit(1);
    return m ?? null;
  }

  static async listForLead(leadId: string, organizationId: string) {
    return db
      .select()
      .from(meetings)
      .where(and(eq(meetings.leadId, leadId), eq(meetings.organizationId, organizationId)))
      .orderBy(desc(meetings.startAt));
  }

  // Meetings list/calendar. `userId` limits to meetings the user attends, booked, or whose lead they own.
  static async list(organizationId: string, f: { userId?: string; assigneeId?: string; mode?: string; status?: string; from?: Date; to?: Date } = {}) {
    const conds: (SQL | undefined)[] = [eq(meetings.organizationId, organizationId), isNull(leads.deletedAt)];
    if (f.userId) conds.push(or(eq(meetings.assigneeId, f.userId), eq(meetings.organizerId, f.userId), eq(leads.ownerId, f.userId)));
    if (f.assigneeId) conds.push(eq(meetings.assigneeId, f.assigneeId));
    if (f.mode) conds.push(eq(meetings.mode, f.mode));
    if (f.status) conds.push(eq(meetings.status, f.status));
    if (f.from) conds.push(gte(meetings.startAt, f.from));
    if (f.to) conds.push(lte(meetings.startAt, f.to));
    return db
      .select({ meeting: meetings, lead: { id: leads.id, name: leads.name, phone: leads.phone }, assignee: { firstName: users.firstName, lastName: users.lastName, email: users.email } })
      .from(meetings)
      .innerJoin(leads, eq(meetings.leadId, leads.id))
      .leftJoin(users, eq(meetings.assigneeId, users.id))
      .where(and(...conds))
      .orderBy(asc(meetings.startAt));
  }

  // Resolve "where" from a saved location (copied onto the meeting) or the free-text fields.
  private static async resolvePlace(input: MeetingInput, organizationId: string) {
    if (input.mode === "online") return { locationName: null, address: null, mapUrl: null, meetingUrl: input.meetingUrl || null };
    if (input.locationId) {
      const [loc] = await db.select().from(meetingLocations)
        .where(and(eq(meetingLocations.id, input.locationId), eq(meetingLocations.organizationId, organizationId))).limit(1);
      if (!loc) throw new MeetingError("That location no longer exists");
      return { locationName: loc.name, address: loc.address, mapUrl: loc.mapUrl, meetingUrl: null };
    }
    return { locationName: input.locationName || null, address: input.address || null, mapUrl: input.mapUrl || null, meetingUrl: null };
  }

  // Put the event on the attendee's calendar (falling back to the organizer's). Returns the Meet link
  // when one was requested and created.
  private static async syncCalendarOnCreate(m: Meeting, lead: { name: string; email: string | null }, organizerId: string | null, autoMeet: boolean) {
    const candidates = [m.assigneeId, organizerId].filter((x, i, a): x is string => !!x && a.indexOf(x) === i);
    for (const uid of candidates) {
      if (!(await GoogleCalendarService.isConnected(uid))) continue;
      const created = await GoogleCalendarService.createEvent(uid, { ...calendarEvent(m, lead), withMeet: autoMeet, requestId: m.id });
      if (!created) continue;
      const patch: Partial<Meeting> = { googleEventId: created.id, googleEventOwnerId: uid };
      if (autoMeet && created.meetUrl) patch.meetingUrl = created.meetUrl;
      const [updated] = await db.update(meetings).set(patch).where(eq(meetings.id, m.id)).returning();
      return updated;
    }
    return m;
  }

  // Whether a Meet link can be generated for this booking (someone on it has Google connected).
  static async canAutoMeet(userIds: (string | null | undefined)[]) {
    for (const uid of userIds) if (uid && (await GoogleCalendarService.isConnected(uid))) return true;
    return false;
  }

  // Tell the lead. Email goes out automatically when they have an address; WhatsApp is automatic only
  // for Business API workspaces inside the 24h window — otherwise the rep gets the text for a one-tap send.
  static async notifyLead(kind: "confirm" | "reschedule" | "reminder" | "cancel", m: Meeting, opts: { send: boolean; userId?: string }): Promise<LeadNotice> {
    const [lead, org, rep] = await Promise.all([getLead(m.leadId, m.organizationId), getOrg(m.organizationId), getUser(m.assigneeId)]);
    const ctx = { leadName: lead.name, orgName: org.name, repName: userName(rep), timeZone: org.timezone, locale: org.locale };
    const text = leadMessage(kind, m, ctx);
    const notice: LeadNotice = { whatsappText: text, emailed: false, whatsappSent: false };
    if (!opts.send) return notice;

    if (lead.email) {
      try {
        const subject = {
          confirm: `Confirmed: ${modeLabel(m.mode)} with ${org.name}`,
          reschedule: `New time: ${modeLabel(m.mode)} with ${org.name}`,
          reminder: `Reminder: ${modeLabel(m.mode)} with ${org.name}, ${formatMeetingTime(m.startAt, org.timezone, org.locale)}`,
          cancel: `Cancelled: ${modeLabel(m.mode)} with ${org.name}`,
        }[kind];
        const link = kind === "cancel" ? "" : `<p><a href="${esc(googleCalendarLink(m, `With ${org.name}`))}">Add to Google Calendar</a></p>`;
        const html = `<div style="font-family:sans-serif;font-size:14px;line-height:1.5">${esc(text).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>').replace(/\n/g, "<br>")}${link}</div>`;
        await sendEmail({ to: lead.email, subject, html }, m.organizationId);
        notice.emailed = true;
      } catch (e) {
        console.error("[meetings] lead email failed", (e as Error)?.message);
      }
    }

    if (org.whatsappMode === "bsp" && lead.phone) {
      try {
        const { WhatsAppService } = await import("@/lib/messaging/whatsapp/service");
        await WhatsAppService.send({ leadId: m.leadId, userId: opts.userId, body: text });
        notice.whatsappSent = true;
      } catch {
        // Outside the 24h window (needs a template) or not configured — rep sends it by hand.
      }
    }

    if (notice.emailed || notice.whatsappSent) {
      await ActivityService.addActivity({
        leadId: m.leadId,
        userId: opts.userId,
        type: "meeting",
        content: `${kind === "reminder" ? "Reminder" : kind === "cancel" ? "Cancellation" : "Confirmation"} sent to lead by ${[notice.emailed && "email", notice.whatsappSent && "WhatsApp"].filter(Boolean).join(" and ")}`,
      });
    }
    return notice;
  }

  static async create(input: MeetingInput, ctx: { userId: string | null; organizationId: string }) {
    const lead = await getLead(input.leadId, ctx.organizationId);
    const assigneeId = input.assigneeId || lead.ownerId || ctx.userId;
    if (assigneeId) await this.assertOrgUser(assigneeId, ctx.organizationId);
    const place = await this.resolvePlace(input, ctx.organizationId);

    const [created] = await db.insert(meetings).values({
      organizationId: ctx.organizationId,
      leadId: input.leadId,
      organizerId: ctx.userId,
      assigneeId,
      mode: input.mode,
      title: input.title?.trim() || `${modeLabel(input.mode)} with ${lead.name}`,
      startAt: input.startAt,
      durationMinutes: input.durationMinutes,
      ...place,
      notes: input.notes || null,
      status: "scheduled",
      bookedAt: new Date(),
    }).returning();

    const meeting = await this.syncCalendarOnCreate(created, lead, ctx.userId, input.mode === "online" && !!input.autoMeet);
    await syncLeadFollowUpState(meeting.leadId);

    const [assignee, org] = await Promise.all([getUser(assigneeId), getOrg(ctx.organizationId)]);
    const when = formatMeetingTime(meeting.startAt, org.timezone, org.locale);
    await ActivityService.addActivity({
      leadId: meeting.leadId,
      userId: ctx.userId ?? undefined,
      type: "meeting",
      content: `${modeLabel(meeting.mode)} scheduled for ${when}${assignee && assigneeId !== ctx.userId ? ` with ${userName(assignee)}` : ""}${meetingWhere(meeting) ? ` — ${meetingWhere(meeting)}` : ""}`,
    });

    if (assigneeId && assigneeId !== ctx.userId) {
      await NotificationService.create({
        userId: assigneeId,
        type: "meeting_scheduled",
        title: `${modeLabel(meeting.mode)} with ${lead.name}`,
        body: `${when}${meetingWhere(meeting) ? ` · ${meetingWhere(meeting)}` : ""}`,
        leadId: meeting.leadId,
      });
    }

    const notice = await this.notifyLead("confirm", meeting, { send: input.notifyLead !== false, userId: ctx.userId ?? undefined });
    return { meeting, notice };
  }

  // Edit time/place/assignee. A new time resets the reminder clock and moves the calendar event.
  static async update(id: string, input: Omit<MeetingInput, "leadId">, ctx: { userId: string; organizationId: string }) {
    const existing = await this.get(id, ctx.organizationId);
    if (!existing) return null;
    if (existing.status !== "scheduled") throw new MeetingError("Only scheduled meetings can be edited");
    if (input.assigneeId) await this.assertOrgUser(input.assigneeId, ctx.organizationId);
    const place = await this.resolvePlace({ ...input, leadId: existing.leadId }, ctx.organizationId);
    const moved = new Date(input.startAt).getTime() !== new Date(existing.startAt).getTime();

    const [updated] = await db.update(meetings).set({
      mode: input.mode,
      title: input.title?.trim() || existing.title,
      startAt: input.startAt,
      durationMinutes: input.durationMinutes,
      assigneeId: input.assigneeId || existing.assigneeId,
      ...place,
      // Keep an auto-generated Meet link when the rep didn't paste a different one.
      meetingUrl: input.mode === "online" ? place.meetingUrl || existing.meetingUrl : null,
      notes: input.notes ?? existing.notes,
      ...(moved ? { bookedAt: new Date(), leadReminder24hSentAt: null, leadReminder1hSentAt: null, repReminderSentAt: null, outcomePromptSentAt: null } : {}),
      updatedAt: new Date(),
    }).where(this.scope(id, ctx.organizationId)).returning();

    const lead = await getLead(updated.leadId, ctx.organizationId);
    if (updated.googleEventId && updated.googleEventOwnerId) {
      await GoogleCalendarService.updateEvent(updated.googleEventOwnerId, updated.googleEventId, calendarEvent(updated, lead));
    } else {
      await this.syncCalendarOnCreate(updated, lead, ctx.userId, false);
    }
    await syncLeadFollowUpState(updated.leadId);

    const org = await getOrg(ctx.organizationId);
    await ActivityService.addActivity({
      leadId: updated.leadId,
      userId: ctx.userId,
      type: "meeting",
      content: moved ? `${modeLabel(updated.mode)} rescheduled to ${formatMeetingTime(updated.startAt, org.timezone, org.locale)}` : `${modeLabel(updated.mode)} details updated`,
    });

    const notice = await this.notifyLead(moved ? "reschedule" : "confirm", updated, { send: moved && input.notifyLead !== false, userId: ctx.userId });
    return { meeting: updated, notice };
  }

  // Record what happened. Optionally books the next follow-up in the same step.
  static async setOutcome(
    id: string,
    input: { status: Exclude<MeetingStatus, "scheduled">; outcome?: string | null; nextFollowUpAt?: Date | null; notifyLead?: boolean },
    ctx: { userId: string; organizationId: string },
  ) {
    const existing = await this.get(id, ctx.organizationId);
    if (!existing) return null;
    const [updated] = await db.update(meetings).set({
      status: input.status,
      outcome: input.outcome || null,
      completedAt: input.status === "completed" ? new Date() : null,
      updatedAt: new Date(),
    }).where(this.scope(id, ctx.organizationId)).returning();

    if (input.status === "completed") await markLeadContacted(updated.leadId, new Date());
    if (input.status === "cancelled" && updated.googleEventId && updated.googleEventOwnerId) {
      await GoogleCalendarService.deleteEvent(updated.googleEventOwnerId, updated.googleEventId);
    }

    const label = { completed: "done", no_show: "marked no-show", cancelled: "cancelled" }[input.status];
    await ActivityService.addActivity({
      leadId: updated.leadId,
      userId: ctx.userId,
      type: "meeting",
      content: `${modeLabel(updated.mode)} ${label}${input.outcome ? `\nOutcome: ${input.outcome}` : ""}`,
    });

    if (input.nextFollowUpAt) {
      await FollowUpService.createFollowUp({
        leadId: updated.leadId,
        type: "call",
        title: input.status === "no_show" ? `Call ${(await getLead(updated.leadId, ctx.organizationId)).name} — missed ${modeLabel(updated.mode).toLowerCase()}` : `Follow up after ${modeLabel(updated.mode).toLowerCase()}`,
        description: input.outcome || undefined,
        dueAt: input.nextFollowUpAt,
        userId: ctx.userId,
        organizationId: ctx.organizationId,
      });
    }
    await syncLeadFollowUpState(updated.leadId);

    let notice: LeadNotice | null = null;
    if (input.status === "cancelled") notice = await this.notifyLead("cancel", updated, { send: !!input.notifyLead, userId: ctx.userId });
    return { meeting: updated, notice };
  }

  // Undo an outcome (e.g. marked done by mistake) — back to scheduled.
  static async reopen(id: string, ctx: { userId: string; organizationId: string }) {
    const [updated] = await db.update(meetings)
      .set({ status: "scheduled", completedAt: null, updatedAt: new Date() })
      .where(this.scope(id, ctx.organizationId))
      .returning();
    if (updated) await syncLeadFollowUpState(updated.leadId);
    return updated ?? null;
  }

  // Field check-in: proves the rep reached the site/store. Coordinates are optional (GPS may be denied).
  static async checkIn(id: string, coords: { lat: number; lng: number } | null, ctx: { userId: string; organizationId: string }) {
    const [updated] = await db.update(meetings)
      .set({ checkedInAt: new Date(), checkInLat: coords?.lat ?? null, checkInLng: coords?.lng ?? null, updatedAt: new Date() })
      .where(this.scope(id, ctx.organizationId))
      .returning();
    if (!updated) return null;
    await ActivityService.addActivity({
      leadId: updated.leadId,
      userId: ctx.userId,
      type: "meeting",
      content: `Checked in for ${modeLabel(updated.mode).toLowerCase()}${coords ? ` — https://maps.google.com/?q=${coords.lat},${coords.lng}` : " (location not shared)"}`,
    });
    return updated;
  }

  private static async assertOrgUser(userId: string, organizationId: string) {
    const [u] = await db.select({ id: users.id }).from(users)
      .where(and(eq(users.id, userId), eq(users.organizationId, organizationId), eq(users.isActive, true))).limit(1);
    if (!u) throw new MeetingError("That team member isn't in this workspace");
  }

  // ---- Saved locations ----
  static listLocations(organizationId: string) {
    return db.select().from(meetingLocations).where(eq(meetingLocations.organizationId, organizationId)).orderBy(asc(meetingLocations.name));
  }

  static async saveLocation(organizationId: string, input: { id?: string; name: string; address?: string | null; mapUrl?: string | null; phone?: string | null }) {
    const values = { name: input.name, address: input.address || null, mapUrl: input.mapUrl || null, phone: input.phone || null };
    if (input.id) {
      const [row] = await db.update(meetingLocations).set(values)
        .where(and(eq(meetingLocations.id, input.id), eq(meetingLocations.organizationId, organizationId))).returning();
      return row ?? null;
    }
    const [row] = await db.insert(meetingLocations).values({ organizationId, ...values }).returning();
    return row;
  }

  static async deleteLocation(organizationId: string, id: string) {
    await db.delete(meetingLocations).where(and(eq(meetingLocations.id, id), eq(meetingLocations.organizationId, organizationId)));
  }
}

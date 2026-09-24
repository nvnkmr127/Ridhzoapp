"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { assertWritable, requirePermission } from "@/lib/rbac";
import { assertLeadAccess } from "@/lib/leads/access";
import { MeetingService } from "@/domains/meetings/service";
import {
  coordsSchema,
  locationSchema,
  parseMeetingInput,
  parseOutcomeInput,
  templatesSchema,
  type MeetingForm,
  type ParseError,
} from "@/domains/meetings/validation";
import { ok, fail, actionFail, zodFieldErrors } from "@/lib/actions/result";

function revalidate(leadId: string) {
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/meetings");
  revalidatePath("/follow-ups");
  revalidatePath("/follow-ups/calendar");
}

// A meeting is reachable by the person attending it or booking it, or through lead access.
async function assertMeetingAccess(id: string, ctx: { userId: string; organizationId: string }) {
  const m = await MeetingService.get(id, ctx.organizationId);
  if (!m) throw new Error("Meeting not found");
  if (m.assigneeId !== ctx.userId && m.organizerId !== ctx.userId) await assertLeadAccess(m.leadId, ctx);
  return m;
}

const invalid = (e: ParseError) => fail("VALIDATION", e.message, e.fieldErrors);

export async function createMeetingAction(leadId: string, input: MeetingForm) {
  const { userId, organizationId } = await assertWritable();
  const p = parseMeetingInput(input);
  if (p.error) return invalid(p.error);
  if (p.data.startAt.getTime() < Date.now() - 5 * 60_000) {
    return fail("VALIDATION", "That time has already passed. Pick a time in the future.", { startAt: "In the past." });
  }
  try {
    await assertLeadAccess(leadId, { userId, organizationId });
    if (p.data.mode === "online" && p.data.autoMeet && !(await MeetingService.canAutoMeet([p.data.assigneeId, userId]))) {
      return fail("VALIDATION", "Connect Google Calendar (Settings → Integrations) to create Meet links, or paste a link instead.");
    }
    const res = await MeetingService.create({ ...p.data, leadId }, { userId, organizationId });
    revalidate(leadId);
    return ok(res);
  } catch (e) {
    return actionFail(e);
  }
}

export async function updateMeetingAction(id: string, input: MeetingForm) {
  const { userId, organizationId } = await assertWritable();
  const p = parseMeetingInput({ ...input, autoMeet: false }, true);
  if (p.error) return invalid(p.error);
  try {
    await assertMeetingAccess(id, { userId, organizationId });
    const res = await MeetingService.update(id, p.data, { userId, organizationId });
    if (!res) return fail("NOT_FOUND", "This meeting no longer exists.");
    revalidate(res.meeting.leadId);
    return ok(res);
  } catch (e) {
    return actionFail(e);
  }
}

export async function setMeetingOutcomeAction(id: string, input: { status: "completed" | "no_show" | "cancelled"; outcome?: string | null; nextFollowUpAt?: string | Date | null; notifyLead?: boolean }) {
  const { userId, organizationId } = await assertWritable();
  const parsed = parseOutcomeInput(input);
  if (parsed.error) return invalid(parsed.error);
  try {
    await assertMeetingAccess(id, { userId, organizationId });
    const res = await MeetingService.setOutcome(id, parsed.data, { userId, organizationId });
    if (!res) return fail("NOT_FOUND", "This meeting no longer exists.");
    revalidate(res.meeting.leadId);
    return ok(res);
  } catch (e) {
    return actionFail(e);
  }
}

export async function reopenMeetingAction(id: string) {
  const { userId, organizationId } = await assertWritable();
  try {
    await assertMeetingAccess(id, { userId, organizationId });
    const m = await MeetingService.reopen(id, { userId, organizationId });
    if (!m) return fail("NOT_FOUND", "This meeting no longer exists.");
    revalidate(m.leadId);
    return ok(m);
  } catch (e) {
    return actionFail(e);
  }
}

// Re-send the confirmation (e.g. for a booking-page request, or a nudge). Emails automatically when
// possible and returns the WhatsApp text for a one-tap send.
export async function sendMeetingConfirmationAction(id: string) {
  const { userId, organizationId } = await assertWritable();
  try {
    const m = await assertMeetingAccess(id, { userId, organizationId });
    if (m.status !== "scheduled") return fail("VALIDATION", "Only upcoming meetings can be confirmed.");
    const notice = await MeetingService.notifyLead("confirm", m, { send: true, userId });
    revalidate(m.leadId);
    return ok(notice);
  } catch (e) {
    return actionFail(e);
  }
}

export async function checkInMeetingAction(id: string, coords: z.input<typeof coordsSchema>) {
  const { userId, organizationId } = await assertWritable();
  const parsed = coordsSchema.safeParse(coords);
  if (!parsed.success) return fail("VALIDATION", "That location looks invalid.");
  try {
    await assertMeetingAccess(id, { userId, organizationId });
    const m = await MeetingService.checkIn(id, parsed.data, { userId, organizationId });
    if (!m) return fail("NOT_FOUND", "This meeting no longer exists.");
    revalidate(m.leadId);
    return ok(m);
  } catch (e) {
    return actionFail(e);
  }
}

// ---- Saved locations (admins) ----
export async function saveMeetingLocationAction(input: z.input<typeof locationSchema>) {
  const { organizationId } = await requirePermission("settings.manage");
  const parsed = locationSchema.safeParse(input);
  if (!parsed.success) return fail("VALIDATION", "Please check the location details.", zodFieldErrors(parsed.error));
  try {
    const row = await MeetingService.saveLocation(organizationId, parsed.data);
    if (!row) return fail("NOT_FOUND", "This location no longer exists.");
    revalidatePath("/settings/meetings");
    return ok(row);
  } catch (e) {
    return actionFail(e);
  }
}

export async function deleteMeetingLocationAction(id: string) {
  const { organizationId } = await requirePermission("settings.manage");
  try {
    await MeetingService.deleteLocation(organizationId, id);
    revalidatePath("/settings/meetings");
    return ok({ id });
  } catch (e) {
    return actionFail(e);
  }
}

// ---- WhatsApp templates for meeting messages (Business API workspaces) ----
export async function saveMeetingTemplatesAction(input: z.input<typeof templatesSchema>) {
  const { organizationId } = await requirePermission("settings.manage");
  const parsed = templatesSchema.safeParse(input);
  if (!parsed.success) return fail("VALIDATION", "Please check the template settings.", zodFieldErrors(parsed.error));
  try {
    const { db } = await import("@/db");
    const { organizations } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    await db.update(organizations).set({
      meetingConfirmTemplate: parsed.data.confirmTemplate || null,
      meetingReminderTemplate: parsed.data.reminderTemplate || null,
      meetingTemplateLanguage: parsed.data.language,
      updatedAt: new Date(),
    }).where(eq(organizations.id, organizationId));
    revalidatePath("/settings/meetings");
    return ok({ saved: true });
  } catch (e) {
    return actionFail(e);
  }
}

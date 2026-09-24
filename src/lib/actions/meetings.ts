"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { assertWritable, requirePermission } from "@/lib/rbac";
import { assertLeadAccess } from "@/lib/leads/access";
import { MeetingService } from "@/domains/meetings/service";
import { MEETING_MODE_KEYS } from "@/domains/meetings/format";
import { ok, fail, actionFail, zodFieldErrors } from "@/lib/actions/result";

// z.guid() (any 8-4-4-4-12 hex), not z.uuid(): zod v4's uuid() rejects non-RFC ids like the seeded
// 00000000-0000-0000-0000-000000000001 users.
const id = () => z.guid();
const optText = (max: number) => z.string().trim().max(max).optional().nullable();
const optUrl = z
  .string()
  .trim()
  .max(2000)
  .refine((v) => !v || /^https?:\/\//i.test(v), "Must start with http:// or https://")
  .optional()
  .nullable();

const meetingSchema = z.object({
  mode: z.enum(MEETING_MODE_KEYS as [string, ...string[]]),
  title: optText(255),
  startAt: z.coerce.date(),
  durationMinutes: z.coerce.number().int().min(5).max(24 * 60),
  assigneeId: id().optional().nullable().or(z.literal("")),
  locationId: id().optional().nullable().or(z.literal("")),
  locationName: optText(255),
  address: optText(1000),
  mapUrl: optUrl,
  meetingUrl: optUrl,
  autoMeet: z.boolean().optional(),
  notes: optText(2000),
  notifyLead: z.boolean().optional(),
});
type MeetingForm = z.input<typeof meetingSchema>;

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

function parse(input: MeetingForm, editing = false) {
  const parsed = meetingSchema.safeParse(input);
  if (!parsed.success) {
    const fields = zodFieldErrors(parsed.error);
    const [field, msg] = Object.entries(fields)[0] ?? [];
    return { error: fail("VALIDATION", field ? `Please check the meeting details (${field}: ${msg}).` : "Please check the meeting details.", fields) };
  }
  const d = parsed.data;
  if (Number.isNaN(d.startAt.getTime())) return { error: fail("VALIDATION", "Pick a valid date and time.", { startAt: "Invalid date." }) };
  // When editing, an empty link keeps the one already on the meeting (e.g. an auto-created Meet link).
  if (d.mode === "online" && !d.autoMeet && !d.meetingUrl && !editing) {
    return { error: fail("VALIDATION", "Add a meeting link, or choose Google Meet to create one.", { meetingUrl: "Required for online meetings." }) };
  }
  if (d.mode !== "online" && !d.locationId && !d.address && !d.locationName && !d.mapUrl) {
    return { error: fail("VALIDATION", "Add where the meeting is — pick a saved location or type an address.", { address: "Required." }) };
  }
  return { data: { ...d, mode: d.mode as (typeof MEETING_MODE_KEYS)[number], assigneeId: d.assigneeId || null, locationId: d.locationId || null, title: d.title ?? undefined } };
}

export async function createMeetingAction(leadId: string, input: MeetingForm) {
  const { userId, organizationId } = await assertWritable();
  const p = parse(input);
  if (p.error) return p.error;
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
  const p = parse({ ...input, autoMeet: false }, true);
  if (p.error) return p.error;
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

const outcomeSchema = z.object({
  status: z.enum(["completed", "no_show", "cancelled"]),
  outcome: optText(2000),
  nextFollowUpAt: z.coerce.date().optional().nullable(),
  notifyLead: z.boolean().optional(),
});

export async function setMeetingOutcomeAction(id: string, input: z.input<typeof outcomeSchema>) {
  const { userId, organizationId } = await assertWritable();
  const parsed = outcomeSchema.safeParse(input);
  if (!parsed.success) return fail("VALIDATION", "Please check the outcome.", zodFieldErrors(parsed.error));
  if (parsed.data.nextFollowUpAt && Number.isNaN(parsed.data.nextFollowUpAt.getTime())) {
    return fail("VALIDATION", "Pick a valid date for the next follow-up.");
  }
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

const coordsSchema = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }).nullable();

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
const locationSchema = z.object({
  id: id().optional(),
  name: z.string().trim().min(1, "Name is required").max(255),
  address: optText(1000),
  mapUrl: optUrl,
  phone: optText(50),
});

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

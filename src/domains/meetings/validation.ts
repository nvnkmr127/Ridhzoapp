import { z } from "zod";
import { MEETING_MODE_KEYS, type MeetingMode } from "./format";

// Input rules shared by the web server actions and the /api/v1 meeting endpoints.

// z.guid() (any 8-4-4-4-12 hex), not z.uuid(): zod v4's uuid() rejects non-RFC ids like the seeded
// 00000000-0000-0000-0000-000000000001 users.
export const guid = () => z.guid();
export const optText = (max: number) => z.string().trim().max(max).optional().nullable();
// Links are often pasted without the scheme ("maps.app.goo.gl/…", "meet.google.com/…") — add https://.
export const optUrl = z
  .string()
  .trim()
  .max(2000)
  .transform((v) => (v && !/^https?:\/\//i.test(v) && /^[\w-]+(\.[\w-]+)+/.test(v) ? `https://${v}` : v))
  .refine((v) => !v || /^https?:\/\//i.test(v), "Enter a link like https://maps.app.goo.gl/…")
  .optional()
  .nullable();

export const meetingSchema = z.object({
  mode: z.enum(MEETING_MODE_KEYS as [MeetingMode, ...MeetingMode[]]),
  title: optText(255),
  startAt: z.coerce.date(),
  durationMinutes: z.coerce.number().int().min(5).max(24 * 60),
  assigneeId: guid().optional().nullable().or(z.literal("")),
  locationId: guid().optional().nullable().or(z.literal("")),
  locationName: optText(255),
  address: optText(1000),
  mapUrl: optUrl,
  meetingUrl: optUrl,
  autoMeet: z.boolean().optional(),
  notes: optText(2000),
  notifyLead: z.boolean().optional(),
});
export type MeetingForm = z.input<typeof meetingSchema>;

export type ParseError = { message: string; fieldErrors: Record<string, string> };

function fieldErrors(err: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of err.issues) {
    const k = i.path.join(".") || "_";
    if (!out[k]) out[k] = i.message;
  }
  return out;
}

// Validates a booking/edit. `editing` allows an online meeting with no link (keeps the current one).
export function parseMeetingInput(input: unknown, editing = false) {
  const parsed = meetingSchema.safeParse(input);
  if (!parsed.success) {
    const fields = fieldErrors(parsed.error);
    const [field, msg] = Object.entries(fields)[0] ?? [];
    return { error: { message: field ? `Please check the meeting details (${field}: ${msg}).` : "Please check the meeting details.", fieldErrors: fields } as ParseError };
  }
  const d = parsed.data;
  if (Number.isNaN(d.startAt.getTime())) return { error: { message: "Pick a valid date and time.", fieldErrors: { startAt: "Invalid date." } } };
  if (d.mode === "online" && !d.autoMeet && !d.meetingUrl && !editing) {
    return { error: { message: "Add a meeting link, or choose Google Meet to create one.", fieldErrors: { meetingUrl: "Required for online meetings." } } };
  }
  if (d.mode !== "online" && !d.locationId && !d.address && !d.locationName && !d.mapUrl) {
    return { error: { message: "Add where the meeting is — pick a saved location or type an address.", fieldErrors: { address: "Required." } } };
  }
  return { data: { ...d, assigneeId: d.assigneeId || null, locationId: d.locationId || null, title: d.title ?? undefined } };
}

export const outcomeSchema = z.object({
  status: z.enum(["completed", "no_show", "cancelled"]),
  outcome: optText(2000),
  nextFollowUpAt: z.coerce.date().optional().nullable(),
  notifyLead: z.boolean().optional(),
});

export function parseOutcomeInput(input: unknown) {
  const parsed = outcomeSchema.safeParse(input);
  if (!parsed.success) return { error: { message: "Please check the outcome.", fieldErrors: fieldErrors(parsed.error) } as ParseError };
  if (parsed.data.nextFollowUpAt && Number.isNaN(parsed.data.nextFollowUpAt.getTime())) {
    return { error: { message: "Pick a valid date for the next follow-up.", fieldErrors: { nextFollowUpAt: "Invalid date." } } };
  }
  return { data: parsed.data };
}

export const coordsSchema = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }).nullable();

export const locationSchema = z.object({
  id: guid().optional(),
  name: z.string().trim().min(1, "Name is required").max(255),
  address: optText(1000),
  mapUrl: optUrl,
  phone: optText(50),
});

export const templatesSchema = z.object({
  confirmTemplate: optText(255),
  reminderTemplate: optText(255),
  language: z.string().trim().min(2).max(20).regex(/^[A-Za-z_]+$/, "Use a code like en_US"),
});

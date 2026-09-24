// Pure, client-safe helpers for meetings: mode labels, lead-facing message text and calendar links.

export const MEETING_MODES = {
  online: "Online meeting",
  site_visit: "Site visit",
  store_visit: "Store / office visit",
  in_person: "In person",
} as const;
export type MeetingMode = keyof typeof MEETING_MODES;
export const MEETING_MODE_KEYS = Object.keys(MEETING_MODES) as MeetingMode[];

export const MEETING_STATUSES = {
  scheduled: "Scheduled",
  completed: "Completed",
  no_show: "No-show",
  cancelled: "Cancelled",
} as const;
export type MeetingStatus = keyof typeof MEETING_STATUSES;

export const MEETING_DURATIONS = [15, 30, 45, 60, 90, 120] as const;

export interface MeetingLike {
  mode: string;
  title: string;
  startAt: Date | string;
  durationMinutes: number;
  locationName?: string | null;
  address?: string | null;
  mapUrl?: string | null;
  meetingUrl?: string | null;
}

// A meeting as the client components receive it.
export interface MeetingView extends MeetingLike {
  id: string;
  leadId: string;
  assigneeId: string | null;
  status: string;
  notes: string | null;
  outcome: string | null;
  checkedInAt: Date | string | null;
  googleEventId: string | null;
}

export function modeLabel(mode: string) {
  return MEETING_MODES[mode as MeetingMode] ?? "Meeting";
}

// A physical meeting (somewhere to go / check in at) vs an online one.
export function isInPersonMode(mode: string) {
  return mode !== "online";
}

export function meetingEnd(m: Pick<MeetingLike, "startAt" | "durationMinutes">) {
  return new Date(new Date(m.startAt).getTime() + m.durationMinutes * 60_000);
}

// One line for "where": the link for online meetings, otherwise place name + address.
export function meetingWhere(m: MeetingLike): string {
  if (m.mode === "online") return m.meetingUrl || "";
  return [m.locationName, m.address].filter(Boolean).join(", ");
}

// Formats the start time in the org's timezone for text that leaves the app (WhatsApp, email).
export function formatMeetingTime(startAt: Date | string, timeZone = "UTC", locale = "en") {
  const d = new Date(startAt);
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: "full", timeStyle: "short", timeZone }).format(d);
  } catch {
    return d.toUTCString();
  }
}

const gcalStamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

// "Add to Google Calendar" link the lead can tap — no account or file needed.
export function googleCalendarLink(m: MeetingLike, details?: string) {
  const start = new Date(m.startAt);
  const q = new URLSearchParams({
    action: "TEMPLATE",
    text: m.title,
    dates: `${gcalStamp(start)}/${gcalStamp(meetingEnd(m))}`,
  });
  if (details) q.set("details", details);
  const where = meetingWhere(m);
  if (where) q.set("location", where);
  return `https://calendar.google.com/calendar/render?${q.toString()}`;
}

// Approved-template variables: {{1}} first name, {{2}} meeting type, {{3}} date & time, {{4}} place
// or join link. WhatsApp rejects empty template parameters, so blanks become "-".
export function meetingTemplateVars(m: MeetingLike, ctx: { leadName: string; timeZone?: string; locale?: string }) {
  const first = (ctx.leadName || "").trim().split(/\s+/)[0] || "there";
  return [first, modeLabel(m.mode).toLowerCase(), formatMeetingTime(m.startAt, ctx.timeZone, ctx.locale), meetingWhere(m) || "-"];
}

type TextKind = "confirm" | "reschedule" | "reminder" | "cancel";

// The message sent to the lead. Plain text so it works for WhatsApp and as the body of an email.
export function leadMessage(
  kind: TextKind,
  m: MeetingLike,
  ctx: { leadName: string; orgName: string; repName?: string | null; timeZone?: string; locale?: string },
): string {
  const first = (ctx.leadName || "").trim().split(/\s+/)[0] || "there";
  const when = formatMeetingTime(m.startAt, ctx.timeZone, ctx.locale);
  const what = modeLabel(m.mode).toLowerCase();
  const lines: string[] = [];

  if (kind === "cancel") {
    lines.push(`Hi ${first}, your ${what} with ${ctx.orgName} on ${when} has been cancelled. Reply here if you'd like to pick a new time.`);
    return lines.join("\n");
  }

  const opener = {
    confirm: `Hi ${first}, your ${what} with ${ctx.orgName} is confirmed.`,
    reschedule: `Hi ${first}, your ${what} with ${ctx.orgName} has been moved to a new time.`,
    reminder: `Hi ${first}, a reminder about your ${what} with ${ctx.orgName}.`,
  }[kind];
  lines.push(opener, "", `When: ${when} (${m.durationMinutes} min)`);

  if (m.mode === "online") {
    if (m.meetingUrl) lines.push(`Join: ${m.meetingUrl}`);
  } else {
    const place = [m.locationName, m.address].filter(Boolean).join(", ");
    if (place) lines.push(`Where: ${place}`);
    if (m.mapUrl) lines.push(`Map: ${m.mapUrl}`);
  }
  if (ctx.repName) lines.push(`With: ${ctx.repName}`);
  lines.push("", "Reply here if you need to change the time.");
  return lines.join("\n");
}

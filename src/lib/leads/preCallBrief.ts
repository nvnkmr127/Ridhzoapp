// The 15-second "before I dial" brief, assembled from data the profile already loaded — no AI call,
// so it's instant and free. Pure.

export interface BriefInput {
  /** Newest first. */
  activities: { type: string; content: string | null; createdAt: Date | string; occurredAt?: Date | string | null }[];
  messages: { direction: string; body: string | null; createdAt: Date | string }[];
  /** Labels of required fields that are still empty. */
  missing: string[];
  /** The AI's suggested next step if there is one, else the Next Best Action. */
  next: { title: string; reason: string };
  /** A meeting still ahead, e.g. "Site visit on 3 Oct". */
  upcomingMeeting?: string | null;
  now: Date;
}

export interface Brief {
  last: string;
  note: string | null;
  ask: string[];
  next: string;
  meeting: string | null;
}

// Types that are actual conversation, not system bookkeeping (status changes, assignments, reminders).
const TOUCH = new Set(["call", "email", "whatsapp", "meeting", "meeting_outcome"]);
const LABEL: Record<string, string> = { call: "Call", email: "Email", whatsapp: "WhatsApp", meeting: "Meeting", meeting_outcome: "Meeting outcome" };

const clip = (s: string, n: number) => {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
};

function ago(d: Date, now: Date): string {
  const mins = Math.max(0, Math.round((now.getTime() - d.getTime()) / 60000));
  if (mins < 60) return mins < 2 ? "just now" : `${mins} min ago`;
  const h = Math.round(mins / 60);
  return h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
}

export function preCallBrief({ activities, messages, missing, next, upcomingMeeting, now }: BriefInput): Brief {
  const touches = [
    ...activities.filter((a) => TOUCH.has(a.type)).map((a) => ({ at: new Date(a.occurredAt ?? a.createdAt), what: LABEL[a.type] ?? a.type, text: a.content ?? "" })),
    ...messages.map((m) => ({ at: new Date(m.createdAt), what: m.direction === "inbound" ? "WhatsApp from lead" : "WhatsApp sent", text: m.body ?? "" })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());
  const t = touches[0];
  const note = activities.find((a) => a.type === "note" && a.content?.trim());

  return {
    last: t ? `${t.what} · ${ago(t.at, now)}${t.text.trim() ? ` — ${clip(t.text, 140)}` : ""}` : "No contact yet — this is the first call.",
    note: note ? `${ago(new Date(note.occurredAt ?? note.createdAt), now)}: ${clip(note.content!, 160)}` : null,
    ask: missing.slice(0, 4),
    next: next.reason ? `${next.title} — ${next.reason}` : next.title,
    meeting: upcomingMeeting ?? null,
  };
}

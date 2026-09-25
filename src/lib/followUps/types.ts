// The one list of follow-up types. Every creator (lead tab, sequences, automations, meetings, AI agent,
// API) stores one of these keys; the UI shows the label. Legacy spellings are folded in by
// normalizeFollowUpType (and were migrated in 0072).
export const FOLLOW_UP_TYPES = [
  { key: "call", label: "Call" },
  { key: "whatsapp", label: "WhatsApp" },
  { key: "email", label: "Email" },
  { key: "task", label: "Task" },
  { key: "followup", label: "Follow-up" },
] as const;

export type FollowUpType = (typeof FOLLOW_UP_TYPES)[number]["key"];

// Completing one of these means the lead was actually contacted (feeds "last contacted", scoring,
// going-cold). A task like "prepare quote" is work, not contact.
export const CONTACT_TYPES = new Set<FollowUpType>(["call", "whatsapp", "email"]);

const ALIASES: Record<string, FollowUpType> = {
  call: "call", phone: "call", phonecall: "call",
  whatsapp: "whatsapp", wa: "whatsapp",
  email: "email", mail: "email",
  task: "task", todo: "task",
  followup: "followup", note: "followup", custom: "followup", reminder: "followup",
};

export function normalizeFollowUpType(raw: string | null | undefined): FollowUpType {
  return ALIASES[String(raw ?? "").toLowerCase().replace(/[^a-z]/g, "")] ?? "followup";
}

export function followUpTypeLabel(raw: string | null | undefined): string {
  const key = normalizeFollowUpType(raw);
  return FOLLOW_UP_TYPES.find((t) => t.key === key)!.label;
}

/** A follow-up that carries a ready-to-send WhatsApp message (e.g. a personal-mode sequence step).
 *  Lives here, not in the "use client" button, so server pages can call it too. */
export function isSendableFollowUp(f: { type?: string | null; description?: string | null }) {
  return normalizeFollowUpType(f.type) === "whatsapp" && !!f.description?.trim();
}

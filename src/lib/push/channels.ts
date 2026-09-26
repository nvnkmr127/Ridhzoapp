// Android notification channels for the mobile app (the app creates the same ids at startup).
// Each notification type lands in the channel a rep would expect to mute or keep loud.
export const PUSH_CHANNELS = {
  leads: "leads", // new / assigned leads, content opened, SLA
  reminders: "reminders", // follow-ups due / overdue
  meetings: "meetings", // booked, reminders, outcomes
  updates: "updates", // daily summary, billing, account
} as const;
export type PushChannel = (typeof PUSH_CHANNELS)[keyof typeof PUSH_CHANNELS];

export function pushChannelFor(type: string): PushChannel {
  if (type.startsWith("follow_up")) return "reminders";
  if (type.startsWith("meeting")) return "meetings";
  if (["new_lead", "lead_assigned", "lead_received", "content_viewed", "sla_escalation", "missed_call"].includes(type)) return "leads";
  return "updates";
}

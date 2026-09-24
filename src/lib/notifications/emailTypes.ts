// Plain constants — kept out of the "use server" action file, which may only export async functions.
export const EMAIL_NOTIFICATION_TYPES: { type: string; label: string }[] = [
  { type: "new_lead", label: "New lead assigned or received" },
  { type: "lead_assigned", label: "A lead is assigned to you" },
  { type: "follow_up_due", label: "Follow-up due" },
  { type: "follow_up_overdue", label: "Follow-up overdue" },
  { type: "sla_escalation", label: "SLA escalation (unactioned lead)" },
  { type: "meeting_scheduled", label: "A meeting or visit is booked for you" },
  { type: "meeting_reminder", label: "Meeting starting soon" },
  { type: "daily_summary", label: "Morning team summary (admins)" },
];

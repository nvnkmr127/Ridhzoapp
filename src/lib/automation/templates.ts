// Prebuilt automation starting points. Metadata is client-safe; buildTemplatePayload
// is pure (no DB) and consumed by the createAutomationFromTemplate server action.

export const AUTOMATION_TEMPLATES = [
  {
    id: "welcome-whatsapp",
    name: "Welcome WhatsApp on new lead",
    description: "The moment a lead arrives, send them a WhatsApp welcome so you're first to respond.",
  },
  {
    id: "first-followup",
    name: "Schedule a first follow-up",
    description: "Every new lead gets a follow-up call booked for tomorrow — nothing slips.",
  },
  {
    id: "reengage-overdue",
    name: "Nudge on overdue follow-ups",
    description: "When a follow-up goes overdue, drop a note reminding the owner to reach out today.",
  },
  {
    id: "won-referral",
    name: "Ask for a referral on won deals",
    description: "When a lead is marked won, prompt a thank-you and a referral ask.",
  },
  {
    id: "call-unanswered-3",
    name: "Three unanswered calls → try another time",
    description: "When a lead misses your third call in a row, note it and book a follow-up in 2 days at a different time.",
  },
  {
    id: "call-long-interested",
    name: "Long call → mark as in progress",
    description: "A call that lasted over 2 minutes means real interest: move the lead to In progress.",
  },
] as const;

export type AutomationTemplateId = (typeof AUTOMATION_TEMPLATES)[number]["id"];

export function buildTemplatePayload(id: AutomationTemplateId) {
  switch (id) {
    case "welcome-whatsapp":
      return {
        name: "Welcome WhatsApp on new lead",
        trigger: { type: "lead.created", config: {} },
        actions: [{ type: "send_whatsapp", config: { templateName: "welcome", variables: ["{{name}}"] } }],
      };
    case "first-followup":
      return {
        name: "Schedule a first follow-up",
        trigger: { type: "lead.created", config: {} },
        // Relative offset so every future lead gets a follow-up 1 day out (not a fixed stale date).
        actions: [{ type: "schedule_follow_up", config: { title: "First follow-up call", dueInDays: 1 } }],
      };
    case "reengage-overdue":
      return {
        name: "Nudge on overdue follow-ups",
        trigger: { type: "follow_up.overdue", config: {} },
        actions: [{ type: "add_note", config: { content: "Follow-up is overdue — reach out to this lead today." } }],
      };
    case "call-unanswered-3":
      return {
        name: "Three unanswered calls → try another time",
        trigger: { type: "call.logged", config: {} },
        // equals 3: fires once, on the third miss — not again on the fourth, fifth…
        conditions: { field: "call_unanswered_streak", operator: "equals", value: 3 },
        actions: [
          { type: "add_note", config: { content: "3 calls unanswered in a row — try WhatsApp or a different time of day." } },
          { type: "schedule_follow_up", config: { title: "Try calling at a different time", dueInDays: 2 } },
        ],
      };
    case "call-long-interested":
      return {
        name: "Long call → mark as in progress",
        trigger: { type: "call.logged", config: {} },
        conditions: { field: "call_duration_sec", operator: "greater_than", value: 120 },
        actions: [{ type: "change_status", config: { status: "active" } }],
      };
    case "won-referral":
      return {
        name: "Ask for a referral on won deals",
        trigger: { type: "lead.status_changed", config: {} },
        actions: [{ type: "add_note", config: { content: "Deal won 🎉 Send a thank-you and ask for a referral." } }],
      };
  }
}

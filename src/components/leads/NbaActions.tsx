"use client";

import { Phone, MessageSquare, Mail, CalendarPlus, CalendarCheck, UserPen } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { RecommendedActionType } from "@/domains/leads/nextBestActionService";
import { emitLeadAction } from "@/components/leads/leadEvents";

// One-tap buttons that DO the recommended action (it used to be text only — e.g. "Send Welcome
// WhatsApp Template" with no way to act on it from the card).
export function NbaActions({ action, hasPhone, hasEmail }: { action: RecommendedActionType; hasPhone: boolean; hasEmail: boolean }) {
  const call = hasPhone && (
    <Button key="call" size="sm" className="gap-1.5" onClick={() => emitLeadAction({ type: "call" })}>
      <Phone className="h-3.5 w-3.5" /> Call now
    </Button>
  );
  const whatsapp = hasPhone && (
    <Button key="wa" size="sm" variant={action === "call_lead" ? "outline" : "default"} className="gap-1.5" onClick={() => emitLeadAction({ type: "compose", channel: "whatsapp", ai: true })}>
      <MessageSquare className="h-3.5 w-3.5" /> Write WhatsApp with AI
    </Button>
  );
  const email = hasEmail && (
    <Button key="email" size="sm" variant="outline" className="gap-1.5" onClick={() => emitLeadAction({ type: "compose", channel: "email", ai: true })}>
      <Mail className="h-3.5 w-3.5" /> Write email with AI
    </Button>
  );
  const followUp = (label = "Set follow-up") => (
    <Button key="fu" size="sm" variant="outline" className="gap-1.5" onClick={() => emitLeadAction({ type: "followup" })}>
      <CalendarPlus className="h-3.5 w-3.5" /> {label}
    </Button>
  );

  let buttons: React.ReactNode[] = [];
  switch (action) {
    case "send_template":
    case "reengage_cold_lead":
    case "try_whatsapp":
      buttons = [whatsapp || email, action === "try_whatsapp" ? followUp() : call];
      break;
    case "call_lead":
      buttons = [call, whatsapp, followUp("Schedule retry")];
      break;
    case "reschedule_followup":
      buttons = [call || whatsapp, followUp()];
      break;
    case "close_deal":
      buttons = [
        <Button key="meet" size="sm" className="gap-1.5" onClick={() => emitLeadAction({ type: "meeting" })}>
          <CalendarPlus className="h-3.5 w-3.5" /> Book meeting / site visit
        </Button>,
        whatsapp,
      ];
      break;
    case "qualify_lead":
      buttons = [
        email,
        <Button key="edit" size="sm" variant={hasEmail ? "outline" : "default"} className="gap-1.5" onClick={() => emitLeadAction({ type: "edit" })}>
          <UserPen className="h-3.5 w-3.5" /> Add phone / email
        </Button>,
      ];
      break;
    case "log_meeting_outcome":
    case "confirm_meeting":
      buttons = [
        <Button key="meetings" size="sm" className="gap-1.5" onClick={() => emitLeadAction({ type: "open-tab", tab: "meetings" })}>
          <CalendarCheck className="h-3.5 w-3.5" /> {action === "log_meeting_outcome" ? "Log outcome" : "Open meeting"}
        </Button>,
        action === "confirm_meeting" ? whatsapp : call,
      ];
      break;
    case "wait":
      return null;
  }
  const shown = buttons.filter(Boolean);
  if (shown.length === 0) return null;
  return <div className="flex flex-wrap gap-2 pt-1">{shown}</div>;
}

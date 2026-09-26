"use client";

import { useEffect } from "react";
import type { MeetingView } from "@/domains/meetings/format";

// Tiny in-page event bus for the lead profile, so the Next Best Action card can trigger actions that
// live in other components (header call/follow-up, the tabs, the AI draft) without prop-drilling
// through the server-rendered page.
export type LeadUiAction =
  | { type: "call" }
  | { type: "followup" }
  // Open the meeting dialog — new, or editing `meeting`.
  | { type: "meeting"; meeting?: MeetingView }
  | { type: "edit" }
  // Switch the workspace tabs (e.g. the NBA card jumping to Meetings).
  | { type: "open-tab"; tab: string }
  // Open the in-app composer for a channel; `ai` also starts an AI draft, `text` prefills it.
  | { type: "compose"; channel: "whatsapp" | "email"; ai?: boolean; text?: string }
  // Emitted by the tabs after switching for a "compose", once the composer is mounted.
  | { type: "ai-draft"; channel: "whatsapp" | "email" }
  | { type: "focus-composer"; channel: "whatsapp" | "email"; text?: string };

const EVENT = "ridhzo:lead-ui";

export function emitLeadAction(action: LeadUiAction) {
  window.dispatchEvent(new CustomEvent<LeadUiAction>(EVENT, { detail: action }));
}

export function useLeadAction(handler: (action: LeadUiAction) => void) {
  useEffect(() => {
    const listener = (e: Event) => handler((e as CustomEvent<LeadUiAction>).detail);
    window.addEventListener(EVENT, listener);
    return () => window.removeEventListener(EVENT, listener);
  }, [handler]);
}

"use client";

import { useEffect } from "react";

// Tiny in-page event bus for the lead profile, so the Next Best Action card can trigger actions that
// live in other components (header call/follow-up, the tabs, the AI draft) without prop-drilling
// through the server-rendered page.
export type LeadUiAction =
  | { type: "call" }
  | { type: "followup" }
  | { type: "edit" }
  | { type: "compose"; channel: "whatsapp" | "email" };

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

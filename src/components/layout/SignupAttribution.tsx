"use client";

import { useEffect } from "react";
import { getStoredAttribution } from "@/lib/tracking/utm";
import { recordSignupAttributionAction } from "@/lib/actions/auth";

// Reports first-touch ad attribution for Google/WhatsApp signups (the server skips everyone else).
// Runs once per user per browser.
export function SignupAttribution({ userId }: { userId: string }) {
  useEffect(() => {
    const key = `ridhzo_attr_sent_${userId}`;
    try {
      if (localStorage.getItem(key)) return;
      const attribution = getStoredAttribution();
      if (!attribution) return;
      localStorage.setItem(key, "1");
      recordSignupAttributionAction(attribution).catch(() => {});
    } catch { /* storage blocked */ }
  }, [userId]);
  return null;
}

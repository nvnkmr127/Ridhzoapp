"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { leadLiveFingerprintAction } from "@/lib/actions/leads";

const POLL_MS = 10_000;

// Keeps the Next Best Action (and the AI recap under it) current without a reload. Every 10s while
// the tab is visible — and the moment the user comes back to it — it asks the server for the lead's
// change token (one small query). Only when that differs from what's on screen does it re-render the
// page's server data, so a reply, a logged call, a status change or a booked meeting from anywhere
// (phone app, webhook, a teammate) moves the recommendation within seconds.
export function LiveNextBestAction({
  leadId,
  fingerprint,
  children,
}: {
  leadId: string;
  fingerprint: string | null;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const current = React.useRef(fingerprint);
  current.current = fingerprint;

  const enabled = fingerprint != null;
  React.useEffect(() => {
    if (!enabled) return;
    let busy = false;
    const check = async () => {
      if (busy || document.visibilityState !== "visible") return;
      busy = true;
      try {
        const next = await leadLiveFingerprintAction(leadId);
        if (next && next !== current.current) {
          current.current = next;
          router.refresh();
        }
      } catch {
        // Offline / redeploy — try again next tick.
      } finally {
        busy = false;
      }
    };
    const interval = setInterval(check, POLL_MS);
    const onVisible = () => document.visibilityState === "visible" && check();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [leadId, router, enabled]);

  return <>{children}</>;
}

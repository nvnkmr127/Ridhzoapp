"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { leadsChangeTokenAction } from "@/lib/actions/leads";

// New leads (Facebook webhook, imports, the phone app, teammates) land in the DB, but a server-rendered
// list won't show them until it re-renders. While the tab is visible this asks the server for a tiny
// change token (one indexed query) and re-renders the page only when it moved — so inbound leads
// surface on their own without re-running the whole page on a timer. Paused while hidden; checked
// again the moment the user returns.
// ponytail: poll, not realtime. Swap for SSE/websocket only if sub-interval latency is required.
// `initialToken`: computed by the same server render as the list, so nothing that changes between the
// render and the first poll is missed.
export function LeadsAutoRefresh({ initialToken, intervalMs = 30_000 }: { initialToken: string | null; intervalMs?: number }) {
  const router = useRouter();
  const token = React.useRef(initialToken);
  React.useEffect(() => {
    token.current = initialToken; // a refresh re-rendered the list: this is now what's on screen
  }, [initialToken]);

  React.useEffect(() => {
    let busy = false;
    const check = async () => {
      if (busy || document.visibilityState !== "visible") return;
      busy = true;
      try {
        const next = await leadsChangeTokenAction();
        if (next == null) return;
        if (token.current != null && next !== token.current) router.refresh();
        token.current = next;
      } catch {
        // Offline / redeploy — try again next tick.
      } finally {
        busy = false;
      }
    };
    const t = setInterval(check, intervalMs);
    const onVisible = () => void check();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router, intervalMs]);

  return null;
}

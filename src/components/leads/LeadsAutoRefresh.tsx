"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

// New leads (Facebook webhook, imports, other users) land in the DB but a server-rendered list
// won't show them until it re-fetches. This re-runs the page's server render on an interval while
// the tab is visible, and immediately when the user returns to the tab — so inbound leads surface
// on their own. Paused while hidden so we don't wake Neon / burn queries on a backgrounded tab.
// ponytail: poll, not realtime. Swap for SSE/websocket only if sub-interval latency is required.
export function LeadsAutoRefresh({ intervalMs = 20_000 }: { intervalMs?: number }) {
  const router = useRouter();

  React.useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;

    const start = () => {
      stop();
      timer = setInterval(() => {
        if (document.visibilityState === "visible") router.refresh();
      }, intervalMs);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = undefined;
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        router.refresh(); // catch up immediately on return, then resume polling
        start();
      } else {
        stop();
      }
    };

    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router, intervalMs]);

  return null;
}

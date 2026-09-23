"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

// New leads (Facebook webhook, imports, other users) land in the DB but a server-rendered list
// won't show them until it re-fetches. This re-runs the page's server render on an interval while
// the tab is visible, and immediately when the user returns to the tab — so inbound leads surface
// on their own. Paused while hidden so we don't wake Neon / burn queries on a backgrounded tab.
// ponytail: poll, not realtime. Swap for SSE/websocket only if sub-interval latency is required.
// Automatic full-page router.refresh() polling was removed to eliminate recurring
// server component execution waves on /leads. Lightweight refresh strategy will be
// implemented in a subsequent phase.
export function LeadsAutoRefresh({ intervalMs = 20_000 }: { intervalMs?: number }) {
  // Automatic full-tree refresh disabled (Phase 2).
  return null;
}

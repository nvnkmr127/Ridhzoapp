"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { AiAssistant } from "./AiAssistant";
import { Sparkles, X } from "lucide-react";

// Mounted once in the dashboard layout → the assistant floats on every page.
const STORE_KEY = "assistant-open";

export function FloatingAssistant({ storageKey }: { storageKey?: string } = {}) {
  const [open, setOpen] = React.useState(false);
  // If the user is on a lead detail page, hand the assistant that lead's id so it's context-aware.
  const pathname = usePathname();
  const currentLeadId = pathname?.match(
    /^\/leads\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i,
  )?.[1];

  // Remember open/closed across navigations (per-browser; safe if storage is blocked).
  React.useEffect(() => {
    try {
      setOpen(localStorage.getItem(STORE_KEY) === "1");
    } catch {
      /* storage unavailable — default closed */
    }
  }, []);

  function toggle(next: boolean) {
    setOpen(next);
    try {
      localStorage.setItem(STORE_KEY, next ? "1" : "0");
    } catch {
      /* ignore */
    }
  }

  return (
    <>
      {open && (
        <div className="fixed bottom-24 right-6 z-50 flex flex-col w-[400px] max-w-[calc(100vw-3rem)] h-[600px] max-h-[70vh] rounded-2xl border border-border bg-background shadow-2xl">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="font-semibold text-sm">Assistant</span>
            </div>
            <button onClick={() => toggle(false)} className="text-muted-foreground hover:text-foreground" aria-label="Close assistant">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="flex-1 min-h-0 px-4 pt-4 pb-3">
            <AiAssistant currentLeadId={currentLeadId} storageKey={storageKey} />
          </div>
        </div>
      )}

      <button
        onClick={() => toggle(!open)}
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 active:scale-95"
        aria-label={open ? "Close assistant" : "Open assistant"}
      >
        {open ? <X className="h-6 w-6" /> : <Sparkles className="h-6 w-6" />}
      </button>
    </>
  );
}

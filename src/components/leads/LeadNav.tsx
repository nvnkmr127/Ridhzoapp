"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { readLeadListContext, type LeadListContext } from "@/lib/leads/listContext";

// Back + previous/next for the lead profile. "Back" returns to the exact list the user came from
// (filters, search, page) instead of a bare /leads; prev/next step through that list in order.
export function LeadBackButton({ leadId }: { leadId: string }) {
  const ctx = useListContext(leadId);
  return (
    <Button variant="outline" size="icon" aria-label="Back to leads" className="h-9 w-9 shrink-0" asChild>
      <Link href={ctx?.url ?? "/leads"}>
        <ArrowLeft className="h-4 w-4" />
      </Link>
    </Button>
  );
}

export function LeadPager({ leadId }: { leadId: string }) {
  const ctx = useListContext(leadId);
  if (!ctx) return null;
  const i = ctx.ids.indexOf(leadId);
  const prev = ctx.ids[i - 1];
  const next = ctx.ids[i + 1];
  return (
    <div className="flex items-center gap-1 text-xs text-muted-foreground">
      <Button variant="ghost" size="icon" className="h-8 w-8" disabled={!prev} aria-label="Previous lead" asChild={!!prev}>
        {prev ? (
          <Link href={`/leads/${prev}`}>
            <ChevronLeft className="h-4 w-4" />
          </Link>
        ) : (
          <ChevronLeft className="h-4 w-4" />
        )}
      </Button>
      <span className="tabular-nums">
        {i + 1} / {ctx.ids.length}
      </span>
      <Button variant="ghost" size="icon" className="h-8 w-8" disabled={!next} aria-label="Next lead" asChild={!!next}>
        {next ? (
          <Link href={`/leads/${next}`}>
            <ChevronRight className="h-4 w-4" />
          </Link>
        ) : (
          <ChevronRight className="h-4 w-4" />
        )}
      </Button>
    </div>
  );
}

// Only trust the stored list if this lead is actually in it (i.e. we arrived from that list).
function useListContext(leadId: string): LeadListContext | null {
  const [ctx, setCtx] = React.useState<LeadListContext | null>(null);
  React.useEffect(() => {
    const c = readLeadListContext();
    setCtx(c && c.ids.includes(leadId) ? c : null);
  }, [leadId]);
  return ctx;
}

"use client";

import { ClipboardCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { Brief } from "@/lib/leads/preCallBrief";

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</dt>
    <dd className="text-sm">{children}</dd>
  </div>
);

// "Brief me": the 15-second read before dialling — last conversation, what's still unknown, what to do next.
export function PreCallBrief({ brief }: { brief: Brief }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
          <ClipboardCheck className="h-3.5 w-3.5" /> Brief me
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(92vw,26rem)]">
        <dl className="space-y-3">
          <Row label="Last conversation">{brief.last}</Row>
          {brief.note && <Row label="Latest note">{brief.note}</Row>}
          {brief.meeting && <Row label="Upcoming meeting">{brief.meeting}</Row>}
          <Row label="Ask about">{brief.ask.length ? brief.ask.join(" · ") : "Nothing required is missing."}</Row>
          <Row label="Next step">{brief.next}</Row>
        </dl>
      </PopoverContent>
    </Popover>
  );
}

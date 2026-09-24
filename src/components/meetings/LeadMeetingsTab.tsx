"use client";

import { CalendarPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MeetingCard } from "@/components/meetings/MeetingCard";
import { emitLeadAction } from "@/components/leads/leadEvents";
import type { MeetingView } from "@/domains/meetings/format";

export function LeadMeetingsTab({
  lead,
  meetings,
  userNames,
}: {
  lead: { id: string; name: string; phone: string | null };
  meetings: MeetingView[];
  userNames: Record<string, string>;
}) {
  const upcoming = meetings.filter((m) => m.status === "scheduled").sort((a, b) => +new Date(a.startAt) - +new Date(b.startAt));
  const past = meetings.filter((m) => m.status !== "scheduled");

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="text-sm font-semibold">Meetings</h4>
          <p className="text-xs text-muted-foreground">Online meetings, site visits and store visits with this lead</p>
        </div>
        <Button size="sm" className="gap-1.5 text-xs" onClick={() => emitLeadAction({ type: "meeting" })}>
          <CalendarPlus className="h-4 w-4" /> Schedule meeting
        </Button>
      </div>

      {upcoming.length === 0 ? (
        <div className="rounded-2xl border bg-card py-8 text-center text-xs text-muted-foreground">
          <p className="font-medium text-foreground">No upcoming meetings</p>
          <p>Book a call, site visit or store visit — the lead gets a confirmation and a reminder.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {upcoming.map((m) => (
            <MeetingCard key={m.id} meeting={m} lead={lead} assigneeName={m.assigneeId ? userNames[m.assigneeId] : null} onEdit={() => emitLeadAction({ type: "meeting", meeting: m })} />
          ))}
        </div>
      )}

      {past.length > 0 && (
        <div className="space-y-2 border-t pt-4">
          <h5 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Past ({past.length})</h5>
          {past.map((m) => (
            <MeetingCard key={m.id} meeting={m} lead={lead} assigneeName={m.assigneeId ? userNames[m.assigneeId] : null} />
          ))}
        </div>
      )}
    </div>
  );
}

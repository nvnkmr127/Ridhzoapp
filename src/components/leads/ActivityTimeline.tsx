"use client";

import * as React from "react";
import { Phone, MessageSquare, Mail, StickyNote, Bell, Paperclip, Eye, Sparkles, CalendarCheck, AlertTriangle, Circle } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { LocalTime } from "@/components/LocalTime";
import { cn } from "@/lib/utils";

type Activity = {
  id: string;
  type: string;
  content: string | null;
  userName?: string | null;
  createdAt: Date | string;
};

// Human labels for stored activity types (they used to render raw, e.g. "SLA_ESCALATION").
const TYPES: Record<string, { label: string; icon: LucideIcon; group: Group }> = {
  call: { label: "Call", icon: Phone, group: "conversation" },
  message: { label: "Message", icon: MessageSquare, group: "conversation" },
  whatsapp: { label: "WhatsApp", icon: MessageSquare, group: "conversation" },
  email: { label: "Email", icon: Mail, group: "conversation" },
  meeting: { label: "Meeting", icon: CalendarCheck, group: "conversation" },
  note: { label: "Note", icon: StickyNote, group: "note" },
  reminder_created: { label: "Follow-up added", icon: Bell, group: "followup" },
  reminder_updated: { label: "Follow-up changed", icon: Bell, group: "followup" },
  reminder_status: { label: "Follow-up updated", icon: Bell, group: "followup" },
  reminder_deleted: { label: "Follow-up removed", icon: Bell, group: "followup" },
  attachment: { label: "Attachment", icon: Paperclip, group: "other" },
  attachment_deleted: { label: "Attachment removed", icon: Paperclip, group: "other" },
  content_viewed: { label: "Opened your content", icon: Eye, group: "other" },
  new_lead: { label: "Lead created", icon: Sparkles, group: "other" },
  sla_escalation: { label: "Response overdue", icon: AlertTriangle, group: "other" },
};

type Group = "conversation" | "note" | "followup" | "other";
const FILTERS: { key: "all" | Group; label: string }[] = [
  { key: "all", label: "All" },
  { key: "conversation", label: "Calls & messages" },
  { key: "note", label: "Notes" },
  { key: "followup", label: "Follow-ups" },
  { key: "other", label: "Other" },
];

const PAGE = 30;

function meta(type: string) {
  return (
    TYPES[type] ?? {
      label: type.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()),
      icon: Circle,
      group: "other" as Group,
    }
  );
}

export function ActivityTimeline({ activities }: { activities: Activity[] }) {
  const [filter, setFilter] = React.useState<"all" | Group>("all");
  const [shown, setShown] = React.useState(PAGE);

  const counts = React.useMemo(() => {
    const c: Record<string, number> = { all: activities.length };
    for (const a of activities) c[meta(a.type).group] = (c[meta(a.type).group] ?? 0) + 1;
    return c;
  }, [activities]);

  const visible = filter === "all" ? activities : activities.filter((a) => meta(a.type).group === filter);

  if (activities.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        No activity yet. Calls, messages, notes and follow-ups you log will show up here.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filter chips — scroll sideways on narrow screens instead of wrapping into a tall block. */}
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {FILTERS.filter((f) => f.key === "all" || counts[f.key]).map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => {
              setFilter(f.key);
              setShown(PAGE);
            }}
            className={cn(
              "shrink-0 rounded-full border px-3 py-2 text-xs font-medium transition-colors",
              filter === f.key ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {f.label} <span className="tabular-nums opacity-70">{counts[f.key] ?? 0}</span>
          </button>
        ))}
      </div>

      <ol className="relative space-y-5 border-l border-border/60 pl-5 sm:pl-6">
        {visible.slice(0, shown).map((a) => {
          const m = meta(a.type);
          return (
            <li key={a.id} className="relative">
              <span className="absolute -left-[29px] sm:-left-[33px] top-0 flex h-5 w-5 items-center justify-center rounded-full border border-border bg-card text-muted-foreground">
                <m.icon className="h-3 w-3" />
              </span>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                <div className="flex items-baseline gap-2">
                  <span className="text-xs font-semibold text-foreground">{m.label}</span>
                  {a.userName && <span className="text-xs text-muted-foreground">by {a.userName}</span>}
                </div>
                <span className="text-xs text-muted-foreground">
                  <LocalTime iso={a.createdAt} mode="datetime" />
                </span>
              </div>
              {a.content && <p className="mt-1 whitespace-pre-wrap break-words text-sm text-foreground/90">{a.content}</p>}
            </li>
          );
        })}
      </ol>

      {visible.length > shown && (
        <button
          type="button"
          onClick={() => setShown((n) => n + PAGE)}
          className="w-full rounded-lg border border-border py-2 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          Show {Math.min(PAGE, visible.length - shown)} more of {visible.length - shown} older
        </button>
      )}
    </div>
  );
}

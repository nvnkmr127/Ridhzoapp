import Link from "next/link";
import { ChevronLeft, ChevronRight, List, CalendarDays } from "lucide-react";
import {
  addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameMonth, parse, startOfMonth, startOfWeek, subMonths,
} from "date-fns";
import { requireOrg, hasPermission } from "@/lib/rbac";
import { getOrgFormat } from "@/lib/format.server";
import { normalizePhone } from "@/lib/leads/normalize";
import { orgDialCode } from "@/lib/leads/orgDialCode";
import { MeetingService } from "@/domains/meetings/service";
import { UserService } from "@/domains/users/service";
import { meetingEnd, MEETING_MODE_KEYS } from "@/domains/meetings/format";
import { MeetingCard } from "@/components/meetings/MeetingCard";
import { MeetingsFilters } from "@/components/meetings/MeetingsFilters";
import { LocalTime } from "@/components/LocalTime";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const DAY = 24 * 60 * 60 * 1000;

// YYYY-MM-DD of an instant in the org's timezone — "today" means the business's today, not the server's.
function dayKeyIn(timeZone: string) {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
  return (d: Date) => f.format(d);
}

export default async function MeetingsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; month?: string; mode?: string; assignee?: string }>;
}) {
  const { userId, organizationId } = await requireOrg();
  const sp = await searchParams;
  const isAdmin = await hasPermission("settings.manage");
  const [{ timezone }, dialCode, orgUsers] = await Promise.all([
    getOrgFormat(organizationId),
    orgDialCode(organizationId),
    isAdmin ? UserService.list(organizationId) : Promise.resolve([]),
  ]);
  const users = (orgUsers as { id: string; firstName: string | null; lastName: string | null; email: string }[]).map((u) => ({
    id: u.id,
    name: [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email,
  }));

  const mode = sp.mode && (MEETING_MODE_KEYS as string[]).includes(sp.mode) ? sp.mode : undefined;
  // Admins see the whole team (optionally one person); everyone else sees their own meetings.
  const scope = isAdmin ? { assigneeId: sp.assignee || undefined } : { userId };
  const view = sp.view === "calendar" ? "calendar" : "list";
  const now = new Date();
  const key = dayKeyIn(timezone);
  const today = key(now);

  const cursor = sp.month ? parse(sp.month, "yyyy-MM", new Date()) : now;
  const gridStart = startOfWeek(startOfMonth(cursor));
  const gridEnd = endOfWeek(endOfMonth(cursor));

  const rows = await MeetingService.list(organizationId, {
    ...scope,
    mode,
    ...(view === "calendar"
      ? { from: new Date(gridStart.getTime() - DAY), to: new Date(gridEnd.getTime() + 2 * DAY) }
      : { from: new Date(now.getTime() - 30 * DAY), to: new Date(now.getTime() + 90 * DAY) }),
  });

  const nameOf = (a: { firstName: string | null; lastName: string | null; email: string } | null) =>
    a ? [a.firstName, a.lastName].filter(Boolean).join(" ") || a.email : null;
  const withLead = rows.map((r) => ({ ...r, lead: { ...r.lead, phone: normalizePhone(r.lead.phone, dialCode) ?? null } }));

  const needsOutcome = withLead.filter((r) => r.meeting.status === "scheduled" && meetingEnd(r.meeting) < now);
  const todays = withLead.filter((r) => r.meeting.status === "scheduled" && meetingEnd(r.meeting) >= now && key(r.meeting.startAt) === today);
  const upcoming = withLead.filter((r) => r.meeting.status === "scheduled" && key(r.meeting.startAt) > today);
  const past = withLead.filter((r) => r.meeting.status !== "scheduled").reverse().slice(0, 30);
  const completed30 = withLead.filter((r) => r.meeting.status === "completed").length;
  const week = upcoming.filter((r) => r.meeting.startAt.getTime() < now.getTime() + 7 * DAY).length;

  const qs = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ mode: sp.mode, assignee: sp.assignee, ...extra })) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `/meetings?${s}` : "/meetings";
  };

  const section = (title: string, items: typeof withLead, tone?: string) =>
    items.length > 0 && (
      <section className="space-y-2">
        <h2 className={cn("text-sm font-semibold uppercase tracking-wider text-muted-foreground", tone)}>
          {title} ({items.length})
        </h2>
        {items.map((r) => (
          <MeetingCard key={r.meeting.id} meeting={r.meeting} lead={r.lead} assigneeName={nameOf(r.assignee)} showLead />
        ))}
      </section>
    );

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Meetings</h1>
          <p className="text-sm text-muted-foreground">Online meetings, site visits and store visits{isAdmin ? " across your team" : ""}. Book new ones from a lead.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <MeetingsFilters users={isAdmin ? users : null} />
          <div className="flex rounded-md border">
            <Link href={qs({ view: undefined })}>
              <Button variant={view === "list" ? "secondary" : "ghost"} size="sm" className="gap-1 rounded-r-none"><List className="h-4 w-4" /> List</Button>
            </Link>
            <Link href={qs({ view: "calendar" })}>
              <Button variant={view === "calendar" ? "secondary" : "ghost"} size="sm" className="gap-1 rounded-l-none"><CalendarDays className="h-4 w-4" /> Calendar</Button>
            </Link>
          </div>
        </div>
      </div>

      {view === "list" ? (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              ["Today", todays.length],
              ["Next 7 days", week],
              ["Needs outcome", needsOutcome.length],
              ["Done (30 days)", completed30],
            ].map(([label, n]) => (
              <Card key={label as string}>
                <CardHeader className="pb-1"><CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle></CardHeader>
                <CardContent><p className="text-2xl font-bold">{n}</p></CardContent>
              </Card>
            ))}
          </div>

          {section("Needs outcome", needsOutcome, "text-amber-700 dark:text-amber-300")}
          {section("Today", todays)}
          {section("Upcoming", upcoming)}
          {section("Recent", past)}
          {needsOutcome.length + todays.length + upcoming.length + past.length === 0 && (
            <div className="rounded-2xl border bg-card py-12 text-center text-sm text-muted-foreground">
              <p className="font-medium text-foreground">No meetings yet</p>
              <p>Open a lead and tap <span className="font-medium">Meeting</span> to book a call, site visit or store visit.</p>
            </div>
          )}
        </>
      ) : (
        <MonthGrid
          cursor={cursor}
          days={eachDayOfInterval({ start: gridStart, end: gridEnd })}
          rows={withLead}
          dayKey={key}
          prevHref={qs({ view: "calendar", month: format(subMonths(cursor, 1), "yyyy-MM") })}
          nextHref={qs({ view: "calendar", month: format(addMonths(cursor, 1), "yyyy-MM") })}
          todayHref={qs({ view: "calendar" })}
        />
      )}
    </div>
  );
}

const MODE_TONE: Record<string, string> = {
  online: "bg-purple-500/10 text-purple-700 dark:text-purple-300",
  site_visit: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
  store_visit: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  in_person: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
};

function MonthGrid({
  cursor,
  days,
  rows,
  dayKey,
  prevHref,
  nextHref,
  todayHref,
}: {
  cursor: Date;
  days: Date[];
  rows: { meeting: { id: string; title: string; startAt: Date; status: string; mode: string }; lead: { id: string; name: string } }[];
  dayKey: (d: Date) => string;
  prevHref: string;
  nextHref: string;
  todayHref: string;
}) {
  const byDay = new Map<string, typeof rows>();
  for (const r of rows) {
    const k = dayKey(r.meeting.startAt);
    byDay.set(k, [...(byDay.get(k) ?? []), r]);
  }
  const todayKey = dayKey(new Date());

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">{format(cursor, "MMMM yyyy")}</h2>
        <div className="flex items-center gap-1">
          <Link href={prevHref}><Button variant="ghost" size="icon" aria-label="Previous month"><ChevronLeft className="h-4 w-4" /></Button></Link>
          <Link href={todayHref}><Button variant="ghost" size="sm">Today</Button></Link>
          <Link href={nextHref}><Button variant="ghost" size="icon" aria-label="Next month"><ChevronRight className="h-4 w-4" /></Button></Link>
        </div>
      </div>
      <div className="flex flex-wrap gap-3 text-xs">
        {Object.entries({ online: "Online", site_visit: "Site visit", store_visit: "Store visit", in_person: "In person" }).map(([k, l]) => (
          <span key={k} className={cn("rounded px-1.5 py-0.5", MODE_TONE[k])}>{l}</span>
        ))}
      </div>
      <div className="overflow-x-auto">
        <div className="grid min-w-[640px] grid-cols-7 gap-px overflow-hidden rounded-lg border border-border bg-muted text-sm">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d} className="bg-muted px-2 py-1.5 text-center text-xs font-medium text-muted-foreground">{d}</div>
          ))}
          {days.map((day) => {
            const k = format(day, "yyyy-MM-dd");
            const items = byDay.get(k) ?? [];
            return (
              <div key={k} className={cn("min-h-24 space-y-1 bg-card p-1.5", !isSameMonth(day, cursor) && "opacity-40")}>
                <div className="text-xs font-medium text-muted-foreground">
                  {k === todayKey ? <span className="rounded-full bg-foreground px-1.5 py-0.5 text-background">{format(day, "d")}</span> : format(day, "d")}
                </div>
                {items.map((it) => (
                  <Link
                    key={it.meeting.id}
                    href={`/leads/${it.lead.id}`}
                    className={cn(
                      "block truncate rounded px-1.5 py-0.5 text-xs",
                      MODE_TONE[it.meeting.mode],
                      it.meeting.status === "cancelled" && "line-through opacity-60",
                      it.meeting.status === "completed" && "opacity-60",
                    )}
                  >
                    <LocalTime iso={it.meeting.startAt} mode="time" /> {it.lead.name}
                  </Link>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

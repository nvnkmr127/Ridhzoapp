import Link from "next/link";
import { requireOrg } from "@/lib/rbac";
import { db } from "@/db";
import { followUps, leads, meetings } from "@/db/schema";
import { and, eq, or, gte, lte, isNull, ne } from "drizzle-orm";
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval,
  format, addMonths, subMonths, isSameMonth, parse, isValid,
} from "date-fns";
import { ChevronLeft, ChevronRight, List } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LocalTime } from "@/components/LocalTime";
import { getOrgFormat } from "@/lib/format.server";
import { dayKey } from "@/lib/tz";

const KEY = "yyyy-MM-dd";

export default async function FollowUpCalendarPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const { userId, organizationId } = await requireOrg();
  const { month } = await searchParams;

  // A malformed ?month= falls back to this month instead of crashing the page.
  const parsedMonth = month && /^\d{4}-\d{2}$/.test(month) ? parse(month, "yyyy-MM", new Date()) : null;
  const cursor = parsedMonth && isValid(parsedMonth) ? parsedMonth : new Date();
  const gridStart = startOfWeek(startOfMonth(cursor));
  const gridEnd = endOfWeek(endOfMonth(cursor));
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });
  // Items are placed on the WORKSPACE's calendar day; fetch a day either side of the (UTC) grid.
  const { timezone } = await getOrgFormat(organizationId);
  const DAY = 24 * 60 * 60 * 1000;
  const from = new Date(gridStart.getTime() - DAY);
  const to = new Date(gridEnd.getTime() + 2 * DAY);
  const todayKey = dayKey(new Date(), timezone);

  const rows = await db
    .select({ id: followUps.id, title: followUps.title, dueAt: followUps.dueAt, status: followUps.status, leadId: followUps.leadId, leadName: leads.name })
    .from(followUps)
    .innerJoin(leads, eq(followUps.leadId, leads.id))
    .where(
      and(
        eq(leads.organizationId, organizationId),
        or(eq(followUps.userId, userId), eq(leads.ownerId, userId)),
        isNull(leads.deletedAt),
        ne(followUps.status, "cancelled"),
        gte(followUps.dueAt, from),
        lte(followUps.dueAt, to),
      ),
    );

  // Meetings show alongside follow-ups (purple) so the day's plan is in one place.
  const meetingRows = await db
    .select({ id: meetings.id, title: meetings.title, dueAt: meetings.startAt, status: meetings.status, leadId: meetings.leadId, leadName: leads.name })
    .from(meetings)
    .innerJoin(leads, eq(meetings.leadId, leads.id))
    .where(
      and(
        eq(meetings.organizationId, organizationId),
        or(eq(meetings.assigneeId, userId), eq(leads.ownerId, userId)),
        isNull(leads.deletedAt),
        ne(meetings.status, "cancelled"),
        gte(meetings.startAt, from),
        lte(meetings.startAt, to),
      ),
    );

  type Item = (typeof rows)[number] & { meeting?: boolean };
  const byDay = new Map<string, Item[]>();
  for (const r of [...rows, ...meetingRows.map((m) => ({ ...m, meeting: true }))] as Item[]) {
    const k = dayKey(new Date(r.dueAt), timezone);
    byDay.set(k, [...(byDay.get(k) ?? []), r].sort((a, b) => +new Date(a.dueAt) - +new Date(b.dueAt)));
  }

  const prev = format(subMonths(cursor, 1), "yyyy-MM");
  const next = format(addMonths(cursor, 1), "yyyy-MM");

  return (
    <div className="flex-1 p-4 pt-4 sm:p-8 sm:pt-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">{format(cursor, "MMMM yyyy")}</h1>
        <div className="flex items-center gap-2">
          <Link href="/follow-ups"><Button variant="outline" size="sm" className="gap-1"><List className="h-4 w-4" /> List</Button></Link>
          <Link href="/meetings?view=calendar"><Button variant="outline" size="sm">Meetings</Button></Link>
          <Link href={`/follow-ups/calendar?month=${prev}`}><Button variant="ghost" size="icon" aria-label="Previous month"><ChevronLeft className="h-4 w-4" /></Button></Link>
          <Link href="/follow-ups/calendar"><Button variant="ghost" size="sm">Today</Button></Link>
          <Link href={`/follow-ups/calendar?month=${next}`}><Button variant="ghost" size="icon" aria-label="Next month"><ChevronRight className="h-4 w-4" /></Button></Link>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-px bg-muted border border-border rounded-lg overflow-hidden text-sm">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="bg-muted px-2 py-1.5 text-xs font-medium text-muted-foreground text-center">{d}</div>
        ))}
        {days.map((day) => {
          const items = byDay.get(format(day, KEY)) ?? [];
          const dim = !isSameMonth(day, cursor);
          return (
            <div key={day.toISOString()} className={`bg-card min-h-24 p-1.5 space-y-1 ${dim ? "opacity-40" : ""}`}>
              <div className={"text-xs font-medium text-muted-foreground"}>
                {format(day, KEY) === todayKey ? <span className="bg-secondary text-foreground rounded-full px-1.5 py-0.5">{format(day, "d")}</span> : format(day, "d")}
              </div>
              {items.map((it) => {
                const overdue = (it.status === "pending" || it.status === "scheduled") && new Date(it.dueAt) < new Date();
                const done = it.status === "completed" || it.status === "no_show";
                return (
                  <Link key={it.id} href={`/leads/${it.leadId}`}
                    className={`block truncate rounded px-1.5 py-0.5 text-xs ${it.meeting ? `bg-purple-500/10 text-purple-700 dark:text-purple-300${done ? " opacity-60" : ""}` : done ? "bg-muted text-muted-foreground line-through" : overdue ? "bg-muted text-foreground" : "bg-muted text-muted-foreground"}`}>
                    <LocalTime iso={it.dueAt} mode="time" /> {it.leadName} — {it.title}
                  </Link>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

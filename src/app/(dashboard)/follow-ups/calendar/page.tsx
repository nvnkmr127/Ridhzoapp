import Link from "next/link";
import { requireOrg } from "@/lib/rbac";
import { db } from "@/db";
import { followUps, leads } from "@/db/schema";
import { and, eq, or, gte, lte, isNull } from "drizzle-orm";
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval,
  format, addMonths, subMonths, isSameMonth, isToday, parse,
} from "date-fns";
import { ChevronLeft, ChevronRight, List } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LocalTime } from "@/components/LocalTime";

const KEY = "yyyy-MM-dd";

export default async function FollowUpCalendarPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const { userId, organizationId } = await requireOrg();
  const { month } = await searchParams;

  const cursor = month ? parse(month, "yyyy-MM", new Date()) : new Date();
  const gridStart = startOfWeek(startOfMonth(cursor));
  const gridEnd = endOfWeek(endOfMonth(cursor));
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  const rows = await db
    .select({ id: followUps.id, title: followUps.title, dueAt: followUps.dueAt, status: followUps.status, leadId: followUps.leadId, leadName: leads.name })
    .from(followUps)
    .innerJoin(leads, eq(followUps.leadId, leads.id))
    .where(
      and(
        eq(leads.organizationId, organizationId),
        or(eq(followUps.userId, userId), eq(leads.ownerId, userId)),
        isNull(leads.deletedAt),
        gte(followUps.dueAt, gridStart),
        lte(followUps.dueAt, gridEnd),
      ),
    );

  const byDay = new Map<string, typeof rows>();
  for (const r of rows) {
    const k = format(new Date(r.dueAt), KEY);
    byDay.set(k, [...(byDay.get(k) ?? []), r]);
  }

  const prev = format(subMonths(cursor, 1), "yyyy-MM");
  const next = format(addMonths(cursor, 1), "yyyy-MM");

  return (
    <div className="flex-1 p-4 pt-4 sm:p-8 sm:pt-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">{format(cursor, "MMMM yyyy")}</h1>
        <div className="flex items-center gap-2">
          <Link href="/follow-ups"><Button variant="outline" size="sm" className="gap-1"><List className="h-4 w-4" /> List</Button></Link>
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
              <div className={`text-xs font-medium ${isToday(day) ? "text-muted-foreground" : "text-muted-foreground"}`}>
                {isToday(day) ? <span className="bg-secondary text-foreground rounded-full px-1.5 py-0.5">{format(day, "d")}</span> : format(day, "d")}
              </div>
              {items.map((it) => {
                const overdue = it.status === "pending" && new Date(it.dueAt) < new Date();
                const done = it.status === "completed";
                return (
                  <Link key={it.id} href={`/leads/${it.leadId}`}
                    className={`block truncate rounded px-1.5 py-0.5 text-xs ${done ? "bg-muted text-muted-foreground line-through" : overdue ? "bg-muted text-foreground" : "bg-muted text-muted-foreground"}`}>
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

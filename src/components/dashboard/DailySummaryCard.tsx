import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { AlarmClock, CalendarCheck, CalendarClock, CheckCircle2, ListTodo, PhoneCall, UserPlus, UserX, Users } from "lucide-react";
import { DailySummaryService, callsLine, isActionable } from "@/domains/organizations/dailySummaryService";
import type { FilterRule } from "@/domains/savedViews/service";
import { getOrgFormat } from "@/lib/format.server";

const H = 60 * 60 * 1000;

// A /leads link pre-filtered to exactly the leads a number counts.
const leadsWhere = (...rules: FilterRule[]) => `/leads?filters=${encodeURIComponent(JSON.stringify({ logic: "AND", rules }))}`;
const hoursAgo = (now: Date, h: number) => new Date(now.getTime() - h * H).toISOString();

type Tile = { label: string; n: number; prev?: number | null; href: string; icon: LucideIcon; backlog: boolean };

// "▲ 3 vs yesterday". For a backlog (overdue, unassigned…) up is bad; for new leads / meetings it's neutral.
function Delta({ n, prev, backlog }: { n: number; prev?: number | null; backlog: boolean }) {
  if (prev == null) return null;
  const d = n - prev;
  if (d === 0) return <p className="text-[11px] text-muted-foreground">same as yesterday</p>;
  const tone = !backlog ? "text-muted-foreground" : d > 0 ? "text-destructive" : "text-emerald-600";
  return <p className={`text-[11px] ${tone}`}>{d > 0 ? "▲" : "▼"} {Math.abs(d)} vs yesterday</p>;
}

export function SummaryTiles({ tiles }: { tiles: Tile[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {tiles.map(({ label, n, prev, href, icon: Icon, backlog }) => (
        <Link key={label} href={href} className={`rounded-xl border p-3 transition-colors hover:bg-muted/50 ${n === 0 ? "opacity-60" : ""}`}>
          <Icon className={`h-4 w-4 ${backlog && n > 0 ? "text-destructive" : "text-muted-foreground"}`} />
          <p className={`mt-2 text-2xl font-bold tabular-nums ${backlog && n > 0 ? "text-destructive" : ""}`}>{n}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
          <Delta n={n} prev={prev} backlog={backlog} />
        </Link>
      ))}
    </div>
  );
}

function Header({ title, subtitle, timezone, emailLink = false }: { title: string; subtitle: string; timezone: string; emailLink?: boolean }) {
  const today = new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "short", timeZone: timezone }).format(new Date());
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <div>
        <h3 className="text-lg font-medium">{title}</h3>
        <p className="text-xs text-muted-foreground">{today} · {subtitle}</p>
      </div>
      {emailLink && (
        <Link href="/settings" className="text-xs text-muted-foreground hover:text-foreground hover:underline underline-offset-2">
          Morning email settings
        </Link>
      )}
    </div>
  );
}

// "Today" for the whole workspace — the same numbers as the morning email (DailySummaryService.stats),
// so admins who skip the email still see them, and the two never disagree.
export async function DailySummaryCard({ organizationId }: { organizationId: string }) {
  const { timezone } = await getOrgFormat(organizationId);
  const now = new Date();
  const s = await DailySummaryService.stats(organizationId, now, timezone);
  const y = await DailySummaryService.compareWithYesterday(organizationId, s, now, timezone);

  // Most urgent first; each link opens exactly the rows the number counts (same windows as stats()).
  const tiles: Tile[] = [
    { label: "Overdue follow-ups", n: s.overdueFollowUps, prev: y?.overdueFollowUps, href: "/follow-ups?view=team", icon: AlarmClock, backlog: true },
    { label: "Meetings without outcome", n: s.meetingsNeedOutcome, prev: y?.meetingsNeedOutcome, href: "/meetings", icon: CalendarCheck, backlog: true },
    {
      label: "Not contacted after 24h", n: s.uncontactedLeads, prev: y?.uncontactedLeads, icon: UserX, backlog: true,
      href: leadsWhere(
        { field: "firstContactedAt", operator: "is_empty" },
        { field: "createdAt", operator: "before", value: hoursAgo(now, 24) },
        { field: "createdAt", operator: "after", value: hoursAgo(now, 14 * 24) },
      ),
    },
    {
      label: "Unassigned leads", n: s.unassignedLeads, prev: y?.unassignedLeads, icon: Users, backlog: true,
      href: leadsWhere({ field: "ownerId", operator: "equals", value: "unassigned" }, { field: "createdAt", operator: "after", value: hoursAgo(now, 30 * 24) }),
    },
    { label: "Meetings left today", n: s.meetingsToday, prev: y?.meetingsToday, href: "/meetings", icon: CalendarClock, backlog: false },
    {
      label: "New leads (24h)", n: s.newLeads, prev: y?.newLeads, icon: UserPlus, backlog: false,
      href: leadsWhere({ field: "createdAt", operator: "after", value: hoursAgo(now, 24) }),
    },
  ];
  const reps = s.byRep.filter((r) => r.overdue + r.needOutcome > 0);

  return (
    <section className="rounded-2xl border bg-card p-6 space-y-5" aria-label="Today">
      <Header title="Today" subtitle="what needs attention across the team" timezone={timezone} emailLink />

      {!isActionable(s) ? (
        <p className="flex items-center gap-2 text-sm text-emerald-600">
          <CheckCircle2 className="h-4 w-4" /> All clear — nothing overdue, unassigned or waiting on an outcome.
        </p>
      ) : (
        <SummaryTiles tiles={tiles} />
      )}

      {(reps.length > 0 || s.calls.length > 0) && (
        <div className="grid gap-5 md:grid-cols-2">
          {reps.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Backlog by person</p>
              <ul className="space-y-1.5 text-sm">
                {reps.map((r) => (
                  <li key={r.name} className="flex justify-between gap-3">
                    <span className="truncate">{r.name}</span>
                    <span className="shrink-0 text-muted-foreground tabular-nums">
                      {[r.overdue && `${r.overdue} overdue`, r.needOutcome && `${r.needOutcome} no outcome`].filter(Boolean).join(" · ")}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {s.calls.length > 0 && (
            <div>
              <p className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <PhoneCall className="h-3.5 w-3.5" /> Calls in the last 24h
              </p>
              <ul className="space-y-1.5 text-sm">
                {s.calls.map((r) => (
                  <li key={r.name} className="flex justify-between gap-3">
                    <span className="truncate">{r.name}</span>
                    <span className="shrink-0 text-muted-foreground">{callsLine(r)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

// The signed-in person's own day, for My Dashboard (every role).
export async function MyDayCard({ organizationId, userId }: { organizationId: string; userId: string }) {
  const { timezone } = await getOrgFormat(organizationId);
  const now = new Date();
  const d = await DailySummaryService.personal(organizationId, userId, now, timezone);
  const tiles: Tile[] = [
    { label: "Overdue follow-ups", n: d.overdue, href: "/follow-ups", icon: AlarmClock, backlog: true },
    {
      label: "Not contacted after 24h", n: d.uncontacted, icon: UserX, backlog: true,
      href: leadsWhere(
        { field: "ownerId", operator: "equals", value: "me" },
        { field: "firstContactedAt", operator: "is_empty" },
        { field: "createdAt", operator: "before", value: hoursAgo(now, 24) },
        { field: "createdAt", operator: "after", value: hoursAgo(now, 14 * 24) },
      ),
    },
    { label: "Follow-ups due today", n: d.dueToday, href: "/follow-ups", icon: ListTodo, backlog: false },
    { label: "Meetings left today", n: d.meetingsToday, href: "/meetings", icon: CalendarClock, backlog: false },
    {
      label: "New leads (24h)", n: d.newLeads, icon: UserPlus, backlog: false,
      href: leadsWhere({ field: "ownerId", operator: "equals", value: "me" }, { field: "createdAt", operator: "after", value: hoursAgo(now, 24) }),
    },
  ];
  const clear = d.overdue + d.uncontacted + d.dueToday + d.meetingsToday + d.newLeads === 0;

  return (
    <section className="rounded-2xl border bg-card p-6 space-y-5" aria-label="Your day">
      <Header title="Your day" subtitle="your follow-ups, meetings and new leads" timezone={timezone} />
      {clear ? (
        <p className="flex items-center gap-2 text-sm text-emerald-600">
          <CheckCircle2 className="h-4 w-4" /> Nothing due — you&apos;re all caught up.
        </p>
      ) : (
        <SummaryTiles tiles={tiles} />
      )}
    </section>
  );
}

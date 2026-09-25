import { requireOrg, hasPermission } from "@/lib/rbac";
import { normalizePhone } from "@/lib/leads/normalize";
import { orgDialCode } from "@/lib/leads/orgDialCode";
import { db } from "@/db";
import { followUps, leads, users } from "@/db/schema";
import { eq, and, or, asc, isNull, sql, type SQL } from "drizzle-orm";
import { getOrgFormat } from "@/lib/format.server";
import { startOfZonedDay, zonedParts } from "@/lib/tz";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { FollowUpActions } from "@/components/leads/FollowUpActions";
import { NewFollowUpButton } from "@/components/leads/NewFollowUpButton";
import { SendFollowUpButton } from "@/components/leads/SendFollowUpButton";
import { isSendableFollowUp } from "@/lib/followUps/types";
import { followUpTypeLabel } from "@/lib/followUps/types";
import Link from "next/link";
import { LocalTime } from "@/components/LocalTime";

const LIST_LIMIT = 500;
type View = "mine" | "team" | "unassigned";

export default async function FollowUpsDashboard({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { userId, organizationId } = await requireOrg();
  // Admins (settings.manage) can also see the whole team's list and the follow-ups nobody owns —
  // e.g. sequence/automation steps on unassigned leads, which otherwise remind no one.
  const canSeeTeam = await hasPermission("settings.manage");
  const requested = (await searchParams).view;
  const view: View = canSeeTeam && (requested === "team" || requested === "unassigned") ? requested : "mine";

  const [dialCode, { timezone }, orgUsers] = await Promise.all([
    orgDialCode(organizationId),
    getOrgFormat(organizationId),
    db.select({ id: users.id, firstName: users.firstName, lastName: users.lastName, email: users.email })
      .from(users)
      .where(and(eq(users.organizationId, organizationId), eq(users.isActive, true), isNull(users.deletedAt))),
  ]);
  const people = orgUsers.map((u) => ({ id: u.id, name: [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email }));
  const nameOf = (id: string | null) => (id ? people.find((p) => p.id === id)?.name ?? "Former member" : null);

  const scope: SQL = and(
    eq(leads.organizationId, organizationId),
    isNull(leads.deletedAt),
    view === "mine" ? or(eq(followUps.userId, userId), eq(leads.ownerId, userId)) : undefined,
    view === "unassigned" ? and(isNull(followUps.userId), isNull(leads.ownerId)) : undefined,
  )!;

  // Counters come from one COUNT query (not the capped list), in the workspace's day and week.
  const now = new Date();
  const tomorrowStart = startOfZonedDay(now, timezone, 1);
  const weekStart = startOfZonedDay(now, timezone, -zonedParts(now, timezone).weekday);
  const iso = (d: Date) => d.toISOString();
  const [[counts], rows] = await Promise.all([
    db
      .select({
        overdue: sql<number>`count(*) filter (where ${followUps.status} = 'pending' and ${followUps.dueAt} < ${iso(now)}::timestamp)`,
        today: sql<number>`count(*) filter (where ${followUps.status} = 'pending' and ${followUps.dueAt} >= ${iso(now)}::timestamp and ${followUps.dueAt} < ${iso(tomorrowStart)}::timestamp)`,
        later: sql<number>`count(*) filter (where ${followUps.status} = 'pending' and ${followUps.dueAt} >= ${iso(tomorrowStart)}::timestamp)`,
        doneThisWeek: sql<number>`count(*) filter (where ${followUps.status} = 'completed' and ${followUps.completedAt} >= ${iso(weekStart)}::timestamp)`,
      })
      .from(followUps)
      .innerJoin(leads, eq(followUps.leadId, leads.id))
      .where(scope),
    db
      .select({ followUp: followUps, lead: { id: leads.id, name: leads.name, phone: leads.phone } })
      .from(followUps)
      .innerJoin(leads, eq(followUps.leadId, leads.id))
      .where(and(scope, eq(followUps.status, "pending")))
      .orderBy(asc(followUps.dueAt))
      .limit(LIST_LIMIT),
  ]);
  const n = (v: unknown) => Number(v ?? 0);
  const totalPending = n(counts?.overdue) + n(counts?.today) + n(counts?.later);

  const overdue = rows.filter((f) => f.followUp.dueAt < now);
  const today = rows.filter((f) => f.followUp.dueAt >= now && f.followUp.dueAt < tomorrowStart);
  const later = rows.filter((f) => f.followUp.dueAt >= tomorrowStart);
  const showAssignee = view !== "mine";

  const tabs: { key: View; label: string }[] = [
    { key: "mine", label: "Mine" },
    { key: "team", label: "Whole team" },
    { key: "unassigned", label: "Unassigned" },
  ];

  return (
    <div className="p-4 sm:p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">Follow-ups</h1>
        <div className="flex items-center gap-3">
          <Link href="/follow-ups/calendar" className="text-sm font-medium text-muted-foreground hover:underline">Calendar view →</Link>
          <NewFollowUpButton />
        </div>
      </div>

      {canSeeTeam && (
        <nav aria-label="Whose follow-ups" className="flex gap-1 rounded-lg bg-muted p-1 w-fit">
          {tabs.map((t) => (
            <Link key={t.key} href={t.key === "mine" ? "/follow-ups" : `/follow-ups?view=${t.key}`}
              aria-current={view === t.key ? "page" : undefined}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${view === t.key ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
              {t.label}
            </Link>
          ))}
        </nav>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className={n(counts?.overdue) > 0 ? "border-destructive/40" : undefined}>
          <CardHeader className="pb-2"><CardTitle className={n(counts?.overdue) > 0 ? "text-destructive" : undefined}>Overdue</CardTitle></CardHeader>
          <CardContent><p className={`text-2xl font-bold ${n(counts?.overdue) > 0 ? "text-destructive" : ""}`}>{n(counts?.overdue)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle>Later today</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{n(counts?.today)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle>Upcoming</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{n(counts?.later)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-muted-foreground">Done this week</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-muted-foreground">{n(counts?.doneThisWeek)}</p></CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        {totalPending > rows.length && (
          <p className="text-xs text-muted-foreground">Showing the {rows.length} soonest of {totalPending} pending follow-ups.</p>
        )}
        <Section title="Overdue" tone="bad" rows={overdue} dialCode={dialCode} people={people} nameOf={nameOf} showAssignee={showAssignee} />
        <Section title="Later today" rows={today} dialCode={dialCode} people={people} nameOf={nameOf} showAssignee={showAssignee} />
        <Section title="Upcoming" rows={later} dialCode={dialCode} people={people} nameOf={nameOf} showAssignee={showAssignee} />

        {rows.length === 0 && (
          <div className="rounded-md border border-dashed p-8 text-center space-y-2">
            <p className="font-medium">{view === "unassigned" ? "Every follow-up has someone on it." : "You're all caught up."}</p>
            <p className="text-sm text-muted-foreground">Add a follow-up here, or from a lead&apos;s Follow-ups tab, to be reminded when it&apos;s due.</p>
          </div>
        )}
      </div>
    </div>
  );
}

type Row = {
  followUp: { id: string; title: string; type: string; description: string | null; dueAt: Date; userId: string | null };
  lead: { id: string; name: string; phone: string | null };
};

function Section({
  title, rows, tone, ...rest
}: {
  title: string;
  rows: Row[];
  tone?: "bad";
  dialCode: string | null;
  people: { id: string; name: string }[];
  nameOf: (id: string | null) => string | null;
  showAssignee: boolean;
}) {
  if (rows.length === 0) return null;
  return (
    <div className={`p-4 rounded-md space-y-2 border ${tone === "bad" ? "border-destructive/30 bg-destructive/5" : "border-border bg-muted"}`}>
      <h3 className={`font-semibold ${tone === "bad" ? "text-destructive" : "text-foreground"}`}>{title} ({rows.length})</h3>
      {rows.map((f) => <FollowUpRow key={f.followUp.id} f={f} overdue={tone === "bad"} {...rest} />)}
    </div>
  );
}

// One follow-up: what + who (linked), when, and actions. Stacks on phones. Follow-ups that carry a
// ready WhatsApp message (e.g. personal-mode sequence steps) show it with a one-tap send.
function FollowUpRow({
  f, dialCode, overdue = false, people, nameOf, showAssignee,
}: {
  f: Row;
  dialCode: string | null;
  overdue?: boolean;
  people: { id: string; name: string }[];
  nameOf: (id: string | null) => string | null;
  showAssignee: boolean;
}) {
  const sendable = isSendableFollowUp(f.followUp);
  return (
    <div className="flex flex-col gap-3 rounded border border-border bg-card p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 space-y-1">
        <p className="font-medium">
          {f.followUp.title} <span className="text-xs text-muted-foreground">· {followUpTypeLabel(f.followUp.type)}</span>
        </p>
        <p className="text-sm text-muted-foreground">
          Lead:{" "}
          <Link href={`/leads/${f.lead.id}`} className="text-foreground underline-offset-2 hover:underline">
            {f.lead.name}
          </Link>
          {showAssignee && <> · {nameOf(f.followUp.userId) ?? "Unassigned"}</>}
        </p>
        {sendable && <p className="whitespace-pre-wrap rounded-md bg-muted/60 p-2 text-xs text-muted-foreground">{f.followUp.description}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <span className={`text-sm font-semibold ${overdue ? "text-destructive" : "text-muted-foreground"}`}>
          <LocalTime iso={f.followUp.dueAt} mode="full" />
        </span>
        {sendable && (
          <SendFollowUpButton followUpId={f.followUp.id} leadId={f.lead.id} leadName={f.lead.name} phone={normalizePhone(f.lead.phone, dialCode) ?? null} message={f.followUp.description!} />
        )}
        <FollowUpActions id={f.followUp.id} title={f.followUp.title} dueAt={f.followUp.dueAt} assigneeId={f.followUp.userId} users={people} />
      </div>
    </div>
  );
}

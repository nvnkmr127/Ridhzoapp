import Link from "next/link";
import { and, desc, eq, gte, isNull } from "drizzle-orm";
import { Phone } from "lucide-react";
import { db } from "@/db";
import { activities, leads, users } from "@/db/schema";
import { requireOrg, hasPermission } from "@/lib/rbac";
import { visibleToUserSql } from "@/lib/leads/access";
import { answerRate, answeredCall, outgoingCall } from "@/domains/leads/callStats";
import { EmptyState } from "@/components/ui/empty-state";
import { getOrgFormat } from "@/lib/format.server";

const RANGES = [7, 30, 90] as const;
const LIMIT = 200;

// The call log on the web: calls the phones synced or reps logged, newest first. Reps see calls on leads
// they can open; admins (settings.manage) see the whole workspace. The same "attempt / answered" rule as
// every other call report (domains/leads/callStats).
export default async function CallsPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const { userId, organizationId } = await requireOrg();
  const sp = await searchParams;
  const days = RANGES.find((d) => String(d) === sp.days) ?? 30;
  const since = new Date(Date.now() - days * 86_400_000);
  const isAdmin = await hasPermission("settings.manage");
  const { timezone } = await getOrgFormat(organizationId);

  const rows = await db
    .select({
      id: activities.id, leadId: leads.id, leadName: leads.name, content: activities.content, durationSec: activities.durationSec,
      at: activities.occurredAt, firstName: users.firstName, lastName: users.lastName, email: users.email,
      outgoing: outgoingCall, answered: answeredCall,
    })
    .from(activities)
    .innerJoin(leads, eq(activities.leadId, leads.id))
    .leftJoin(users, eq(activities.userId, users.id))
    .where(and(
      eq(leads.organizationId, organizationId), isNull(leads.deletedAt),
      eq(activities.type, "call"), gte(activities.occurredAt, since),
      isAdmin ? undefined : visibleToUserSql(userId),
    ))
    .orderBy(desc(activities.occurredAt))
    .limit(LIMIT);

  const attempts = rows.filter((r) => r.outgoing).length;
  const answered = rows.filter((r) => r.outgoing && r.answered).length;
  const rate = answerRate(answered, attempts);
  const when = (d: Date) => new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short", timeZone: timezone }).format(d);
  const mins = (s: number | null) => (s ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}` : "—");

  return (
    <div className="flex-1 space-y-4 p-4 pt-4 sm:p-8 sm:pt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Calls</h2>
          <p className="text-sm text-muted-foreground">{isAdmin ? "Every call logged in your workspace." : "Calls on your leads."} Synced from the phones and logged by reps.</p>
        </div>
        <div className="flex gap-1 text-sm" role="tablist" aria-label="Date range">
          {RANGES.map((d) => (
            <Link key={d} href={`/calls?days=${d}`} className={`rounded-md border px-3 py-1 ${d === days ? "border-foreground font-medium" : "text-muted-foreground"}`}>Last {d} days</Link>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-6 text-sm text-muted-foreground">
        <span><span className="font-semibold text-foreground">{attempts}</span> outgoing</span>
        <span><span className="font-semibold text-foreground">{answered}</span> answered</span>
        <span><span className="font-semibold text-foreground">{rate === null ? "—" : `${rate}%`}</span> answer rate</span>
        {rows.length === LIMIT && <span>Showing the latest {LIMIT}.</span>}
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={<Phone className="h-10 w-10" />} title="No calls in this period" description="Calls appear here once reps log them or the phone app syncs its call log." />
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr><th className="p-3">When</th><th className="p-3">Lead</th><th className="p-3">Call</th><th className="p-3">Talk time</th><th className="p-3">By</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="whitespace-nowrap p-3">{when(r.at)}</td>
                  <td className="p-3"><Link className="underline-offset-2 hover:underline" href={`/leads/${r.leadId}`}>{r.leadName}</Link></td>
                  <td className="p-3">{r.content ?? "Call"}</td>
                  <td className="p-3">{mins(r.durationSec)}</td>
                  <td className="p-3">{[r.firstName, r.lastName].filter(Boolean).join(" ") || r.email || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

import { requireOrg } from "@/lib/rbac";
import { db } from "@/db";
import { followUps, leads } from "@/db/schema";
import { eq, and, or, asc, isNull } from "drizzle-orm";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { FollowUpActions } from "@/components/leads/FollowUpActions";
import { SendFollowUpButton, isSendableFollowUp } from "@/components/leads/SendFollowUpButton";
import Link from "next/link";
import { LocalTime } from "@/components/LocalTime";

export default async function FollowUpsDashboard() {
  const { userId, organizationId } = await requireOrg();
  
  // Fetch follow-ups for the user
  const userFollowUps = await db
    .select({
      followUp: followUps,
      lead: leads,
    })
    .from(followUps)
    .innerJoin(leads, eq(followUps.leadId, leads.id))
    .where(
      and(
        eq(leads.organizationId, organizationId),
        or(eq(followUps.userId, userId), eq(leads.ownerId, userId)),
        isNull(leads.deletedAt),
      ),
    )
    .orderBy(asc(followUps.dueAt));

  const now = new Date();
  
  // Basic grouping
  const overdue = userFollowUps.filter(f => f.followUp.status === 'pending' && new Date(f.followUp.dueAt) < now);
  const completed = userFollowUps.filter(f => f.followUp.status === 'completed');
  const upcoming = userFollowUps.filter(f => f.followUp.status === 'pending' && new Date(f.followUp.dueAt) >= now);
  // Anything pending that falls on today's date — including items already past their time today.
  const dueToday = userFollowUps.filter(f => f.followUp.status === 'pending' && new Date(f.followUp.dueAt).toDateString() === now.toDateString());

  return (
    <div className="p-4 sm:p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">My Follow-ups</h1>
        <a href="/follow-ups/calendar" className="text-sm font-medium text-muted-foreground hover:underline">Calendar view →</a>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle>Due Today</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{dueToday.length}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-foreground">Overdue</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-foreground">{overdue.length}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle>Upcoming</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{upcoming.length}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-muted-foreground">Completed</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-muted-foreground">{completed.length}</p></CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <h2 className="text-xl font-semibold border-b pb-2">Pending Actions</h2>
        {overdue.length > 0 && (
          <div className="bg-muted p-4 rounded-md space-y-2 border border-border">
            <h3 className="font-semibold text-foreground">Overdue</h3>
            {overdue.map((f) => (
              <FollowUpRow key={f.followUp.id} f={f} overdue />
            ))}
          </div>
        )}

        {upcoming.length > 0 && (
          <div className="bg-muted p-4 rounded-md space-y-2 border border-border">
            <h3 className="font-semibold text-foreground">Upcoming</h3>
            {upcoming.map((f) => (
              <FollowUpRow key={f.followUp.id} f={f} />
            ))}
          </div>
        )}

        {upcoming.length === 0 && overdue.length === 0 && (
          <p className="text-muted-foreground italic">No pending follow-ups.</p>
        )}
      </div>
    </div>
  );
}

// One follow-up: what + who (linked), when, and actions. Stacks on phones. Follow-ups that carry a
// ready WhatsApp message (e.g. personal-mode sequence steps) show it with a one-tap send.
function FollowUpRow({
  f,
  overdue = false,
}: {
  f: {
    followUp: { id: string; title: string; type: string; description: string | null; dueAt: Date };
    lead: { id: string; name: string; phone: string | null };
  };
  overdue?: boolean;
}) {
  const sendable = isSendableFollowUp(f.followUp);
  return (
    <div className="flex flex-col gap-3 rounded border border-border bg-card p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 space-y-1">
        <p className="font-medium">
          {f.followUp.title} <span className="text-xs text-muted-foreground">({f.followUp.type})</span>
        </p>
        <p className="text-sm text-muted-foreground">
          Lead:{" "}
          <Link href={`/leads/${f.lead.id}`} className="text-foreground underline-offset-2 hover:underline">
            {f.lead.name}
          </Link>
        </p>
        {sendable && <p className="whitespace-pre-wrap rounded-md bg-muted/60 p-2 text-xs text-muted-foreground">{f.followUp.description}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <span className={`text-sm font-semibold ${overdue ? "text-foreground" : "text-muted-foreground"}`}>
          <LocalTime iso={f.followUp.dueAt} mode="full" />
        </span>
        {sendable && (
          <SendFollowUpButton followUpId={f.followUp.id} leadId={f.lead.id} leadName={f.lead.name} phone={f.lead.phone} message={f.followUp.description!} />
        )}
        <FollowUpActions id={f.followUp.id} />
      </div>
    </div>
  );
}

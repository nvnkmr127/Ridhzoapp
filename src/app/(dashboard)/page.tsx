import { Suspense } from "react";
import Link from "next/link";
import { MetricsCards } from "@/components/dashboard/MetricsCards";
import { LeadsBySourceChart, LeadsByStageChart, LeadsByOwnerChart } from "@/components/dashboard/ChartsLazy";
import { RecentActivityFeed } from "@/components/dashboard/RecentActivityFeed";
import { PriorityActions } from "@/components/dashboard/PriorityActions";
import { GettingStarted } from "@/components/dashboard/GettingStarted";
import { DashboardDateFilter } from "@/components/dashboard/DashboardDateFilter";
import { requireOrg, hasPermission } from "@/lib/rbac";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { automations, leadSources } from "@/db/schema";
import { and, count, eq } from "drizzle-orm";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Users } from "lucide-react";
import { AnalyticsService, AnalyticsFilters } from "@/lib/analytics/service";
import { SlaAnalyticsService } from "@/domains/leads/slaAnalyticsService";
import { ContentSharingService } from "@/domains/leads/contentSharingService";
import { Timer, Eye, PartyPopper } from "lucide-react";
import { HabitService, recapLine, shortMinutes } from "@/domains/organizations/habitService";
import { OrgService } from "@/domains/organizations/service";

// Setup checklist state for the dashboard's GettingStarted card, read from real data.
async function getSetupProgress(organizationId: string, totalLeads: number) {
  const [[sources], [autos]] = await Promise.all([
    db.select({ n: count() }).from(leadSources).where(and(eq(leadSources.organizationId, organizationId), eq(leadSources.isActive, 1))),
    db.select({ n: count() }).from(automations).where(and(eq(automations.organizationId, organizationId), eq(automations.isActive, true))),
  ]);
  return { source: sources.n > 0, lead: totalLeads > 0, automation: autos.n > 0 };
}

function formatMinutes(mins: number): string {
  if (mins <= 0) return "—";
  if (mins < 60) return `${Math.round(mins)}m`;
  const hours = Math.floor(mins / 60);
  const rem = Math.round(mins % 60);
  if (hours < 24) return rem ? `${hours}h ${rem}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

export default async function ExecutiveDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { organizationId } = await requireOrg();
  // Workspace-wide numbers, every rep's pipeline and a cross-lead activity feed: admins only.
  // Reps get their own dashboard (same rule as leads: they only see their own).
  if (!(await hasPermission("settings.manage"))) redirect("/my-dashboard");
  const params = await searchParams;

  const filters: AnalyticsFilters = {
    organizationId,
    ownerId: typeof params.ownerId === "string" ? params.ownerId : undefined,
    teamId: typeof params.teamId === "string" ? params.teamId : undefined,
    dateRange: (typeof params.range === "string" ? params.range : "all") as any,
  };

  const [leadsBySource, pipelineDistribution, leadsByOwner, recentActivity, sla, content, speed, org] = await Promise.all([
    AnalyticsService.getLeadsBySource(filters),
    AnalyticsService.getPipelineDistribution(filters),
    AnalyticsService.getLeadsByOwner(filters),
    AnalyticsService.getRecentActivity(filters),
    SlaAnalyticsService.getSlaMetrics(organizationId),
    ContentSharingService.orgEngagementStats(organizationId),
    HabitService.speedBenchmark(organizationId),
    OrgService.getOrganization(organizationId),
  ]);

  // First two weeks (the trial): show what Ridhzo already did for them — proof before the trial ends.
  const ageDays = org ? Math.floor((Date.now() - new Date(org.createdAt).getTime()) / 86_400_000) : 99;
  const recap = ageDays >= 1 && ageDays < 15 && org ? await HabitService.recap(organizationId, new Date(org.createdAt)) : null;
  const inTrial = !!org?.trialEndsAt && new Date(org.trialEndsAt).getTime() > Date.now();

  const slaOnTrack = sla.complianceRatePercentage >= 80;
  const isAdmin = await hasPermission("settings.manage");
  const progress = isAdmin && sla.totalLeads < 5 ? await getSetupProgress(organizationId, sla.totalLeads) : null;

  // Brand-new workspace: a wall of zeros and empty charts reads as broken. Show the setup steps (or,
  // for invited members, what to expect) until the first lead arrives.
  if (sla.totalLeads === 0) {
    return (
      <div className="flex-1 space-y-6 p-4 pt-4 sm:p-8 sm:pt-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Welcome to Ridhzo</h2>
          <p className="text-sm text-muted-foreground">Your dashboard fills in as leads come in.</p>
        </div>
        {progress ? (
          <GettingStarted progress={progress} dismissible={false} />
        ) : (
          <EmptyState
            icon={<Users className="h-10 w-10 text-muted-foreground" />}
            title="No leads yet"
            description="Leads assigned to you will show up here. You can also add one yourself."
            action={
              <Link href="/leads">
                <Button>Go to leads</Button>
              </Link>
            }
          />
        )}
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-6 p-4 pt-4 sm:p-8 sm:pt-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Executive Dashboard</h2>
          <p className="text-sm text-muted-foreground">Real-time performance analytics for your lead management pipeline.</p>
        </div>
        <DashboardDateFilter />
      </div>

      {/* Keep the setup guide up through the first few leads (it's dismissible once they're rolling). */}
      {progress && <GettingStarted progress={progress} />}

      {recap && recap.leads > 0 && (
        <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <PartyPopper className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div>
              <p className="font-medium">Your first {ageDays} day{ageDays === 1 ? "" : "s"} with Ridhzo</p>
              <p className="text-sm text-muted-foreground">{recapLine(recap)}</p>
            </div>
          </div>
          {inTrial && (
            <Button asChild size="sm" className="shrink-0">
              <Link href="/settings/billing">Keep it going after your trial</Link>
            </Button>
          )}
        </div>
      )}

      <div className="space-y-6">
        <div className="rounded-2xl border bg-card p-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-orange-500/10">
              <Timer className="h-6 w-6 text-orange-500" />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Avg. speed to first response</p>
              <p className="text-3xl font-bold tracking-tight tabular-nums">{formatMinutes(sla.avgFirstContactMinutes)}</p>
              <p className="text-xs text-muted-foreground">
                First-to-respond wins the deal — {sla.contactedLeads} of {sla.totalLeads} leads contacted.
              </p>
              {speed.medianMinutes != null && (
                <p className="mt-1 text-xs font-medium text-emerald-600">
                  ⚡ Typical reply in {shortMinutes(speed.medianMinutes)} (30 days)
                  {speed.fasterThan != null && speed.fasterThan >= 50 && ` — faster than ${speed.fasterThan}% of businesses on Ridhzo`}
                </p>
              )}
            </div>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
              <Eye className="h-3.5 w-3.5" /> Content opened (7d)
            </p>
            <p className="text-3xl font-bold tracking-tight tabular-nums">{content.opensInWindow}</p>
            <p className="text-xs text-muted-foreground">
              {content.ignoredCount > 0 ? (
                <Link href="/leads/hot" className="hover:text-foreground underline-offset-2 hover:underline">
                  {content.ignoredCount} sent but never opened — nudge them
                </Link>
              ) : (
                "Opens on content you shared"
              )}
            </p>
          </div>
          <div className="sm:text-right">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">On-time response</p>
            <p className={`text-3xl font-bold tabular-nums ${slaOnTrack ? "text-emerald-600" : "text-orange-600"}`}>
              {sla.complianceRatePercentage.toFixed(0)}%
            </p>
            <p className="text-xs text-muted-foreground">{sla.slaBreachedCount} leads breached the response target</p>
          </div>
        </div>

        <Suspense fallback={<div className="h-40 bg-muted rounded-2xl animate-pulse" />}>
          <PriorityActions />
        </Suspense>

        <Suspense fallback={<div className="h-32 bg-muted rounded-2xl animate-pulse" />}>
          <MetricsCards filters={filters} hidePipelineValue />
        </Suspense>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-7">
          <div className="col-span-4 border rounded-2xl p-6 bg-card flex flex-col min-h-[350px]">
            <h3 className="text-lg font-medium mb-1">Leads by Source</h3>
            <p className="text-xs text-muted-foreground mb-4">Distribution of incoming lead volume across channels.</p>
            <LeadsBySourceChart data={leadsBySource} />
          </div>

          <div className="col-span-3 border rounded-2xl p-6 bg-card flex flex-col min-h-[350px]">
            <h3 className="text-lg font-medium mb-1">Pipeline Distribution</h3>
            <p className="text-xs text-muted-foreground mb-4">Leads broken down by current stage.</p>
            <LeadsByStageChart data={pipelineDistribution} />
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-7">
          <div className="col-span-4 border rounded-2xl p-6 bg-card flex flex-col min-h-[350px]">
            <h3 className="text-lg font-medium mb-1">Lead Distribution by Owner</h3>
            <p className="text-xs text-muted-foreground mb-4">Lead count assigned per team member.</p>
            <LeadsByOwnerChart data={leadsByOwner} />
          </div>

          <div className="col-span-3 border rounded-2xl p-6 bg-card flex flex-col min-h-[350px]">
            <h3 className="text-lg font-medium mb-1">Recent Activity</h3>
            <p className="text-xs text-muted-foreground mb-4">Live timeline of actions across all leads.</p>
            <RecentActivityFeed activities={recentActivity} />
          </div>
        </div>
      </div>
    </div>
  );
}

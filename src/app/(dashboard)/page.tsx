import { Suspense } from "react";
import Link from "next/link";
import { MetricsCards } from "@/components/dashboard/MetricsCards";
import { LeadsBySourceChart, LeadsByStageChart, LeadsByOwnerChart } from "@/components/dashboard/ChartsLazy";
import { RecentActivityFeed } from "@/components/dashboard/RecentActivityFeed";
import { PriorityActions } from "@/components/dashboard/PriorityActions";
import { GettingStarted } from "@/components/dashboard/GettingStarted";
import { DashboardDateFilter } from "@/components/dashboard/DashboardDateFilter";
import { requireOrg } from "@/lib/rbac";
import { AnalyticsService, AnalyticsFilters } from "@/lib/analytics/service";
import { SlaAnalyticsService } from "@/domains/leads/slaAnalyticsService";
import { ContentSharingService } from "@/domains/leads/contentSharingService";
import { Timer, Eye } from "lucide-react";

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
  const params = await searchParams;

  const filters: AnalyticsFilters = {
    organizationId,
    ownerId: typeof params.ownerId === "string" ? params.ownerId : undefined,
    teamId: typeof params.teamId === "string" ? params.teamId : undefined,
    dateRange: (typeof params.range === "string" ? params.range : "all") as any,
  };

  const [leadsBySource, pipelineDistribution, leadsByOwner, recentActivity, sla, content] = await Promise.all([
    AnalyticsService.getLeadsBySource(filters),
    AnalyticsService.getPipelineDistribution(filters),
    AnalyticsService.getLeadsByOwner(filters),
    AnalyticsService.getRecentActivity(filters),
    SlaAnalyticsService.getSlaMetrics(organizationId),
    ContentSharingService.orgEngagementStats(organizationId),
  ]);

  const slaOnTrack = sla.complianceRatePercentage >= 80;

  return (
    <div className="flex-1 space-y-6 p-4 pt-4 sm:p-8 sm:pt-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Executive Dashboard</h2>
          <p className="text-sm text-muted-foreground">Real-time performance analytics for your lead management pipeline.</p>
        </div>
        <DashboardDateFilter />
      </div>

      {sla.totalLeads === 0 && <GettingStarted />}

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

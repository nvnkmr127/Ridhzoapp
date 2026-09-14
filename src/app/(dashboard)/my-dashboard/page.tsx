import { Suspense } from "react";
import { MetricsCards } from "@/components/dashboard/MetricsCards";
import { LeadsByStageChart } from "@/components/dashboard/ChartsLazy";
import { RecentActivityFeed } from "@/components/dashboard/RecentActivityFeed";
import { requireOrg } from "@/lib/rbac";
import { AnalyticsService, AnalyticsFilters } from "@/lib/analytics/service";

export default async function SalesRepDashboardPage() {
  const { userId, organizationId } = await requireOrg();

  // Scope every metric/chart to the signed-in rep's own leads.
  const filters: AnalyticsFilters = { organizationId, ownerId: userId };

  const [pipelineDistribution, recentActivity] = await Promise.all([
    AnalyticsService.getPipelineDistribution(filters),
    AnalyticsService.getRecentActivity(filters),
  ]);

  return (
    <div className="flex-1 space-y-6 p-4 pt-4 sm:p-8 sm:pt-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">My Sales Dashboard</h2>
        <p className="text-sm text-muted-foreground">Your personal pipeline and recent activity.</p>
      </div>

      <div className="space-y-6">
        <Suspense fallback={<div className="h-32 bg-muted rounded-2xl animate-pulse" />}>
          <MetricsCards filters={filters} />
        </Suspense>

        <div className="grid gap-6 md:grid-cols-2">
          <div className="border border-border rounded-2xl p-6 bg-card flex flex-col min-h-[350px]">
            <h3 className="text-lg font-medium mb-1">My Pipeline by Stage</h3>
            <p className="text-xs text-muted-foreground mb-4">Your leads broken down by current stage.</p>
            <LeadsByStageChart data={pipelineDistribution} />
          </div>

          <div className="border border-border rounded-2xl p-6 bg-card flex flex-col min-h-[350px]">
            <h3 className="text-lg font-medium mb-1">My Recent Activity</h3>
            <p className="text-xs text-muted-foreground mb-4">Latest actions across the leads you own.</p>
            <RecentActivityFeed activities={recentActivity} />
          </div>
        </div>
      </div>
    </div>
  );
}

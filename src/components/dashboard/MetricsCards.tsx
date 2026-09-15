import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AnalyticsService, AnalyticsFilters } from "@/lib/analytics/service";
import { formatCurrency } from "@/lib/format";
import { getOrgFormat } from "@/lib/format.server";

export async function MetricsCards({ filters }: { filters: AnalyticsFilters }) {
  const metrics = await AnalyticsService.getLeadMetrics(filters);
  const followUpMetrics = await AnalyticsService.getFollowUpMetrics(filters);
  const fmt = await getOrgFormat(filters.organizationId);

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Leads</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{metrics.total}</div>
          <p className="text-xs text-muted-foreground">
            {metrics.total === 0 ? "No leads yet" : `${metrics.newLeads} new, ${metrics.activeLeads} active`}
          </p>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Conversion Rate</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{metrics.total === 0 ? "0%" : `${metrics.conversionRate.toFixed(1)}%`}</div>
          <p className="text-xs text-muted-foreground">{metrics.won} won / {metrics.lost + metrics.unqualified} lost or disqualified</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Pipeline Value</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{formatCurrency(metrics.pipelineValue, fmt)}</div>
          <p className="text-xs text-muted-foreground">From active leads</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Follow-up Tasks</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-foreground">{followUpMetrics.overdue}</span>
            <span className="text-xs text-muted-foreground">overdue</span>
            <span className="text-lg font-semibold text-muted-foreground ml-2">{followUpMetrics.dueToday}</span>
            <span className="text-xs text-muted-foreground">due today</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">{followUpMetrics.completionRate.toFixed(1)}% completion rate</p>
        </CardContent>
      </Card>
    </div>
  );
}

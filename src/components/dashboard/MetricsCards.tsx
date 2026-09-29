import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AnalyticsService, AnalyticsFilters } from "@/lib/analytics/service";
import { periodChange, type Change } from "@/lib/analytics/change";
import { formatCurrency } from "@/lib/format";
import { getOrgFormat } from "@/lib/format.server";

function ChangeLine({ change }: { change: Change | null }) {
  if (!change) return null;
  const tone = change.good == null ? "text-muted-foreground" : change.good ? "text-emerald-600" : "text-destructive";
  return <p className={`text-xs ${tone}`}>{change.text}</p>;
}

// Headline KPIs for the filter's window. With a bounded window each number also shows its change vs
// the same-length window just before it (all-time has no "before", so no change line).
export async function MetricsCards({ filters }: { filters: AnalyticsFilters }) {
  const prev = await AnalyticsService.previousPeriod(filters);
  const [metrics, followUpMetrics, fmt, won, prevMetrics, prevWon] = await Promise.all([
    AnalyticsService.getLeadMetrics(filters),
    AnalyticsService.getFollowUpMetrics(filters),
    getOrgFormat(filters.organizationId),
    AnalyticsService.getWonSummary(filters),
    prev ? AnalyticsService.getLeadMetrics(prev) : null,
    prev ? AnalyticsService.getWonSummary(prev) : null,
  ]);

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Leads</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{metrics.total}</div>
          <p className="text-xs text-muted-foreground">
            {metrics.total === 0 ? "No leads yet" : `${metrics.newLeads} new, ${metrics.activeLeads} active`}
          </p>
          <ChangeLine change={periodChange(metrics.total, prevMetrics?.total, "pct")} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Conversion Rate</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{metrics.total === 0 ? "0%" : `${metrics.conversionRate.toFixed(1)}%`}</div>
          <p className="text-xs text-muted-foreground">{metrics.won} won / {metrics.lost + metrics.unqualified} lost or disqualified</p>
          <ChangeLine change={periodChange(metrics.conversionRate, prevMetrics?.conversionRate, "pts")} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Won</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{formatCurrency(won.value, fmt)}</div>
          <p className="text-xs text-muted-foreground">{won.count} deal{won.count === 1 ? "" : "s"} closed {prev ? "in this period" : "all time"}</p>
          <ChangeLine change={periodChange(won.value, prevWon?.value, "pct")} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Open Pipeline</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{formatCurrency(metrics.pipelineValue, fmt)}</div>
          <p className="text-xs text-muted-foreground">Expected value of active leads</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Follow-up Tasks</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-baseline gap-x-2">
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

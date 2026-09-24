import { TrendingUp, Trophy, Network, HeartPulse } from "lucide-react";
import { requireOrg, hasPermission } from "@/lib/rbac";
import { redirect } from "next/navigation";
import { RevenueForecastService } from "@/domains/leads/revenueForecastService";
import { WinLossAnalyticsService } from "@/domains/leads/winLossAnalyticsService";
import { SourceRoiAnalyticsService } from "@/domains/leads/sourceRoiAnalyticsService";
import { EngagementHealthService } from "@/domains/leads/engagementHealthService";
import { OptimalContactTimeService } from "@/domains/leads/optimalContactTimeService";
import { LeadQualificationMatrixService } from "@/domains/leads/leadQualificationMatrixService";
import { PipelineVelocityService } from "@/domains/leads/pipelineVelocityService";
import { PipelineAgingService } from "@/domains/leads/pipelineAgingService";
import { StageStagnationService } from "@/domains/leads/stageStagnationService";
import { LeadCohortAnalyticsService } from "@/domains/leads/leadCohortAnalyticsService";
import { CustomerLtvAnalyticsService } from "@/domains/leads/customerLtvAnalyticsService";
import { LeadGeoAnalyticsService } from "@/domains/leads/leadGeoAnalyticsService";
import { ChannelAnalyticsService } from "@/domains/leads/channelAnalyticsService";
import { TeamPerformanceService } from "@/domains/leads/teamPerformanceService";
import { ActivityDigestService } from "@/domains/leads/activityDigestService";
import { PipelineScorecardService } from "@/domains/leads/pipelineScorecardService";
import { CapacityAssignmentService } from "@/domains/leads/capacityAssignmentService";
import { FollowUpEscalationService } from "@/domains/leads/followUpEscalationService";
import { Clock, Filter, Gauge, Hourglass, Award, Layers3, Crown, MapPin, Radio, Activity, AlertOctagon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency } from "@/lib/format";
import { getOrgFormat } from "@/lib/format.server";

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold tabular-nums">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

import { AnalyticsCoordinator } from "@/domains/leads/analyticsCoordinator";
import { SlaAnalyticsService } from "@/domains/leads/slaAnalyticsService";

export default async function InsightsPage() {
  const { organizationId } = await requireOrg();
  // Revenue, every rep's performance and lead-level lists across the workspace: admins only.
  if (!(await hasPermission("settings.manage"))) redirect("/my-dashboard");
  const fmt = await getOrgFormat(organizationId);
  // Money in the workspace's configured currency/locale (was hardcoded USD).
  const money = (n: number) => formatCurrency(n, fmt);

  // Preload shared tenant datasets in ONE parallel round trip
  const [tenantLeads, tenantUsers] = await Promise.all([
    AnalyticsCoordinator.getTenantLeads(organizationId),
    AnalyticsCoordinator.getTenantUsers(organizationId),
  ]);

  const [forecast, winLoss, sourceRoi, health, bestTime, qualification, velocity, aging] = await Promise.all([
    RevenueForecastService.getRevenueForecast(organizationId, tenantLeads),
    WinLossAnalyticsService.getWinLossAnalytics(organizationId, tenantLeads),
    SourceRoiAnalyticsService.getLeadSourceRoiMetrics(organizationId, tenantLeads),
    EngagementHealthService.getEngagementHealthBreakdown(organizationId, tenantLeads),
    OptimalContactTimeService.getOptimalContactTimes(organizationId),
    LeadQualificationMatrixService.getQualificationReport(organizationId, tenantLeads),
    PipelineVelocityService.getVelocityMetrics(organizationId, tenantLeads),
    PipelineAgingService.getPipelineAgingMatrix(organizationId, tenantLeads),
  ]);

  const [stagnant, cohorts, ltv, geo, channels, team, digest] = await Promise.all([
    StageStagnationService.getStagnantLeads(organizationId, 10, tenantLeads),
    LeadCohortAnalyticsService.getCohortAnalytics(organizationId, tenantLeads),
    CustomerLtvAnalyticsService.getLtvAnalytics(organizationId, tenantLeads),
    LeadGeoAnalyticsService.getGeoAnalytics(organizationId, tenantLeads),
    ChannelAnalyticsService.getChannelMetrics(organizationId),
    TeamPerformanceService.getTeamLeaderboard(organizationId, undefined, tenantUsers),
    ActivityDigestService.getDailyActivityDigest(organizationId, undefined, tenantUsers),
  ]);

  const [capacities, overdue, sla] = await Promise.all([
    CapacityAssignmentService.getRepCapacities(organizationId, 25, tenantUsers),
    FollowUpEscalationService.getOverdueFollowUps(organizationId),
    SlaAnalyticsService.getSlaMetrics(organizationId, 15, tenantLeads),
  ]);

  const scorecard = await PipelineScorecardService.getPipelineScorecard(organizationId, {
    health,
    sla,
    stagnantLeads: stagnant,
  });
  const GRADE_COLOR: Record<string, string> = { A: "text-emerald-500", B: "text-lime-500", C: "text-amber-500", D: "text-rose-500" };

  return (
    <div className="flex-1 space-y-6 p-4 pt-4 sm:p-8 sm:pt-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Insights</h2>
        <p className="text-sm text-muted-foreground">Forecast, win/loss, source ROI, and pipeline health at a glance.</p>
      </div>

      {/* Pipeline scorecard — composite grade */}
      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Gauge className="h-4 w-4 text-primary" /> Pipeline scorecard
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
            <div className="flex items-center gap-4">
              <div className={`text-5xl font-bold tabular-nums ${GRADE_COLOR[scorecard.grade] ?? ""}`}>{scorecard.grade}</div>
              <div>
                <p className="text-2xl font-bold tabular-nums">{scorecard.overallScore}/100</p>
                <p className="text-xs text-muted-foreground">Overall pipeline health</p>
              </div>
            </div>
            <div className="grid flex-1 grid-cols-2 gap-4 sm:grid-cols-4">
              <Stat label="On-time" value={`${scorecard.slaScore}`} />
              <Stat label="Health" value={`${scorecard.healthScore}`} />
              <Stat label="Stalled" value={`${scorecard.stagnationScore}`} />
              <Stat label="Velocity" value={`${scorecard.velocityScore}`} />
            </div>
          </div>
          {scorecard.recommendations.length > 0 && (
            <ul className="mt-4 space-y-1 border-t border-border pt-3">
              {scorecard.recommendations.map((r, i) => (
                <li key={i} className="text-sm text-muted-foreground">• {r}</li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Best time to reach */}
      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="h-4 w-4 text-sky-500" /> Best time to reach your leads
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Stat label="Best hour" value={bestTime.bestHourOfDayLabel} sub="When contact most often lands" />
            <Stat label="Best day" value={bestTime.bestDayOfWeek} sub="Highest-response weekday" />
            <Stat label="Based on" value={`${bestTime.totalTouchpointsAnalyzed}`} sub="touchpoints analyzed" />
          </div>
        </CardContent>
      </Card>

      {/* Revenue forecast */}
      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="h-4 w-4 text-emerald-500" /> Revenue forecast
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Stat label="Weighted projection" value={money(forecast.weightedProjectedRevenue)} sub="Probability-adjusted open pipeline" />
            <Stat label="Unweighted pipeline" value={money(forecast.unweightedTotalValue)} sub="Total value of open leads" />
            <Stat label="Won revenue" value={money(forecast.wonRevenue)} sub="Closed-won to date" />
          </div>
          {forecast.stageBreakdown.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Stage</TableHead>
                  <TableHead className="text-right">Leads</TableHead>
                  <TableHead className="text-right">Weight</TableHead>
                  <TableHead className="text-right">Weighted value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {forecast.stageBreakdown.map((s) => (
                  <TableRow key={s.status}>
                    <TableCell className="capitalize">{s.status}</TableCell>
                    <TableCell className="text-right tabular-nums">{s.leadCount}</TableCell>
                    <TableCell className="text-right tabular-nums">{Math.round(s.probabilityWeight * 100)}%</TableCell>
                    <TableCell className="text-right tabular-nums">{money(s.weightedValue)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Win/loss */}
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Trophy className="h-4 w-4 text-amber-500" /> Win / loss
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Stat label="Win rate" value={`${winLoss.winRatePercentage.toFixed(0)}%`} />
              <Stat label="Won" value={String(winLoss.wonCount)} />
              <Stat label="Lost" value={String(winLoss.lostCount)} />
              <Stat label="Unqualified" value={String(winLoss.unqualifiedCount)} />
            </div>
            {winLoss.lossReasonBreakdown.length > 0 ? (
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Top loss reasons</p>
                {winLoss.lossReasonBreakdown.map((r) => (
                  <div key={r.reason} className="flex items-center justify-between text-sm">
                    <span className="capitalize">{r.reason}</span>
                    <span className="text-muted-foreground tabular-nums">{r.count} ({r.percentage.toFixed(0)}%)</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No closed-lost leads yet.</p>
            )}
          </CardContent>
        </Card>

        {/* Engagement health */}
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <HeartPulse className="h-4 w-4 text-rose-500" /> Pipeline health
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Stat label="Health score" value={`${health.healthScorePercentage.toFixed(0)}%`} sub={`${health.totalActiveLeads} active`} />
              <Stat label="Healthy" value={String(health.healthyCount)} />
              <Stat label="At risk" value={String(health.atRiskCount)} />
              <Stat label="Critical" value={String(health.criticalCount)} />
            </div>
            {health.criticalLeads.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Needs attention now</p>
                {health.criticalLeads.slice(0, 5).map((l) => (
                  <div key={l.id} className="flex items-center justify-between text-sm">
                    <span className="truncate">{l.name || "Unnamed lead"}</span>
                    <Badge variant="outline">{l.daysSinceContact}d silent</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Lead qualification + pipeline velocity */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Filter className="h-4 w-4 text-indigo-500" /> Lead qualification (BANT)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Stat label="Avg score" value={`${Math.round(qualification.averageQualificationScore)}`} sub={`${qualification.totalActiveLeads} active`} />
              <Stat label="Sales-qualified" value={String(qualification.sqlCount)} />
              <Stat label="Marketing-qualified" value={String(qualification.mqlCount)} />
              <Stat label="Unqualified" value={String(qualification.unqualifiedCount)} />
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Gauge className="h-4 w-4 text-teal-500" /> Pipeline velocity
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-3 gap-4">
              <Stat label="New→Active" value={`${velocity.conversionRates.newToActiveRate.toFixed(0)}%`} />
              <Stat label="Active→Won" value={`${velocity.conversionRates.activeToWonRate.toFixed(0)}%`} />
              <Stat label="Overall win" value={`${velocity.conversionRates.overallWinRate.toFixed(0)}%`} />
            </div>
            {velocity.bottleneckStage && (
              <p className="text-xs text-muted-foreground">
                Bottleneck: <span className="font-medium capitalize text-foreground">{velocity.bottleneckStage}</span> — slowest stage to clear.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Pipeline aging */}
      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Hourglass className="h-4 w-4 text-orange-500" /> Pipeline aging
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Stat label="Avg lead age" value={`${aging.avgLeadAgeDays.toFixed(0)}d`} sub={`${aging.totalActiveLeads} active leads`} />
            <Stat label="Value at risk" value={money(aging.staleValueAtRisk)} sub="in leads aging 30d+" />
            <Stat label="Age buckets" value={`${aging.buckets.length}`} sub="0-7d · 8-14d · 15-30d · 30d+" />
          </div>
          {aging.buckets.length > 0 && (
            <div className="flex gap-2">
              {aging.buckets.map((b) => (
                <div key={b.bucketKey} className="flex-1 rounded-lg border p-2 text-center">
                  <p className="text-xs text-muted-foreground">{b.label}</p>
                  <p className="text-lg font-bold tabular-nums">{b.count}</p>
                  <p className="text-[10px] text-muted-foreground">{b.percentage.toFixed(0)}%</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Team leaderboard + stuck-in-stage */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Award className="h-4 w-4 text-amber-500" /> Team leaderboard
            </CardTitle>
          </CardHeader>
          <CardContent>
            {team.length === 0 ? (
              <p className="text-sm text-muted-foreground">No rep activity yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Rep</TableHead>
                    <TableHead className="text-right">Leads</TableHead>
                    <TableHead className="text-right">Won</TableHead>
                    <TableHead className="text-right">Win %</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {team.map((r) => (
                    <TableRow key={r.userId}>
                      <TableCell>#{r.rank} {r.name}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.totalAssignedLeads}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.wonLeads}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.winRatePercentage.toFixed(0)}%</TableCell>
                      <TableCell className="text-right tabular-nums">{money(r.totalRevenue)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertOctagon className="h-4 w-4 text-rose-500" /> Stuck in stage
            </CardTitle>
          </CardHeader>
          <CardContent>
            {stagnant.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing stuck — leads are moving through stages.</p>
            ) : (
              <ul className="divide-y divide-border">
                {stagnant.slice(0, 6).map((l) => (
                  <li key={l.id} className="flex items-center justify-between py-2 text-sm">
                    <span className="truncate capitalize">{l.name || "Unnamed"} <span className="text-muted-foreground">· {l.status}</span></span>
                    <Badge variant="outline">{l.daysStagnant}d stuck</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Customer LTV + channel mix */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Crown className="h-4 w-4 text-yellow-500" /> Customer LTV
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <Stat label="Avg LTV" value={money(ltv.avgCustomerLtv)} />
              <Stat label="Repeat rate" value={`${ltv.repeatRatePercentage.toFixed(0)}%`} sub={`${ltv.repeatCustomerCount} repeat`} />
              <Stat label="Customers" value={String(ltv.totalUniqueCustomers)} />
            </div>
            {ltv.topVipCustomers.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Top customers</p>
                {ltv.topVipCustomers.slice(0, 4).map((v, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span className="truncate">{v.clientName}</span>
                    <span className="text-muted-foreground tabular-nums">{money(v.totalLtv)} · {v.totalWonDeals} deals</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Radio className="h-4 w-4 text-cyan-500" /> Channel mix
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Stat label="Top channel" value={channels.topChannel || "—"} sub={`${channels.totalTouchpoints} touchpoints`} />
            {channels.distribution.map((c) => (
              <div key={c.channel} className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="capitalize">{c.channel}</span>
                  <span className="text-muted-foreground tabular-nums">{c.count} ({c.percentage.toFixed(0)}%)</span>
                </div>
                <div className="h-1.5 rounded-full bg-muted">
                  <div className="h-1.5 rounded-full bg-cyan-500" style={{ width: `${Math.min(100, c.percentage)}%` }} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Cohorts */}
      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Layers3 className="h-4 w-4 text-violet-500" /> Monthly cohorts
          </CardTitle>
        </CardHeader>
        <CardContent>
          {cohorts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No cohort data yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cohort</TableHead>
                  <TableHead className="text-right">Leads</TableHead>
                  <TableHead className="text-right">Won</TableHead>
                  <TableHead className="text-right">Conversion</TableHead>
                  <TableHead className="text-right">Cancellation</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cohorts.map((c) => (
                  <TableRow key={c.cohortMonth}>
                    <TableCell>{c.cohortMonth}</TableCell>
                    <TableCell className="text-right tabular-nums">{c.totalLeads}</TableCell>
                    <TableCell className="text-right tabular-nums">{c.wonCount}</TableCell>
                    <TableCell className="text-right tabular-nums">{c.conversionRate.toFixed(0)}%</TableCell>
                    <TableCell className="text-right tabular-nums">{c.churnRate.toFixed(0)}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Geography + daily activity */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <MapPin className="h-4 w-4 text-emerald-500" /> Leads by location
            </CardTitle>
          </CardHeader>
          <CardContent>
            {geo.length === 0 ? (
              <p className="text-sm text-muted-foreground">No location data yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Location</TableHead>
                    <TableHead className="text-right">Leads</TableHead>
                    <TableHead className="text-right">Win %</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {geo.slice(0, 8).map((g) => (
                    <TableRow key={g.locationName}>
                      <TableCell>{g.locationName}</TableCell>
                      <TableCell className="text-right tabular-nums">{g.totalLeads}</TableCell>
                      <TableCell className="text-right tabular-nums">{g.winRatePercentage.toFixed(0)}%</TableCell>
                      <TableCell className="text-right tabular-nums">{money(g.totalRevenue)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="h-4 w-4 text-sky-500" /> Activity today
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Stat label="Total activities" value={String(digest.totalActivities)} sub={digest.date} />
            {digest.repSummaries.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">By rep</p>
                {digest.repSummaries.slice(0, 6).map((r) => (
                  <div key={r.userId} className="flex items-center justify-between text-sm">
                    <span className="truncate">{r.userName}</span>
                    <span className="text-muted-foreground tabular-nums">{r.totalActivities}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Source ROI */}
      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Network className="h-4 w-4 text-violet-500" /> Lead source ROI
          </CardTitle>
        </CardHeader>
        <CardContent>
          {sourceRoi.length === 0 ? (
            <p className="text-sm text-muted-foreground">No source data yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Source</TableHead>
                  <TableHead className="text-right">Leads</TableHead>
                  <TableHead className="text-right">Won</TableHead>
                  <TableHead className="text-right">Win rate</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">Avg deal</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sourceRoi.map((s) => (
                  <TableRow key={s.sourceId ?? s.sourceName}>
                    <TableCell>
                      {s.sourceName}
                      <div className="text-xs text-muted-foreground">{s.sourceType}</div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{s.totalLeads}</TableCell>
                    <TableCell className="text-right tabular-nums">{s.wonLeads}</TableCell>
                    <TableCell className="text-right tabular-nums">{s.winRatePercentage.toFixed(0)}%</TableCell>
                    <TableCell className="text-right tabular-nums">{money(s.totalRevenue)}</TableCell>
                    <TableCell className="text-right tabular-nums">{money(s.avgDealValue)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Rep workload & capacity */}
      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Gauge className="h-4 w-4 text-primary" /> Rep workload &amp; capacity</CardTitle>
        </CardHeader>
        <CardContent>
          {capacities.length === 0 ? (
            <p className="text-sm text-muted-foreground">No active reps to show.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Rep</TableHead>
                  <TableHead className="text-right">Active leads</TableHead>
                  <TableHead className="text-right">Capacity</TableHead>
                  <TableHead className="text-right">Remaining</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {capacities.map((r) => (
                  <TableRow key={r.userId}>
                    <TableCell>{r.email}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.activeLeadsCount}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.maxCapacity}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      <span className={r.isAvailable ? "text-emerald-500" : "text-rose-500"}>{r.capacityRemaining}</span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Overdue follow-up escalations */}
      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><AlertOctagon className="h-4 w-4 text-rose-500" /> Overdue follow-ups ({overdue.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {overdue.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing overdue — every scheduled follow-up is on track.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Lead</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead className="text-right">Hours overdue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {overdue.slice(0, 25).map((o) => (
                  <TableRow key={o.id}>
                    <TableCell>
                      <a href={`/leads/${o.leadId}`} className="hover:underline">{o.leadName}</a>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={
                        o.severity === "critical" ? "text-rose-500" : o.severity === "high" ? "text-amber-500" : "text-muted-foreground"
                      }>{o.severity}</Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{Math.round(o.hoursOverdue)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

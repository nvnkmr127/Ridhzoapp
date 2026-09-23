import { describe, expect, it } from "vitest";
import { RevenueForecastService } from "./revenueForecastService";
import { WinLossAnalyticsService } from "./winLossAnalyticsService";
import { SourceRoiAnalyticsService } from "./sourceRoiAnalyticsService";
import { EngagementHealthService } from "./engagementHealthService";
import { LeadQualificationMatrixService } from "./leadQualificationMatrixService";
import { PipelineAgingService } from "./pipelineAgingService";
import { StageStagnationService } from "./stageStagnationService";
import { LeadCohortAnalyticsService } from "./leadCohortAnalyticsService";
import { CustomerLtvAnalyticsService } from "./customerLtvAnalyticsService";
import { LeadGeoAnalyticsService } from "./leadGeoAnalyticsService";
import { SlaAnalyticsService } from "./slaAnalyticsService";
import { AnalyticsLeadRecord } from "./analyticsCoordinator";

describe("AnalyticsCoordinator Preloaded Leads Integration", () => {
  const mockDate = new Date("2026-09-01T10:00:00Z");
  const recentDate = new Date("2026-09-20T10:00:00Z");

  const sampleLeads: AnalyticsLeadRecord[] = [
    {
      id: "lead-1",
      name: "Acme Corp",
      phone: "+1234567890",
      email: "contact@acme.com",
      company: "Acme",
      status: "won",
      expectedValue: "10000",
      lostReason: null,
      sourceId: "source-1",
      ownerId: "user-1",
      stageId: "stage-1",
      customData: { city: "New York" },
      createdAt: mockDate,
      updatedAt: recentDate,
      lastContactedAt: recentDate,
      nextFollowUpAt: null,
    },
    {
      id: "lead-2",
      name: "Beta LLC",
      phone: "+1987654321",
      email: "info@beta.com",
      company: "Beta",
      status: "active",
      expectedValue: "5000",
      lostReason: null,
      sourceId: "source-1",
      ownerId: "user-1",
      stageId: "stage-1",
      customData: { city: "San Francisco" },
      createdAt: mockDate,
      updatedAt: recentDate,
      lastContactedAt: recentDate,
      nextFollowUpAt: new Date("2026-09-25T10:00:00Z"),
    },
    {
      id: "lead-3",
      name: "Gamma Inc",
      phone: "+1122334455",
      email: "gamma@gamma.com",
      company: "Gamma",
      status: "lost",
      expectedValue: "2000",
      lostReason: "budget",
      sourceId: null,
      ownerId: "user-2",
      stageId: "stage-2",
      customData: {},
      createdAt: mockDate,
      updatedAt: mockDate,
      lastContactedAt: null,
      nextFollowUpAt: null,
    },
  ];

  it("should calculate revenue forecast from preloaded leads without querying DB", async () => {
    const forecast = await RevenueForecastService.getRevenueForecast("test-org", sampleLeads);
    expect(forecast.unweightedTotalValue).toBe(17000);
    expect(forecast.wonRevenue).toBe(10000);
    expect(forecast.weightedProjectedRevenue).toBe(12500); // 10000 + (5000 * 0.5)
  });

  it("should calculate win/loss analytics from preloaded leads", async () => {
    const winLoss = await WinLossAnalyticsService.getWinLossAnalytics("test-org", sampleLeads);
    expect(winLoss.totalClosedLeads).toBe(2); // won + lost
    expect(winLoss.wonCount).toBe(1);
    expect(winLoss.lostCount).toBe(1);
    expect(winLoss.winRatePercentage).toBe(50);
  });

  it("should evaluate engagement health from preloaded leads", async () => {
    const health = await EngagementHealthService.getEngagementHealthBreakdown("test-org", sampleLeads);
    expect(health.totalActiveLeads).toBe(1); // 1 active (lead-2)
  });

  it("should evaluate aging matrix from preloaded leads", async () => {
    const aging = await PipelineAgingService.getPipelineAgingMatrix("test-org", sampleLeads);
    expect(aging.totalActiveLeads).toBe(1);
  });

  it("should evaluate customer LTV from preloaded leads", async () => {
    const ltv = await CustomerLtvAnalyticsService.getLtvAnalytics("test-org", sampleLeads);
    expect(ltv.totalUniqueCustomers).toBe(1);
    expect(ltv.avgCustomerLtv).toBe(10000);
  });

  it("should evaluate SLA metrics from preloaded leads", async () => {
    const sla = await SlaAnalyticsService.getSlaMetrics("test-org", 15, sampleLeads);
    expect(sla.totalLeads).toBe(3);
    expect(sla.contactedLeads).toBe(2);
    expect(sla.uncontactedLeads).toBe(1);
  });
});

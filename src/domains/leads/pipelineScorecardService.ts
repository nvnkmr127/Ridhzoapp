import { EngagementHealthService } from "@/domains/leads/engagementHealthService";
import { SlaAnalyticsService } from "@/domains/leads/slaAnalyticsService";
import { StageStagnationService } from "@/domains/leads/stageStagnationService";
import { EngagementVelocityService } from "@/domains/leads/engagementVelocityService";

export interface PipelineScorecard {
  overallScore: number;
  grade: "A" | "B" | "C" | "D";
  slaScore: number;
  healthScore: number;
  stagnationScore: number;
  velocityScore: number;
  recommendations: string[];
}

export interface ScorecardInputData {
  health?: { totalActiveLeads: number; healthScorePercentage: number };
  sla?: { complianceRatePercentage: number };
  stagnantLeads?: { id: string }[];
  velocity?: { avgWeeklyTouchpoints: number };
}

export class PipelineScorecardService {
  /**
   * Computes multi-axis organization pipeline health scorecard (0-100) and letter grade.
   */
  static async getPipelineScorecard(
    organizationId: string,
    precomputed?: ScorecardInputData
  ): Promise<PipelineScorecard> {
    const [health, sla, stagnantLeads, velocity] = await Promise.all([
      precomputed?.health ?? EngagementHealthService.getEngagementHealthBreakdown(organizationId),
      precomputed?.sla ?? SlaAnalyticsService.getSlaMetrics(organizationId),
      precomputed?.stagnantLeads ?? StageStagnationService.getStagnantLeads(organizationId, 10),
      precomputed?.velocity ?? EngagementVelocityService.getEngagementVelocity(organizationId),
    ]);

    const slaScore = sla.complianceRatePercentage;
    const healthScore = health.healthScorePercentage;

    const totalActive = health.totalActiveLeads;
    const stagnantCount = stagnantLeads.length;
    const stagnationScore =
      totalActive > 0 ? Math.round(Math.max(0, 1 - stagnantCount / totalActive) * 100) : 100;

    const velocityScore = Math.min(100, Math.round(velocity.avgWeeklyTouchpoints * 25));

    const weightedScore =
      slaScore * 0.3 + healthScore * 0.3 + stagnationScore * 0.2 + velocityScore * 0.2;
    const overallScore = Math.round(weightedScore * 10) / 10;

    let grade: "A" | "B" | "C" | "D" = "D";
    if (overallScore >= 85) grade = "A";
    else if (overallScore >= 70) grade = "B";
    else if (overallScore >= 55) grade = "C";

    const recommendations: string[] = [];
    if (slaScore < 80) {
      recommendations.push("Improve first contact speed: SLA compliance is below 80%.");
    }
    if (healthScore < 75) {
      recommendations.push("Re-engage cold leads: Engagement health is below 75%.");
    }
    if (stagnantCount > 0) {
      recommendations.push(`Clear pipeline bottlenecks: ${stagnantCount} active leads are stagnant.`);
    }
    if (velocityScore < 50) {
      recommendations.push("Increase rep touchpoint frequency: Average weekly activities per lead is low.");
    }
    if (recommendations.length === 0) {
      recommendations.push("Pipeline performance is optimal across all key operational metrics.");
    }

    return {
      overallScore,
      grade,
      slaScore,
      healthScore,
      stagnationScore,
      velocityScore,
      recommendations,
    };
  }
}

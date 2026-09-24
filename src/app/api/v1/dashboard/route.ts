import { NextRequest, NextResponse } from "next/server";
import { authorizeApiRequest } from "@/lib/apiAuth";
import { AnalyticsService, AnalyticsFilters } from "@/lib/analytics/service";
import { hasPermissionForRoleId } from "@/lib/rbac";

// Dashboard: headline metrics + follow-up counts + pipeline breakdown. Org-wide for API keys and
// admins; a rep's mobile token sees only their own leads (same rule as the web app).
export async function GET(req: NextRequest) {
  const auth = await authorizeApiRequest(req);
  if ("error" in auth) return auth.error;

  const ownOnly = !!auth.userId && !(await hasPermissionForRoleId(auth.roleId ?? null, "settings.manage"));
  const filters: AnalyticsFilters = { organizationId: auth.organizationId, ownerId: ownOnly ? auth.userId : undefined };
  const [leadMetrics, followUpMetrics, pipeline] = await Promise.all([
    AnalyticsService.getLeadMetrics(filters),
    AnalyticsService.getFollowUpMetrics(filters),
    AnalyticsService.getPipelineDistribution(filters),
  ]);

  return NextResponse.json({ data: { leadMetrics, followUpMetrics, pipeline } });
}

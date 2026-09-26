import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { organizations, users } from "@/db/schema";
import { authorizeApiRequest } from "@/lib/apiAuth";
import { permissionsForRoleId } from "@/lib/rbac";
import { aiEnabled } from "@/lib/ai/client";
import { PlanService } from "@/domains/billing/planService";
import { DEFAULT_LOSS_REASONS, lossReasonsKey } from "@/lib/leads/lossReasons";

// The signed-in mobile user: profile, workspace, what their role allows, and the workspace's pick-lists.
export async function GET(req: NextRequest) {
  const auth = await authorizeApiRequest(req);
  if ("error" in auth) return auth.error;
  if (!auth.userId) return NextResponse.json({ error: "A user session is required" }, { status: 403 });

  const [[user], [org], permissions, credits, savedReasons] = await Promise.all([
    db
      .select({ id: users.id, email: users.email, phone: users.phone, firstName: users.firstName, lastName: users.lastName })
      .from(users)
      .where(eq(users.id, auth.userId))
      .limit(1),
    db
      .select({
        id: organizations.id,
        name: organizations.name,
        timezone: organizations.timezone,
        currency: organizations.currency,
        leadFieldConfig: organizations.leadFieldConfig,
      })
      .from(organizations)
      .where(eq(organizations.id, auth.organizationId))
      .limit(1),
    permissionsForRoleId(auth.roleId ?? null),
    PlanService.aiCredits(auth.organizationId),
    import("@/domains/platform/configService").then(({ PlatformConfigService }) =>
      PlatformConfigService.get<string[] | null>(lossReasonsKey(auth.organizationId), null),
    ),
  ]);
  if (!user || !org) return NextResponse.json({ error: "Invalid or missing credentials" }, { status: 401 });

  const { resolveLeadFieldConfig } = await import("@/lib/leads/fieldConfig");

  return NextResponse.json({
    data: {
      user: {
        id: user.id,
        email: user.email,
        phone: user.phone,
        name: [user.firstName, user.lastName].filter(Boolean).join(" ") || user.phone || user.email,
      },
      organization: {
        id: org.id,
        name: org.name,
        timezone: org.timezone,
        currency: org.currency,
        leadFieldConfig: resolveLeadFieldConfig(org.leadFieldConfig),
      },
      permissions,
      // Admins (settings.manage) see every lead; everyone else sees their own.
      canSeeAllLeads: permissions.includes("settings.manage"),
      lossReasons: savedReasons?.length ? savedReasons : DEFAULT_LOSS_REASONS,
      ai: { enabled: aiEnabled() && credits.max > 0, creditsUsed: credits.used, creditsMax: credits.max },
    },
  });
}

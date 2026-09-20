import { PlatformConfigService, type BroadcastConfig, shouldShowBroadcast } from "@/domains/platform/configService";
import { requireOrg } from "@/lib/rbac";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { AlertTriangle, Info, AlertCircle } from "lucide-react";

export async function SystemBroadcastBanner() {
  const broadcast = await PlatformConfigService.get<BroadcastConfig | null>("broadcast", null);
  if (!broadcast || !broadcast.active || !broadcast.message?.trim()) return null;

  let currentOrg: { id: string; plan: string } | null = null;
  try {
    const auth = await requireOrg();
    if (auth.organizationId) {
      const [org] = await db
        .select({ id: organizations.id, plan: organizations.plan })
        .from(organizations)
        .where(eq(organizations.id, auth.organizationId))
        .limit(1);
      if (org) {
        currentOrg = { id: org.id, plan: org.plan ?? "free" };
      }
    }
  } catch {
    // Unauthenticated or not inside an org
  }

  if (!shouldShowBroadcast(broadcast, currentOrg)) {
    return null;
  }

  const bg =
    broadcast.level === "destructive"
      ? "bg-destructive text-destructive-foreground"
      : broadcast.level === "warning"
      ? "bg-amber-500 text-black font-medium"
      : "bg-primary text-primary-foreground";

  return (
    <div className={`flex items-center justify-center gap-2 px-4 py-1.5 text-center text-xs sm:text-sm ${bg}`}>
      {broadcast.level === "destructive" ? (
        <AlertCircle className="h-4 w-4 shrink-0" />
      ) : broadcast.level === "warning" ? (
        <AlertTriangle className="h-4 w-4 shrink-0" />
      ) : (
        <Info className="h-4 w-4 shrink-0" />
      )}
      <span>{broadcast.message}</span>
    </div>
  );
}

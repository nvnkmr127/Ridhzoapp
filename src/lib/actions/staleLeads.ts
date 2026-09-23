"use server";

import { requireOrg } from "@/lib/rbac";
import { revalidatePath } from "next/cache";
import { StaleLeadReclamationService } from "@/domains/leads/staleLeadReclamationService";

// Bulk-escalates every stale lead to High priority and logs a re-engagement note.
// Reuses the tested reclaim logic; the page renders the read-only detection.
export async function reclaimStaleLeadsAction(daysInactiveThreshold = 14) {
  const [{ organizationId, userId }, { hasPermission }] = await Promise.all([
    requireOrg(),
    import("@/lib/rbac"),
  ]);
  const isAdmin = await hasPermission("settings.manage");
  const res = await StaleLeadReclamationService.reclaimStaleLeads(
    organizationId,
    daysInactiveThreshold,
    userId,
    isAdmin ? undefined : userId
  );
  revalidatePath("/leads/cold");
  return res;
}

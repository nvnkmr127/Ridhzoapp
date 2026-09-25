"use server";

import { requireOrg, requirePermission } from "@/lib/rbac";
import { TeamService } from "@/domains/teams/service";
import { AuditService } from "@/domains/audit/service";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ok, fail, actionFail } from "@/lib/actions/result";

export async function listTeamsAction() {
  const { organizationId } = await requireOrg();
  return TeamService.list(organizationId);
}

const teamSchema = z.object({ name: z.string().trim().min(1, "Please enter a team name.").max(255) });

export async function createTeamAction(input: z.infer<typeof teamSchema>) {
  const { organizationId, userId } = await requirePermission("users.manage");
  const parsed = teamSchema.safeParse(input);
  if (!parsed.success) return fail("VALIDATION", parsed.error.issues[0]?.message ?? "Please enter a team name.");
  try {
    const team = await TeamService.create(organizationId, parsed.data.name);
    await AuditService.log({ organizationId, userId, action: "team.create", entityType: "team", entityId: team.id, metadata: { name: team.name } });
    revalidatePath("/settings/users");
    return ok(team);
  } catch (e) {
    return actionFail(e);
  }
}

export async function renameTeamAction(id: string, input: z.infer<typeof teamSchema>) {
  const { organizationId, userId } = await requirePermission("users.manage");
  const parsed = teamSchema.safeParse(input);
  if (!parsed.success) return fail("VALIDATION", parsed.error.issues[0]?.message ?? "Please enter a team name.");
  try {
    const team = await TeamService.rename(organizationId, id, parsed.data.name);
    if (!team) return fail("NOT_FOUND", "That team no longer exists.");
    await AuditService.log({ organizationId, userId, action: "team.rename", entityType: "team", entityId: id, metadata: { name: team.name } });
    revalidatePath("/settings/users");
    return ok(team);
  } catch (e) {
    return actionFail(e);
  }
}

export async function deleteTeamAction(id: string) {
  const { organizationId, userId } = await requirePermission("users.manage");
  try {
    const removed = await TeamService.remove(organizationId, id);
    if (!removed) return fail("NOT_FOUND", "That team no longer exists.");
    await AuditService.log({ organizationId, userId, action: "team.delete", entityType: "team", entityId: id, metadata: { name: removed.name } });
    revalidatePath("/settings/users");
    return ok({ id });
  } catch (e) {
    return actionFail(e);
  }
}

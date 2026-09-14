import { db } from "@/db";
import { leads, assignmentRules } from "@/db/schema/leads";
import { users, teams } from "@/db/schema/users";
import { eq, and, desc, inArray } from "drizzle-orm";
import { eventBus } from "@/lib/events/emitter";

// Pure round-robin step: index of the user to assign next given the last one.
// Wraps around, and starts from 0 when there's no last user or it's no longer on the team.
export function nextRoundRobinIndex(userIds: string[], lastAssignedUserId: string | null): number {
  if (userIds.length === 0) return -1;
  if (!lastAssignedUserId) return 0;
  const i = userIds.indexOf(lastAssignedUserId);
  return i === -1 ? 0 : (i + 1) % userIds.length;
}

// Narrow the rotation to reps that still have capacity. Falls back to the whole team when
// everyone is maxed out (never drop a lead) or when capacity is unknown (availableIds === null).
export function capacityAwarePool(teamIds: string[], availableIds: Set<string> | null): string[] {
  if (!availableIds) return teamIds;
  const free = teamIds.filter((id) => availableIds.has(id));
  return free.length > 0 ? free : teamIds;
}

export interface AssignLeadOptions {
  leadId: string;
  ownerId: string | null;
  teamId?: string | null;
  assignedById?: string;
  organizationId?: string;
  source?: string; // 'automation' → don't let this assignment re-trigger automations
}

export interface BulkAssignLeadOptions {
  leadIds: string[];
  ownerId: string | null;
  teamId?: string | null;
  assignedById?: string;
  organizationId?: string;
}

export class AssignmentService {
  /**
   * Helper: validates that target user is active and belongs to expected organization.
   */
  private static async validateUserAssignment(ownerId: string, expectedOrgId?: string) {
    const [user] = await db
      .select({ id: users.id, organizationId: users.organizationId, isActive: users.isActive })
      .from(users)
      .where(eq(users.id, ownerId))
      .limit(1);

    if (!user) {
      throw new Error(`Target user ${ownerId} does not exist`);
    }

    if (!user.isActive) {
      throw new Error(`Target user ${ownerId} is inactive and cannot receive lead assignments`);
    }

    if (expectedOrgId && user.organizationId && user.organizationId !== expectedOrgId) {
      throw new Error(`Tenant isolation violation: User ${ownerId} does not belong to organization ${expectedOrgId}`);
    }

    return user;
  }

  /**
   * Helper: validates team assignment.
   */
  private static async validateTeamAssignment(teamId: string, expectedOrgId?: string) {
    const [team] = await db
      .select({ id: teams.id })
      .from(teams)
      .where(eq(teams.id, teamId))
      .limit(1);

    if (!team) {
      throw new Error(`Target team ${teamId} does not exist`);
    }

    const teamUsers = await db
      .select({ id: users.id, organizationId: users.organizationId })
      .from(users)
      .where(and(eq(users.teamId, teamId), eq(users.isActive, true)));

    if (teamUsers.length === 0) {
      throw new Error(`Target team ${teamId} has no active eligible users for assignment`);
    }

    if (expectedOrgId) {
      const invalidUsers = teamUsers.filter(u => u.organizationId && u.organizationId !== expectedOrgId);
      if (invalidUsers.length > 0) {
        throw new Error(`Tenant isolation violation: Team ${teamId} contains users outside organization ${expectedOrgId}`);
      }
    }
  }

  /**
   * Executes automatic assignment for a lead based on its source.
   * If a rule exists, evaluates it (direct or round-robin).
   */
  static async executeAutomaticAssignment(leadId: string, sourceId: string | null, organizationId?: string) {
    if (!sourceId) return;

    // Fetch the lead to verify organization context if not provided
    let targetOrgId = organizationId;
    if (!targetOrgId) {
      const [lead] = await db.select({ organizationId: leads.organizationId }).from(leads).where(eq(leads.id, leadId)).limit(1);
      targetOrgId = lead?.organizationId;
    }

    // Capacity snapshot (advisory read, taken outside the rule lock): reps at max active-lead
    // capacity are dropped from the round-robin so overloaded reps stop receiving new leads.
    // ponytail: uses the service default cap (25); add a column on assignment_rules if per-team
    // limits are ever needed.
    let availableIds: Set<string> | null = null;
    if (targetOrgId) {
      const { CapacityAssignmentService } = await import("@/domains/leads/capacityAssignmentService");
      const caps = await CapacityAssignmentService.getRepCapacities(targetOrgId);
      availableIds = new Set(caps.filter((c) => c.isAvailable).map((c) => c.userId));
    }

    // Resolve the target inside a transaction that LOCKS the rule row (FOR UPDATE), so two
    // leads ingested in parallel can't read the same lastAssignedUserId and land on the same
    // rep. Concurrent workers serialize on this row and the rotation advances correctly.
    const target = await db.transaction(async (tx) => {
      const [rule] = await tx
        .select()
        .from(assignmentRules)
        .where(eq(assignmentRules.sourceId, sourceId))
        .orderBy(desc(assignmentRules.priority))
        .limit(1)
        .for("update");

      if (!rule) return null;

      // Direct assignment: fixed user and/or team on the rule.
      if (rule.type !== "source_round_robin" || !rule.teamId) {
        return { userId: rule.userId, teamId: rule.teamId };
      }

      // Round-robin across active team members within tenant, ordered for deterministic rotation.
      const conditions = [eq(users.teamId, rule.teamId), eq(users.isActive, true)];
      if (targetOrgId) {
        conditions.push(eq(users.organizationId, targetOrgId));
      }

      const teamUsers = await tx
        .select({ id: users.id })
        .from(users)
        .where(and(...conditions))
        .orderBy(users.id);

      // Rotate only over reps with remaining capacity (falls back to the whole team if all maxed).
      const pool = capacityAwarePool(teamUsers.map((u) => u.id), availableIds);
      const idx = nextRoundRobinIndex(pool, rule.lastAssignedUserId);
      if (idx === -1) return { userId: null, teamId: rule.teamId };

      const chosen = pool[idx];
      await tx.update(assignmentRules)
        .set({ lastAssignedUserId: chosen })
        .where(eq(assignmentRules.id, rule.id));

      return { userId: chosen, teamId: rule.teamId };
    });

    if (target && (target.userId || target.teamId)) {
      await this.assignLead({
        leadId,
        ownerId: target.userId ?? null,
        teamId: target.teamId ?? null,
        assignedById: "system",
        organizationId: targetOrgId,
      });
    }
  }

  /**
   * Manually assign or reassign a lead to a user/team.
   * Can be called with positional arguments (backwards compatibility) or options object.
   */
  static async assignLead(
    leadIdOrOptions: string | AssignLeadOptions,
    ownerIdArg?: string | null,
    teamIdArg?: string | null,
    assignedByIdArg?: string,
    organizationIdArg?: string,
  ) {
    let leadId: string;
    let ownerId: string | null;
    // undefined = "leave the lead's team untouched"; null = "explicitly clear the team".
    // Owner-only reassignment must NOT wipe an existing team, so team is only written when provided.
    let teamId: string | null | undefined;
    let assignedById: string;
    let organizationId: string | undefined;
    let source: string | undefined;

    if (typeof leadIdOrOptions === "object") {
      leadId = leadIdOrOptions.leadId;
      ownerId = leadIdOrOptions.ownerId;
      teamId = leadIdOrOptions.teamId;
      assignedById = leadIdOrOptions.assignedById ?? "system";
      organizationId = leadIdOrOptions.organizationId;
      source = leadIdOrOptions.source;
    } else {
      leadId = leadIdOrOptions;
      ownerId = ownerIdArg ?? null;
      teamId = teamIdArg;
      assignedById = assignedByIdArg ?? "system";
      organizationId = organizationIdArg;
    }

    // 1. Fetch Lead and verify tenant organization
    const [lead] = await db
      .select({ id: leads.id, organizationId: leads.organizationId })
      .from(leads)
      .where(eq(leads.id, leadId))
      .limit(1);

    if (!lead) {
      throw new Error(`Lead ${leadId} does not exist`);
    }

    const effectiveOrgId = organizationId ?? lead.organizationId;
    if (organizationId && lead.organizationId !== organizationId) {
      throw new Error(`Tenant isolation violation: Lead ${leadId} does not belong to organization ${organizationId}`);
    }

    // 2. Validate target owner if specified
    if (ownerId) {
      await this.validateUserAssignment(ownerId, effectiveOrgId);
    }

    // 3. Validate target team if specified
    if (teamId) {
      await this.validateTeamAssignment(teamId, effectiveOrgId);
    }

    // 4. Update Lead record — only overwrite team when a team was explicitly supplied.
    const whereCondition = organizationId
      ? and(eq(leads.id, leadId), eq(leads.organizationId, organizationId))
      : eq(leads.id, leadId);

    const setData: Record<string, unknown> = { ownerId, updatedAt: new Date() };
    if (teamId !== undefined) setData.teamId = teamId;

    const [updatedLead] = await db.update(leads)
      .set(setData)
      .where(whereCondition)
      .returning();

    // 5. Emit canonical assignment event
    if (updatedLead) {
      eventBus.emit('lead.assigned', {
        leadId,
        ownerId: ownerId || undefined,
        teamId: updatedLead.teamId,
        assignedById,
        source,
      });
    }

    return updatedLead;
  }

  /**
   * Bulk assign multiple leads.
   */
  static async bulkAssignLeads(
    leadIdsOrOptions: string[] | BulkAssignLeadOptions,
    ownerIdArg?: string | null,
    teamIdArg?: string | null,
    assignedByIdArg?: string,
    organizationIdArg?: string,
  ) {
    let leadIds: string[];
    let ownerId: string | null;
    let teamId: string | null;
    let assignedById: string;
    let organizationId: string | undefined;

    if (!Array.isArray(leadIdsOrOptions) && typeof leadIdsOrOptions === "object") {
      leadIds = leadIdsOrOptions.leadIds;
      ownerId = leadIdsOrOptions.ownerId;
      teamId = leadIdsOrOptions.teamId ?? null;
      assignedById = leadIdsOrOptions.assignedById ?? "system";
      organizationId = leadIdsOrOptions.organizationId;
    } else {
      leadIds = leadIdsOrOptions as string[];
      ownerId = ownerIdArg ?? null;
      teamId = teamIdArg ?? null;
      assignedById = assignedByIdArg ?? "system";
      organizationId = organizationIdArg;
    }

    if (leadIds.length === 0) return [];

    // 1. Verify all leads exist and match tenant organization if provided
    const targetLeads = await db
      .select({ id: leads.id, organizationId: leads.organizationId })
      .from(leads)
      .where(inArray(leads.id, leadIds));

    if (targetLeads.length !== leadIds.length) {
      throw new Error(`One or more leads in bulk request do not exist`);
    }

    const effectiveOrgId = organizationId ?? targetLeads[0]?.organizationId;

    if (organizationId) {
      const invalidLeads = targetLeads.filter(l => l.organizationId !== organizationId);
      if (invalidLeads.length > 0) {
        throw new Error(`Tenant isolation violation: Bulk assignment request contains leads outside organization ${organizationId}`);
      }
    }

    // 2. Validate target user / team
    if (ownerId) {
      await this.validateUserAssignment(ownerId, effectiveOrgId);
    }
    if (teamId) {
      await this.validateTeamAssignment(teamId, effectiveOrgId);
    }

    // 3. Batch transactional update
    const batchUpdates: any[] = [];
    await db.transaction(async (tx) => {
      for (const leadId of leadIds) {
        const whereCond = organizationId
          ? and(eq(leads.id, leadId), eq(leads.organizationId, organizationId))
          : eq(leads.id, leadId);

        const [updatedLead] = await tx.update(leads)
          .set({ ownerId, teamId, updatedAt: new Date() })
          .where(whereCond)
          .returning();

        if (updatedLead) {
          batchUpdates.push(updatedLead);
        }
      }
    });

    // 4. Emit single canonical event per assigned lead
    for (const lead of batchUpdates) {
      eventBus.emit('lead.assigned', {
        leadId: lead.id,
        ownerId: ownerId || undefined,
        teamId,
        assignedById,
      });
    }

    return batchUpdates;
  }
}

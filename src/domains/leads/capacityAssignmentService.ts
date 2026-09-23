import { db } from "@/db";
import { leads, users } from "@/db/schema";
import { and, eq, inArray, count } from "drizzle-orm";
import { AssignmentService } from "@/domains/leads/assignmentService";

export interface RepCapacity {
  userId: string;
  email: string;
  activeLeadsCount: number;
  maxCapacity: number;
  capacityRemaining: number;
  isAvailable: boolean;
}

export class CapacityAssignmentService {
  /**
   * Calculates active lead workload and remaining capacity for all active reps in an organization.
   */
  static async getRepCapacities(
    organizationId: string,
    defaultMaxCapacity: number = 25,
    preloadedUsers?: { id: string; email: string }[]
  ): Promise<RepCapacity[]> {
    const orgUsers = preloadedUsers ?? await db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(and(eq(users.organizationId, organizationId), eq(users.isActive, true)));

    if (!Array.isArray(orgUsers) || orgUsers.length === 0) return [];

    const userIds = orgUsers.map((u) => u.id);

    // Count active leads per user (status IN ('new', 'active'))
    const activeLeadCounts = await db
      .select({
        ownerId: leads.ownerId,
        count: count(),
      })
      .from(leads)
      .where(
        and(
          eq(leads.organizationId, organizationId),
          inArray(leads.status, ["new", "active"]),
          inArray(leads.ownerId, userIds)
        )
      )
      .groupBy(leads.ownerId);

    const countMap: Record<string, number> = {};
    for (const row of activeLeadCounts) {
      if (row.ownerId) {
        countMap[row.ownerId] = Number(row.count);
      }
    }

    return orgUsers.map((u) => {
      const activeCount = countMap[u.id] ?? 0;
      const remaining = Math.max(0, defaultMaxCapacity - activeCount);
      return {
        userId: u.id,
        email: u.email,
        activeLeadsCount: activeCount,
        maxCapacity: defaultMaxCapacity,
        capacityRemaining: remaining,
        isAvailable: remaining > 0,
      };
    });
  }

  /**
   * Assigns a lead to the sales rep with the highest available capacity.
   */
  static async assignLeadWithCapacity(input: {
    leadId: string;
    organizationId: string;
    assignedById?: string;
    maxCapacity?: number;
  }) {
    const capacities = await this.getRepCapacities(input.organizationId, input.maxCapacity ?? 25);
    const availableReps = capacities.filter((r) => r.isAvailable);

    if (availableReps.length === 0) {
      throw new Error("All sales reps are currently at maximum lead capacity");
    }

    // Pick rep with highest remaining capacity
    availableReps.sort((a, b) => b.capacityRemaining - a.capacityRemaining);
    const targetRep = availableReps[0];

    const lead = await AssignmentService.assignLead({
      leadId: input.leadId,
      ownerId: targetRep.userId,
      teamId: null,
      assignedById: input.assignedById,
      organizationId: input.organizationId,
    });

    return { lead, assignedToRep: targetRep };
  }
}

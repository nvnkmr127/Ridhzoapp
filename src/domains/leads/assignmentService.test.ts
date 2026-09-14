import { describe, it, expect, vi, beforeEach } from "vitest";
import { AssignmentService, nextRoundRobinIndex, capacityAwarePool } from "./assignmentService";
import { LeadService } from "./service";
import { eventBus } from "@/lib/events/emitter";

// Mock DB
vi.mock("@/db", () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([]),
    transaction: vi.fn(async (cb: any) => cb({
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      for: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{ id: 'lead-updated' }]),
          }),
        }),
      }),
      set: vi.fn().mockReturnThis(),
    })),
  },
}));

describe("AssignmentService & Round-Robin Logic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("nextRoundRobinIndex", () => {
    const users = ["a", "b", "c"];

    it("starts at 0 when no one has been assigned yet", () => {
      expect(nextRoundRobinIndex(users, null)).toBe(0);
    });

    it("advances to the next user", () => {
      expect(nextRoundRobinIndex(users, "a")).toBe(1);
      expect(nextRoundRobinIndex(users, "b")).toBe(2);
    });

    it("wraps around after the last user", () => {
      expect(nextRoundRobinIndex(users, "c")).toBe(0);
    });

    it("restarts at 0 when the last assignee left the team", () => {
      expect(nextRoundRobinIndex(users, "gone")).toBe(0);
    });

    it("returns -1 when there are no team members", () => {
      expect(nextRoundRobinIndex([], "a")).toBe(-1);
    });
  });

  describe("capacityAwarePool", () => {
    const team = ["a", "b", "c"];

    it("keeps only reps with remaining capacity", () => {
      expect(capacityAwarePool(team, new Set(["a", "c"]))).toEqual(["a", "c"]);
    });

    it("falls back to the whole team when everyone is maxed out (never drops a lead)", () => {
      expect(capacityAwarePool(team, new Set())).toEqual(team);
    });

    it("returns the whole team when capacity is unknown", () => {
      expect(capacityAwarePool(team, null)).toEqual(team);
    });
  });

  describe("AssignmentService Validation & Execution", () => {
    it("should successfully assign lead to active user in same organization", async () => {
      const { db } = await import("@/db");

      const mockLead = { id: "lead-1", organizationId: "org-1" };
      const mockUser = { id: "user-1", organizationId: "org-1", isActive: true };

      ((db as any).limit as any)
        .mockResolvedValueOnce([mockLead]) // lead lookup
        .mockResolvedValueOnce([mockUser]); // user lookup

      ((db as any).returning as any).mockResolvedValueOnce([{ id: "lead-1", ownerId: "user-1", organizationId: "org-1" }]);

      const emitSpy = vi.spyOn(eventBus, "emit");

      const result = await AssignmentService.assignLead({
        leadId: "lead-1",
        ownerId: "user-1",
        assignedById: "admin-1",
        organizationId: "org-1",
      });

      expect(result.ownerId).toBe("user-1");
      // teamId in the event reflects the lead's ACTUAL resulting team (owner-only assign no longer
      // forces it to null), so assert the meaningful fields without over-constraining team/source.
      expect(emitSpy).toHaveBeenCalledWith("lead.assigned", expect.objectContaining({
        leadId: "lead-1",
        ownerId: "user-1",
        assignedById: "admin-1",
      }));
    });

    it("should reject cross-tenant user assignment", async () => {
      const { db } = await import("@/db");

      const mockLead = { id: "lead-1", organizationId: "org-1" };
      const mockUserOtherOrg = { id: "user-other", organizationId: "org-other", isActive: true };

      ((db as any).limit as any)
        .mockResolvedValueOnce([mockLead])
        .mockResolvedValueOnce([mockUserOtherOrg]);

      await expect(AssignmentService.assignLead({
        leadId: "lead-1",
        ownerId: "user-other",
        organizationId: "org-1",
      })).rejects.toThrow("Tenant isolation violation");
    });

    it("should reject assignment to an inactive user", async () => {
      const { db } = await import("@/db");

      const mockLead = { id: "lead-1", organizationId: "org-1" };
      const mockInactiveUser = { id: "user-inactive", organizationId: "org-1", isActive: false };

      ((db as any).limit as any)
        .mockResolvedValueOnce([mockLead])
        .mockResolvedValueOnce([mockInactiveUser]);

      await expect(AssignmentService.assignLead({
        leadId: "lead-1",
        ownerId: "user-inactive",
        organizationId: "org-1",
      })).rejects.toThrow("inactive and cannot receive lead assignments");
    });

    it("should reject assignment to non-existent user", async () => {
      const { db } = await import("@/db");

      const mockLead = { id: "lead-1", organizationId: "org-1" };

      ((db as any).limit as any)
        .mockResolvedValueOnce([mockLead])
        .mockResolvedValueOnce([]); // user not found

      await expect(AssignmentService.assignLead({
        leadId: "lead-1",
        ownerId: "non-existent-user",
        organizationId: "org-1",
      })).rejects.toThrow("does not exist");
    });

    it("should reject team assignment when team has no active users", async () => {
      const { db } = await import("@/db");

      const mockLead = { id: "lead-1", organizationId: "org-1" };
      const mockTeam = { id: "team-empty" };

      ((db as any).limit as any)
        .mockResolvedValueOnce([mockLead]) // lead lookup
        .mockResolvedValueOnce([mockTeam]); // team lookup

      // team users query returns empty list
      ((db as any).where as any).mockImplementationOnce(() => ({
        limit: vi.fn().mockResolvedValue([mockLead]),
      })).mockImplementationOnce(() => ({
        limit: vi.fn().mockResolvedValue([mockTeam]),
      })).mockImplementationOnce(() => []);

      await expect(AssignmentService.assignLead({
        leadId: "lead-1",
        ownerId: null,
        teamId: "team-empty",
        organizationId: "org-1",
      })).rejects.toThrow("has no active eligible users for assignment");
    });

    it("should bulk assign leads cleanly within same organization", async () => {
      const { db } = await import("@/db");

      const mockLeads = [
        { id: "lead-10", organizationId: "org-1" },
        { id: "lead-20", organizationId: "org-1" },
      ];

      ((db as any).where as any).mockReturnValueOnce(mockLeads); // leads lookup
      vi.spyOn(AssignmentService as any, "validateUserAssignment").mockResolvedValueOnce({
        id: "user-1",
        organizationId: "org-1",
        isActive: true,
      });

      const emitSpy = vi.spyOn(eventBus, "emit");

      const results = await AssignmentService.bulkAssignLeads({
        leadIds: ["lead-10", "lead-20"],
        ownerId: "user-1",
        assignedById: "admin-1",
        organizationId: "org-1",
      });

      expect(results.length).toBe(2);
      expect(emitSpy).toHaveBeenCalledTimes(2);
    });

    it("should delegate LeadService.assignLead directly to AssignmentService", async () => {
      const assignSpy = vi.spyOn(AssignmentService, "assignLead").mockResolvedValueOnce({
        id: "lead-delegated",
        ownerId: "user-1",
      } as any);

      await LeadService.assignLead("lead-delegated", "user-1", "admin-1", "org-1");

      expect(assignSpy).toHaveBeenCalledWith({
        leadId: "lead-delegated",
        ownerId: "user-1",
        assignedById: "admin-1",
        organizationId: "org-1",
      });
    });
  });
});

import { describe, expect, it, vi } from "vitest";
import { CapacityAssignmentService } from "./capacityAssignmentService";
import { AssignmentService } from "@/domains/leads/assignmentService";

// Reports resolve custom statuses by category; these tests use the built-in five (no DB round trip).
vi.mock("./customStatusSchemaService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./customStatusSchemaService")>();
  const base = new Map(actual.DEFAULT_SYSTEM_STATUSES.map((s) => [s.key, s.category]));
  const keys = (...c: string[]) => [...base].filter(([, v]) => c.includes(v)).map(([k]) => k);
  return {
    ...actual,
    CustomStatusSchemaService: Object.assign(actual.CustomStatusSchemaService, {
      resolver: async () => ({ cat: (s: string | null | undefined) => base.get(s ?? "") ?? "open", openKeys: keys("open", "in_progress"), closedKeys: keys("won", "lost", "unqualified") }),
    }),
  };
});


vi.mock("@/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          groupBy: vi.fn().mockResolvedValue([{ ownerId: "user-1", count: 10 }]),
        })),
      })),
    })),
  },
}));

describe("CapacityAssignmentService", () => {
  it("should calculate remaining rep capacity correctly", async () => {
    const { db } = await import("@/db");
    (db.select as any).mockImplementationOnce(() => ({
      from: () => ({
        where: () => Promise.resolve([{ id: "user-1", email: "rep1@example.com" }]),
      }),
    }));
    (db.select as any).mockImplementationOnce(() => ({
      from: () => ({
        where: () => ({
          groupBy: () => Promise.resolve([{ ownerId: "user-1", count: 10 }]),
        }),
      }),
    }));

    const capacities = await CapacityAssignmentService.getRepCapacities("org-1", 25);

    expect(capacities.length).toBe(1);
    expect(capacities[0].activeLeadsCount).toBe(10);
    expect(capacities[0].capacityRemaining).toBe(15);
    expect(capacities[0].isAvailable).toBe(true);
  });

  it("should assign lead to rep with highest capacity", async () => {
    vi.spyOn(CapacityAssignmentService, "getRepCapacities").mockResolvedValue([
      { userId: "user-busy", email: "busy@example.com", activeLeadsCount: 20, maxCapacity: 25, capacityRemaining: 5, isAvailable: true },
      { userId: "user-free", email: "free@example.com", activeLeadsCount: 5, maxCapacity: 25, capacityRemaining: 20, isAvailable: true },
    ]);

    vi.spyOn(AssignmentService, "assignLead").mockResolvedValue({ id: "lead-1", ownerId: "user-free" } as any);

    const result = await CapacityAssignmentService.assignLeadWithCapacity({
      leadId: "lead-1",
      organizationId: "org-1",
    });

    expect(AssignmentService.assignLead).toHaveBeenCalledWith(
      expect.objectContaining({ ownerId: "user-free" })
    );
    expect(result.assignedToRep.userId).toBe("user-free");
  });
});

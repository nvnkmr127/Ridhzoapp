import { describe, expect, it, vi } from "vitest";
import { EngagementVelocityService } from "./engagementVelocityService";

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn().mockImplementation(() =>
          Promise.resolve([
            { id: "lead-accel", name: "Accelerating Lead", status: "active" },
            { id: "lead-decel", name: "Decelerating Lead", status: "active" },
          ])
        ),
      })),
    })),
  },
}));

describe("EngagementVelocityService", () => {
  it("should detect accelerating and decelerating lead engagement velocity ratios", async () => {
    const { db } = await import("@/db");
    // Mock Active Leads
    (db.select as any).mockImplementationOnce(() => ({
      from: () => ({
        where: () =>
          Promise.resolve([
            { id: "lead-accel", name: "Accelerating Lead", status: "active" },
            { id: "lead-decel", name: "Decelerating Lead", status: "active" },
          ]),
      }),
    }));

    // Mock Activities (0-7d vs 8-14d)
    const now = Date.now();
    const fourDaysAgo = new Date(now - 4 * 24 * 60 * 60 * 1000);
    const tenDaysAgo = new Date(now - 10 * 24 * 60 * 60 * 1000);

    (db.select as any).mockImplementationOnce(() => ({
      from: () => ({
        innerJoin: () => ({
          where: () =>
            Promise.resolve([
              { leadId: "lead-accel", createdAt: fourDaysAgo },
              { leadId: "lead-accel", createdAt: fourDaysAgo },
              { leadId: "lead-accel", createdAt: tenDaysAgo }, // 2 recent vs 1 previous => accelerating
              { leadId: "lead-decel", createdAt: tenDaysAgo },
              { leadId: "lead-decel", createdAt: tenDaysAgo }, // 0 recent vs 2 previous => decelerating
            ]),
        }),
      }),
    }));

    const velocity = await EngagementVelocityService.getEngagementVelocity("org-1");

    expect(velocity.totalActiveLeadsTracked).toBe(2);
    expect(velocity.acceleratingCount).toBe(1);
    expect(velocity.deceleratingCount).toBe(1);

    expect(velocity.acceleratingLeads[0].id).toBe("lead-accel");
    expect(velocity.acceleratingLeads[0].velocityRatio).toBe(2);

    expect(velocity.deceleratingLeads[0].id).toBe("lead-decel");
    expect(velocity.deceleratingLeads[0].velocityRatio).toBe(0);
  });
});

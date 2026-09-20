import { describe, it, expect, vi, beforeEach } from "vitest";
import { RevOpsService } from "./revops";
import { db } from "@/db";

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(),
  },
}));

vi.mock("./configService", () => ({
  PlatformConfigService: {
    get: vi.fn().mockResolvedValue({}),
    set: vi.fn().mockResolvedValue(undefined),
  },
}));

describe("RevOpsService.getLifecycleFunnel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("handles empty cohort gracefully", async () => {
    const groupByMock = vi.fn().mockResolvedValue([]);
    const whereMock = vi.fn().mockReturnValue({ groupBy: groupByMock });
    const leftJoinMock = vi.fn().mockReturnValue({ where: whereMock, groupBy: groupByMock });
    const fromMock = vi.fn().mockReturnValue({ leftJoin: leftJoinMock });
    vi.mocked(db.select).mockReturnValue({ from: fromMock } as any);

    const funnel = await RevOpsService.getLifecycleFunnel(30);

    expect(funnel.totalSignedUp).toBe(0);
    expect(funnel.totalActivated).toBe(0);
    expect(funnel.totalPaid).toBe(0);
    expect(funnel.totalChurned).toBe(0);
    expect(funnel.activationRate).toBe(0);
    expect(funnel.paidConversionRate).toBe(0);
    expect(funnel.churnRate).toBe(0);
    expect(funnel.stages).toHaveLength(4);
    expect(funnel.stages[0].count).toBe(0);
  });

  it("accurately categorizes tenants into lifecycle stages and computes rates", async () => {
    const mockRows = [
      {
        id: "org_1",
        plan: "free",
        planStatus: "active",
        suspendedAt: null,
        leadCount: 5,
      },
      {
        id: "org_2",
        plan: "pro",
        planStatus: "active",
        suspendedAt: null,
        leadCount: 12,
      },
      {
        id: "org_3",
        plan: "business",
        planStatus: "active",
        suspendedAt: null,
        leadCount: 0,
      },
      {
        id: "org_4",
        plan: "pro",
        planStatus: "cancelled",
        suspendedAt: new Date(),
        leadCount: 2,
      },
    ];

    const groupByMock = vi.fn().mockResolvedValue(mockRows);
    const whereMock = vi.fn().mockReturnValue({ groupBy: groupByMock });
    const leftJoinMock = vi.fn().mockReturnValue({ where: whereMock, groupBy: groupByMock });
    const fromMock = vi.fn().mockReturnValue({ leftJoin: leftJoinMock });
    vi.mocked(db.select).mockReturnValue({ from: fromMock } as any);

    const funnel = await RevOpsService.getLifecycleFunnel(30);

    expect(funnel.totalSignedUp).toBe(4);
    expect(funnel.totalActivated).toBe(3); // org_1, org_2, org_4
    expect(funnel.totalPaid).toBe(2); // org_2, org_3
    expect(funnel.totalChurned).toBe(1); // org_4
    expect(funnel.activationRate).toBe(75);
    expect(funnel.paidConversionRate).toBe(50);
    expect(funnel.churnRate).toBe(25);

    const [signupStage, activatedStage, paidStage, churnedStage] = funnel.stages;
    expect(signupStage.stage).toBe("signed_up");
    expect(signupStage.count).toBe(4);
    expect(signupStage.rate).toBe(100);

    expect(activatedStage.stage).toBe("activated");
    expect(activatedStage.count).toBe(3);
    expect(activatedStage.rate).toBe(75);
    expect(activatedStage.dropoffRate).toBe(25); // (4-3)/4 = 25%

    expect(paidStage.stage).toBe("paid");
    expect(paidStage.count).toBe(2);
    expect(paidStage.rate).toBe(50);
    expect(paidStage.dropoffRate).toBe(33.3); // (3-2)/3 = 33.3%

    expect(churnedStage.stage).toBe("churned");
    expect(churnedStage.count).toBe(1);
    expect(churnedStage.rate).toBe(25);
  });
});

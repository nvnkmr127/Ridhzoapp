import { describe, it, expect, vi, beforeEach } from "vitest";
import { PlatformService } from "./service";
import { db } from "@/db";

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(),
  },
}));

vi.mock("@/lib/jobs/redis", () => ({
  redisConfigured: false,
}));

describe("PlatformService.getPlatformActivity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("queries and maps cross-tenant platform activity logs", async () => {
    const mockRows = [
      {
        id: "log_1",
        action: "platform.suspend",
        actorName: "Super Admin",
        actorEmail: "admin@platform.local",
        entityType: "organization",
        orgId: "org_1",
        orgName: "Tenant Alpha",
        metadata: { reason: "payment_failure" },
        createdAt: new Date("2026-09-20T10:00:00.000Z"),
      },
    ];

    const limitMock = vi.fn().mockResolvedValue(mockRows);
    const orderMock = vi.fn().mockReturnValue({ limit: limitMock });
    const whereMock = vi.fn().mockReturnValue({ orderBy: orderMock });
    const leftJoinMock = vi.fn().mockReturnValue({ where: whereMock });
    const fromMock = vi.fn().mockReturnValue({ leftJoin: leftJoinMock });
    vi.mocked(db.select).mockReturnValue({ from: fromMock } as any);

    const result = await PlatformService.getPlatformActivity(20);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      id: "log_1",
      action: "platform.suspend",
      actorName: "Super Admin",
      actorEmail: "admin@platform.local",
      entityType: "organization",
      orgId: "org_1",
      orgName: "Tenant Alpha",
      metadata: { reason: "payment_failure" },
      createdAt: "2026-09-20T10:00:00.000Z",
    });
    expect(limitMock).toHaveBeenCalledWith(20);
  });
});

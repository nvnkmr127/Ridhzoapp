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

describe("PlatformService.findOrg", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty array when query is too short", async () => {
    const res = await PlatformService.findOrg("a");
    expect(res).toEqual([]);
    expect(db.select).not.toHaveBeenCalled();
  });

  it("searches and deduplicates orgs, tagging matched member info", async () => {
    const mockRows = [
      {
        id: "org_1",
        name: "Sharma Textiles",
        slug: "sharma-textiles",
        plan: "pro",
        matchedUserEmail: "rahul@sharma.com",
        matchedUserName: "Rahul Sharma",
      },
      {
        id: "org_1",
        name: "Sharma Textiles",
        slug: "sharma-textiles",
        plan: "pro",
        matchedUserEmail: "priya@sharma.com",
        matchedUserName: "Priya Sharma",
      },
    ];

    const limitMock = vi.fn().mockResolvedValue(mockRows);
    const whereMock = vi.fn().mockReturnValue({ limit: limitMock });
    const leftJoinMock = vi.fn().mockReturnValue({ where: whereMock });
    const fromMock = vi.fn().mockReturnValue({ leftJoin: leftJoinMock });
    vi.mocked(db.select).mockReturnValue({ from: fromMock } as any);

    const res = await PlatformService.findOrg("rahul", 5);

    expect(res).toHaveLength(1);
    expect(res[0]).toEqual({
      id: "org_1",
      name: "Sharma Textiles",
      slug: "sharma-textiles",
      plan: "pro",
      matchedReason: "Member: rahul@sharma.com",
    });
  });
});

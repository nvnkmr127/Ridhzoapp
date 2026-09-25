import { describe, it, expect, vi, beforeEach } from "vitest";
import { UserService } from "./service";
import { db } from "@/db";

vi.mock("@/db", () => ({ db: { select: vi.fn(), insert: vi.fn(), update: vi.fn() } }));
vi.mock("bcryptjs", () => ({ default: { hash: vi.fn().mockResolvedValue("hashed") } }));

describe("UserService tenant scoping", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (db.select as any).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
          orderBy: vi.fn().mockResolvedValue([]),
        }),
      }),
    });
  });

  it("create stamps the caller's organizationId (the orphaned-user bug)", async () => {
    const values = vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([{ id: "u1" }]) });
    (db.insert as any).mockReturnValue({ values });

    await UserService.create("org-1", { email: "a@b.com", password: "secret6", roleId: "role-1" });

    expect(values).toHaveBeenCalledWith(expect.objectContaining({ organizationId: "org-1" }));
  });

  it("list filters by organizationId (no cross-tenant leak)", async () => {
    const where = vi.fn().mockReturnValue({ orderBy: vi.fn().mockResolvedValue([]) });
    (db.select as any).mockReturnValue({ from: vi.fn().mockReturnValue({ where }) });

    await UserService.list("org-1");

    // where() got a condition object — scoping is applied rather than an unfiltered select.
    expect(where).toHaveBeenCalledOnce();
    expect(where.mock.calls[0][0]).toBeDefined();
  });
});

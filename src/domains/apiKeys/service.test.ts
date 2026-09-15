import { describe, it, expect, vi, beforeEach } from "vitest";
import { ApiKeyService } from "./service";
import { db } from "@/db";

vi.mock("@/db", () => ({ db: { select: vi.fn(), update: vi.fn() } }));

const select = db.select as unknown as ReturnType<typeof vi.fn>;
const update = db.update as unknown as ReturnType<typeof vi.fn>;

function selectReturns(rows: unknown[]) {
  select.mockReturnValue({ from: () => ({ where: () => ({ limit: () => rows }) }) });
}

beforeEach(() => vi.clearAllMocks());

describe("ApiKeyService.verify", () => {
  it("rejects anything without the pk_ prefix before hitting the DB", async () => {
    expect(await ApiKeyService.verify("")).toBeNull();
    expect(await ApiKeyService.verify("Bearer x")).toBeNull();
    expect(await ApiKeyService.verify("sk_123")).toBeNull();
    expect(select).not.toHaveBeenCalled();
  });

  it("returns null for an unknown/revoked key", async () => {
    selectReturns([]);
    expect(await ApiKeyService.verify("pk_deadbeef")).toBeNull();
  });

  it("maps a found row to org + scope and does NOT write on the read path", async () => {
    selectReturns([{ id: "k1", organizationId: "org-a", scope: "read_only" }]);
    const r = await ApiKeyService.verify("pk_good");
    expect(r).toEqual({ id: "k1", organizationId: "org-a", scope: "read_only" });
    expect(update).not.toHaveBeenCalled(); // verify never stamps usage
  });

  it("defaults a null scope to full", async () => {
    selectReturns([{ id: "k1", organizationId: "org-a", scope: null }]);
    expect((await ApiKeyService.verify("pk_good"))?.scope).toBe("full");
  });
});

describe("ApiKeyService.touchLastUsed", () => {
  it("is fire-and-forget and swallows write errors", () => {
    update.mockReturnValue({ set: () => ({ where: () => Promise.reject(new Error("db down")) }) });
    // Must not throw synchronously and must not return a rejected promise to the caller.
    expect(() => ApiKeyService.touchLastUsed("k1")).not.toThrow();
    expect(update).toHaveBeenCalled();
  });
});

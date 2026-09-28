import { describe, it, expect, vi, beforeEach } from "vitest";
import bcrypt from "bcryptjs";
import { db } from "@/db";
import { changePasswordAction } from "./account";

vi.mock("@/db", () => ({ db: { select: vi.fn(), update: vi.fn() } }));
vi.mock("@/lib/rbac", () => ({ requireAuth: vi.fn(async () => ({ user: { id: "u1" } })) }));
vi.mock("@/lib/rate-limit", () => ({ RateLimiter: { checkLimit: vi.fn(async () => ({ success: true })) } }));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));

const select = db.select as unknown as ReturnType<typeof vi.fn>;
const update = db.update as unknown as ReturnType<typeof vi.fn>;
const set = vi.fn(() => ({ where: vi.fn() }));

function me(row: object) {
  select.mockReturnValue({ from: () => ({ where: () => ({ limit: () => [row] }) }) });
}

beforeEach(() => {
  vi.clearAllMocks();
  update.mockReturnValue({ set });
});

describe("changePasswordAction", () => {
  it("requires the current password once the user has chosen one", async () => {
    me({ email: "a@b.com", passwordHash: await bcrypt.hash("old-pass", 4), passwordSet: true });
    const r = await changePasswordAction({ currentPassword: "nope", newPassword: "new-pass" });
    expect(r.ok).toBe(false);
    expect(update).not.toHaveBeenCalled();
    expect((await changePasswordAction({ currentPassword: "old-pass", newPassword: "new-pass" })).ok).toBe(true);
  });

  it("lets a Google/WhatsApp signup set one without a current password", async () => {
    me({ email: "a@b.com", passwordHash: "random", passwordSet: false });
    expect((await changePasswordAction({ newPassword: "new-pass" })).ok).toBe(true);
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ passwordSet: true }));
  });

  it("refuses WhatsApp-only accounts (no email to log in with) and short passwords", async () => {
    me({ email: "919876543210@phone.ridhzo.com", passwordHash: "random", passwordSet: false });
    expect((await changePasswordAction({ newPassword: "new-pass" })).ok).toBe(false);
    expect((await changePasswordAction({ newPassword: "123" })).ok).toBe(false);
    expect(update).not.toHaveBeenCalled();
  });
});

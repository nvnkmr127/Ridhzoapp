import { describe, it, expect, vi, beforeEach } from "vitest";
import bcrypt from "bcryptjs";

// Email + password authorize(): specific refusal reasons only after the password is proven.
const limitSpy = vi.fn();
vi.mock("@/db", () => ({
  db: { select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => ({ limit: limitSpy })) })) })) },
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, delete: () => {} }) }));

import { authOptions } from "./auth";

// Both credential providers report id "credentials" until NextAuth applies options.id; the email one
// is the one without a custom id.
const credentials = authOptions.providers.find((p: any) => p.type === "credentials" && !p.options?.id) as any;
const authorize = (email: string, password: string) => credentials.options.authorize({ email, password });

let passwordHash: string;
const user = (over: object = {}) => ({
  id: "u1", email: "a@b.com", passwordHash, isActive: true, organizationId: "org-1", isSuperAdmin: false,
  roleId: "r", phone: null, firstName: "A", lastName: null, ...over,
});

describe("credentials authorize", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    passwordHash ??= await bcrypt.hash("right-pass", 4);
  });

  it("says nothing specific when the password is wrong, even for a deactivated user", async () => {
    limitSpy.mockResolvedValueOnce([user({ isActive: false })]);
    await expect(authorize("a@b.com", "wrong-pass")).resolves.toBeNull();
  });

  it("reports a deactivated account once the password is right", async () => {
    limitSpy.mockResolvedValueOnce([user({ isActive: false })]);
    await expect(authorize("a@b.com", "right-pass")).rejects.toThrow("ACCOUNT_DISABLED");
  });

  it("reports a suspended workspace once the password is right", async () => {
    limitSpy.mockResolvedValueOnce([user()]).mockResolvedValueOnce([{ suspendedAt: new Date() }]);
    await expect(authorize("a@b.com", "right-pass")).rejects.toThrow("ACCOUNT_SUSPENDED");
  });

  it("matches the email case-insensitively", async () => {
    limitSpy.mockResolvedValueOnce([user()]).mockResolvedValueOnce([{ suspendedAt: null }]);
    await expect(authorize("  A@B.COM ", "right-pass")).resolves.toMatchObject({ id: "u1" });
  });
});

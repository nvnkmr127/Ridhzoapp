import { describe, it, expect, vi, beforeEach } from "vitest";

// C1: a Firebase token only proves a phone number when it CARRIES that number.
const verify = vi.fn();
const limitSpy = vi.fn();
vi.mock("@/lib/auth/firebaseTokenVerifier", () => ({ verifyFirebaseIdToken: (t: string) => verify(t) }));
vi.mock("@/db", () => ({
  db: { select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => ({ limit: limitSpy })) })) })) },
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, delete: () => {} }) }));

import { authorizePhoneOtp } from "./auth";

const existing = { id: "u1", email: null, phone: "+919876543210", isActive: true, organizationId: "o1", isSuperAdmin: false, roleId: "r", firstName: "A", lastName: null };

describe("authorizePhoneOtp (Firebase fallback)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    limitSpy.mockResolvedValue([existing]);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("rejects a valid token that has no phone claim", async () => {
    verify.mockResolvedValue({ uid: "anon" });
    await expect(authorizePhoneOtp({ phoneNumber: "+919876543210", idToken: "t" })).resolves.toBeNull();
  });

  it("rejects a token for a different number", async () => {
    verify.mockResolvedValue({ uid: "x", phoneNumber: "+911111111111" });
    await expect(authorizePhoneOtp({ phoneNumber: "+919876543210", idToken: "t" })).resolves.toBeNull();
  });

  it("accepts a token for the claimed number", async () => {
    verify.mockResolvedValue({ uid: "x", phoneNumber: "+919876543210" });
    await expect(authorizePhoneOtp({ phoneNumber: "+919876543210", idToken: "t" })).resolves.toMatchObject({ id: "u1" });
  });
});

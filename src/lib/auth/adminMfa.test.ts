import { describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({}) }));
vi.stubEnv("NEXTAUTH_SECRET", "test-secret");
import { mfaToken, mfaTokenValid, MFA_TTL_SEC } from "./adminMfa";

describe("admin MFA step-up token", () => {
  const now = 1_700_000_000_000;
  it("is valid for its user until it expires", () => {
    const t = mfaToken("u1", now);
    expect(mfaTokenValid("u1", t, now + 1000)).toBe(true);
    expect(mfaTokenValid("u1", t, now + (MFA_TTL_SEC + 5) * 1000)).toBe(false);
  });
  it("cannot be used by another user or tampered with", () => {
    const t = mfaToken("u1", now);
    expect(mfaTokenValid("u2", t, now)).toBe(false);
    const [exp, sig] = t.split(".");
    expect(mfaTokenValid("u1", `${Number(exp) + 99999}.${sig}`, now)).toBe(false);
    expect(mfaTokenValid("u1", undefined, now)).toBe(false);
  });
});

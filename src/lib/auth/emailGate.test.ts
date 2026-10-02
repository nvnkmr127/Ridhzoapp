import { describe, it, expect, vi } from "vitest";
vi.mock("@/db", () => ({ db: {} }));
import { emailGateFor } from "./emailVerify";

const base = { emailVerifiedAt: null, googleLinkedAt: null, signupMethod: null as string | null, createdAt: new Date("2026-11-01T00:00:00Z"), email: "a@x.com" };

describe("emailGateFor", () => {
  it("blocks a new, unverified password sign-up", () => expect(emailGateFor(base)).toMatch(/Verify your email/));
  it("lets verified, Google, phone and placeholder-email accounts through", () => {
    expect(emailGateFor({ ...base, emailVerifiedAt: new Date() })).toBeNull();
    expect(emailGateFor({ ...base, googleLinkedAt: new Date() })).toBeNull();
    expect(emailGateFor({ ...base, signupMethod: "phone" })).toBeNull();
    expect(emailGateFor({ ...base, email: null })).toBeNull();
  });
  it("grandfathers accounts created before the cut-off", () => {
    expect(emailGateFor({ ...base, createdAt: new Date("2026-09-01T00:00:00Z") })).toBeNull();
  });
});

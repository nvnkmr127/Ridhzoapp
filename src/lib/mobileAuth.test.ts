import { describe, it, expect, vi } from "vitest";
import crypto from "crypto";

vi.hoisted(() => {
  process.env.NEXTAUTH_SECRET = "test-secret";
});

import { signGoogleCode, verifyGoogleCode, verifyMobileToken, signMobileToken } from "./mobileAuth";

const verifier = crypto.randomBytes(32).toString("base64url");
const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");

describe("mobile Google sign-in code", () => {
  it("exchanges only with the matching verifier", () => {
    const code = signGoogleCode("user-1", challenge);
    expect(verifyGoogleCode(code, verifier)).toBe("user-1");
    expect(verifyGoogleCode(code, crypto.randomBytes(32).toString("base64url"))).toBeNull();
  });

  it("is not accepted as a bearer token, and a bearer token is not a code", () => {
    const code = signGoogleCode("user-1", challenge);
    expect(verifyMobileToken(code)).toBeNull();
    const token = signMobileToken({ sub: "user-1", org: "org-1", role: null, email: "a@b.c" });
    expect(verifyGoogleCode(token, verifier)).toBeNull();
  });

  it("expires after two minutes", () => {
    vi.useFakeTimers();
    const code = signGoogleCode("user-1", challenge);
    vi.advanceTimersByTime(121_000);
    expect(verifyGoogleCode(code, verifier)).toBeNull();
    vi.useRealTimers();
  });
});

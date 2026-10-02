import { describe, it, expect } from "vitest";
import { base32Decode, base32Encode, totpAt, verifyTotp, generateTotpSecret } from "./totp";

describe("totp", () => {
  // RFC 6238 appendix B (SHA-1, secret "12345678901234567890"), last 6 digits of the 8-digit values.
  const secret = base32Encode(Buffer.from("12345678901234567890"));
  it("matches the RFC 6238 vectors", () => {
    expect(totpAt(secret, 59_000)).toBe("287082");
    expect(totpAt(secret, 1111111109_000)).toBe("081804");
    expect(totpAt(secret, 1234567890_000)).toBe("005924");
  });
  it("base32 round-trips", () => {
    const s = generateTotpSecret();
    expect(base32Encode(base32Decode(s))).toBe(s);
  });
  it("accepts ±1 step, rejects further drift and junk", () => {
    const now = 1_700_000_000_000;
    expect(verifyTotp(secret, totpAt(secret, now), now)).toBe(true);
    expect(verifyTotp(secret, totpAt(secret, now - 30_000), now)).toBe(true);
    expect(verifyTotp(secret, totpAt(secret, now - 90_000), now)).toBe(false);
    expect(verifyTotp(secret, "abcdef", now)).toBe(false);
  });
});

import { describe, it, expect } from "vitest";
import { makeGoogleLinkToken, readGoogleLinkToken, isPlaceholderEmail } from "./googleLink";

describe("google link token", () => {
  const uid = "6f1c2e0a-1111-4222-8333-444455556666";

  it("round-trips a fresh token", () => {
    expect(readGoogleLinkToken(makeGoogleLinkToken(uid))).toBe(uid);
  });

  it("rejects expired, tampered and missing tokens", () => {
    expect(readGoogleLinkToken(makeGoogleLinkToken(uid, Date.now() - 11 * 60 * 1000))).toBeNull();
    const [, exp, sig] = makeGoogleLinkToken(uid).split(".");
    expect(readGoogleLinkToken(`someone-else.${exp}.${sig}`)).toBeNull();
    expect(readGoogleLinkToken(undefined)).toBeNull();
    expect(readGoogleLinkToken("garbage")).toBeNull();
  });

  it("spots placeholder phone emails", () => {
    expect(isPlaceholderEmail("919876543210@phone.ridhzo.com")).toBe(true);
    expect(isPlaceholderEmail("jane@gmail.com")).toBe(false);
  });
});

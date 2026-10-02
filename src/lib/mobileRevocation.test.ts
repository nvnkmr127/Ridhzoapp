import { describe, it, expect, vi, beforeEach } from "vitest";

const store = new Map<string, string>();
vi.mock("@/lib/jobs/redis", () => ({ createRedis: () => ({
  set: async (k: string, v: string) => { store.set(k, v); return "OK"; },
  get: async (k: string) => store.get(k) ?? null,
}) }));

import { retireMobileToken, revokeMobileToken, isMobileTokenRevoked } from "./mobileRevocation";

const tok = (jti: string) => ({ sub: "u", org: "o", role: null, email: null, jti, exp: Math.floor(Date.now() / 1000) + 3600 });

describe("mobile token rotation", () => {
  beforeEach(() => store.clear());
  it("keeps a retired token usable for the grace window, then refuses it", async () => {
    await retireMobileToken(tok("a"), 600);
    expect(await isMobileTokenRevoked(tok("a"))).toBe(false); // lost-response retry still works
    store.set("mobile:revoked:a", String(Date.now() - 1));      // grace elapsed
    expect(await isMobileTokenRevoked(tok("a"))).toBe(true);
  });
  it("revokes immediately on sign-out", async () => {
    await revokeMobileToken(tok("b"));
    expect(await isMobileTokenRevoked(tok("b"))).toBe(true);
  });
  it("leaves other tokens alone", async () => expect(await isMobileTokenRevoked(tok("c"))).toBe(false));
});

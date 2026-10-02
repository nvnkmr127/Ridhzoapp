import { describe, it, expect, vi, afterEach } from "vitest";
import { ipFromHeaders } from "./clientIp";

const h = (o: Record<string, string>) => ({ get: (n: string) => o[n.toLowerCase()] ?? null });
afterEach(() => vi.unstubAllEnvs());

describe("ipFromHeaders", () => {
  it("ignores the client-chosen left end of X-Forwarded-For", () => {
    expect(ipFromHeaders(h({ "x-forwarded-for": "6.6.6.6, 203.0.113.9" }))).toBe("203.0.113.9");
  });
  it("counts trusted proxy hops from the right", () => {
    vi.stubEnv("TRUSTED_PROXY_HOPS", "2");
    expect(ipFromHeaders(h({ "x-forwarded-for": "6.6.6.6, 203.0.113.9, 10.0.0.1" }))).toBe("203.0.113.9");
  });
  it("uses the edge-written header on Vercel and Cloudflare", () => {
    vi.stubEnv("VERCEL", "1");
    expect(ipFromHeaders(h({ "x-vercel-forwarded-for": "198.51.100.7", "x-forwarded-for": "6.6.6.6" }))).toBe("198.51.100.7");
    vi.unstubAllEnvs();
    vi.stubEnv("TRUST_CF_CONNECTING_IP", "1");
    expect(ipFromHeaders(h({ "cf-connecting-ip": "198.51.100.8", "x-forwarded-for": "6.6.6.6" }))).toBe("198.51.100.8");
  });
  it("falls back to unknown", () => expect(ipFromHeaders(h({}))).toBe("unknown"));
});

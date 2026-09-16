import { describe, expect, it } from "vitest";
import { isBlockedAddress, assertPublicHttpUrl } from "./ssrf";

describe("isBlockedAddress", () => {
  it("blocks loopback, private, link-local and metadata ranges", () => {
    for (const ip of ["127.0.0.1", "0.0.0.0", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1", "224.0.0.1", "::1", "fe80::1", "fd00::1", "::ffff:127.0.0.1"]) {
      expect(isBlockedAddress(ip), ip).toBe(true);
    }
  });

  it("allows public addresses", () => {
    for (const ip of ["8.8.8.8", "1.1.1.1", "172.15.0.1", "172.32.0.1", "192.167.0.1", "2606:4700:4700::1111"]) {
      expect(isBlockedAddress(ip), ip).toBe(false);
    }
  });

  it("refuses malformed IPv4", () => {
    expect(isBlockedAddress("999.1.1.1")).toBe(true);
    expect(isBlockedAddress("garbage")).toBe(true);
  });
});

describe("assertPublicHttpUrl", () => {
  it("rejects non-http protocols", async () => {
    await expect(assertPublicHttpUrl("ftp://example.com")).rejects.toThrow(/http/i);
    await expect(assertPublicHttpUrl("file:///etc/passwd")).rejects.toThrow();
  });

  it("rejects private IP literals without DNS", async () => {
    await expect(assertPublicHttpUrl("http://169.254.169.254/latest/meta-data")).rejects.toThrow(/private|reserved/i);
    await expect(assertPublicHttpUrl("http://127.0.0.1:8080")).rejects.toThrow(/private|reserved/i);
  });
});

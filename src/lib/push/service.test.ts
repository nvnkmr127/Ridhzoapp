import { describe, it, expect } from "vitest";
import { PushService } from "./service";

describe("PushService.formatVapidSubject", () => {
  it("prefixes email addresses without mailto: with mailto:", () => {
    expect(PushService.formatVapidSubject("admin@ridhzo.com")).toBe("mailto:admin@ridhzo.com");
    expect(PushService.formatVapidSubject("\"admin@ridhzo.com\"")).toBe("mailto:admin@ridhzo.com");
  });

  it("leaves mailto: and https: protocols unchanged", () => {
    expect(PushService.formatVapidSubject("mailto:hello@ridhzo.com")).toBe("mailto:hello@ridhzo.com");
    expect(PushService.formatVapidSubject("https://app.ridhzo.com")).toBe("https://app.ridhzo.com");
  });

  it("converts http: to https: protocol", () => {
    expect(PushService.formatVapidSubject("http://app.ridhzo.com")).toBe("https://app.ridhzo.com");
  });

  it("defaults to fallback when undefined or empty", () => {
    expect(PushService.formatVapidSubject("")).toBe("mailto:admin@ridhzo.com");
    expect(PushService.formatVapidSubject(undefined)).toBe("mailto:admin@ridhzo.com");
  });
});

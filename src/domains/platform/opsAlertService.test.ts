import { describe, it, expect } from "vitest";
import { cliqAccountsHost } from "./opsAlertService";

describe("cliqAccountsHost", () => {
  it("maps a Cliq data center to its accounts host", () => {
    expect(cliqAccountsHost("https://cliq.zoho.in/company/1/api/v2/channelsbyname/x/message")).toBe("accounts.zoho.in");
    expect(cliqAccountsHost("https://cliq.zoho.com/api/v2/x")).toBe("accounts.zoho.com");
  });
  it("refuses non-Zoho hosts so OAuth secrets never leave Zoho", () => {
    expect(cliqAccountsHost("https://cliq.zoho.in.evil.com/x")).toBeNull();
    expect(cliqAccountsHost("https://hooks.slack.com/services/x")).toBeNull();
    expect(cliqAccountsHost("not a url")).toBeNull();
  });
});

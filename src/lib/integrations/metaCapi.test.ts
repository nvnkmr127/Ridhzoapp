import { describe, it, expect } from "vitest";
import crypto from "crypto";
import { hashEmail, hashPhone, buildEvent, buildCrmLeadEvent } from "./metaCapi";

const sha = (v: string) => crypto.createHash("sha256").update(v).digest("hex");

describe("hashEmail", () => {
  it("normalizes (trim+lowercase) then sha-256 hashes", () => {
    expect(hashEmail("  Ada@Example.com ")).toBe(sha("ada@example.com"));
  });
  it("returns undefined for empty, never hashing an empty string", () => {
    expect(hashEmail("")).toBeUndefined();
    expect(hashEmail(null)).toBeUndefined();
  });
});

describe("hashPhone", () => {
  it("strips non-digits then hashes", () => {
    expect(hashPhone("+1 (415) 555-0100")).toBe(sha("14155550100"));
  });
  it("returns undefined when no digits", () => {
    expect(hashPhone("n/a")).toBeUndefined();
  });
});

describe("buildEvent", () => {
  const lead = { id: "lead-1", email: "a@b.com", phone: "+1 415 555 0100", name: "Ada Lovelace" };

  it("hashes user_data and sets a dedupe event_id", () => {
    const ev = buildEvent("Lead", lead, { eventTime: 1000 });
    expect(ev.event_name).toBe("Lead");
    expect(ev.event_id).toBe("lead-1:Lead");
    expect(ev.event_time).toBe(1000);
    const ud = ev.user_data as Record<string, string[]>;
    expect(ud.em).toEqual([sha("a@b.com")]);
    expect(ud.ph).toEqual([sha("14155550100")]);
    expect(ud.fn).toEqual([sha("ada")]);
    expect(ud.ln).toEqual([sha("lovelace")]);
  });

  it("includes value + currency only when a positive value is present", () => {
    expect(buildEvent("Purchase", { id: "x" }).custom_data).toBeUndefined();
    const withVal = buildEvent("Purchase", { id: "x", value: 500, currency: "eur" });
    expect(withVal.custom_data).toEqual({ value: 500, currency: "EUR" });
  });

  it("omits missing PII fields rather than hashing empties", () => {
    const ev = buildEvent("Lead", { id: "y", email: "only@mail.com" });
    const ud = ev.user_data as Record<string, unknown>;
    expect(ud.em).toBeDefined();
    expect(ud.ph).toBeUndefined();
    expect(ud.fn).toBeUndefined();
  });

  describe("buildCrmLeadEvent (Conversion Leads)", () => {
    it("attributes by lead_id (string, not hashed) with crm event source", () => {
      const ev = buildCrmLeadEvent("qualified", { leadgenId: "1584693463226978", crmName: "Ridhzo" });
      expect(ev.event_name).toBe("qualified");
      expect(ev.action_source).toBe("system_generated");
      expect(ev.user_data).toEqual({ lead_id: "1584693463226978" }); // string → no precision loss
      expect(ev.custom_data).toMatchObject({ event_source: "crm", lead_event_source: "Ridhzo" });
    });

    it("includes value + currency only when positive", () => {
      const noVal = buildCrmLeadEvent("converted", { leadgenId: "1", crmName: "Ridhzo" });
      expect((noVal.custom_data as any).value).toBeUndefined();
      expect(buildCrmLeadEvent("converted", { leadgenId: "9", crmName: "Ridhzo" }).event_id).toBe("9:converted");
      const withVal = buildCrmLeadEvent("converted", { leadgenId: "1", crmName: "Ridhzo", value: 50000, currency: "inr" });
      expect(withVal.custom_data).toMatchObject({ value: 50000, currency: "INR" });
    });
  });
});

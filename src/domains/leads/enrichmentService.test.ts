import { describe, it, expect } from "vitest";
import { enrichmentPatch, needsEnrichment, callProvider } from "./enrichmentService";

const result = { source: "provider.example", attributes: { company: "Acme Inc", title: "CTO" } };
const at = new Date("2026-08-31T00:00:00Z");

describe("enrichmentPatch (evidence discipline)", () => {
  it("stores the observation verbatim as evidence", () => {
    expect(enrichmentPatch(result, at).evidence).toEqual({
      source: "provider.example",
      fetchedAt: at.toISOString(),
      attributes: { company: "Acme Inc", title: "CTO" },
    });
  });

  it("reports the observed company (trimmed), or null when none", () => {
    expect(enrichmentPatch(result, at).company).toBe("Acme Inc");
    expect(enrichmentPatch({ source: "s", attributes: { companyName: " Beta " } }, at).company).toBe("Beta");
    expect(enrichmentPatch({ source: "s", attributes: { title: "X" } }, at).company).toBeNull();
  });
});

describe("callProvider", () => {
  const config = { url: "http://127.0.0.1/enrich", authHeader: "Authorization", authValue: "k", timeoutMs: 1000 };
  it("refuses private addresses without calling out", async () => {
    const r = await callProvider({ email: "a@b.com" }, config);
    expect(r).toMatchObject({ ok: false, retryable: false });
  });
  it("skips when there is nothing to look up", async () => {
    expect(await callProvider({ name: "x" }, config)).toMatchObject({ ok: false, reason: "nothing to look up" });
  });
});

describe("needsEnrichment", () => {
  it("is true for a lead with contact data and no prior enrichment", () => {
    expect(needsEnrichment({ email: "a@b.com", company: null, customData: {} })).toBe(true);
    expect(needsEnrichment({ email: null, company: "Acme", customData: null })).toBe(true);
  });
  it("is false when already enriched", () => {
    expect(needsEnrichment({ email: "a@b.com", company: null, customData: { _enrichment: { source: "x" } } })).toBe(false);
  });
  it("is false with nothing to look up", () => {
    expect(needsEnrichment({ email: null, company: null, customData: {} })).toBe(false);
  });
});

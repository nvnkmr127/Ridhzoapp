import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const SECRET = "s3cret";
const SOURCE_ID = "11111111-2222-4333-8444-555555555555";
let source: any;
let existing: any; // row returned on idempotency conflict
const { processLead, updateSource } = vi.hoisted(() => ({ processLead: vi.fn(), updateSource: vi.fn(async () => ({})) }));
const updates: any[] = [];

vi.mock("@/lib/rate-limit", () => ({ RateLimiter: { checkLimit: async () => ({ success: true }) } }));
vi.mock("@/domains/leads/sourceService", () => ({ LeadSourceService: { getSource: async () => source, updateSource } }));
vi.mock("@/lib/leads/ingestion", () => ({ IngestionService: { processLead: (...a: any[]) => processLead(...a) } }));
vi.mock("@/domains/activities/service", () => ({ ActivityService: { addActivity: vi.fn() } }));
vi.mock("@/db/schema", () => ({ webhookEvents: { provider: "p", idempotencyKey: "k", id: "id", status: "s" } }));
vi.mock("drizzle-orm", () => ({ and: () => 0, eq: () => 0 }));
vi.mock("@/db", () => ({
  db: {
    insert: () => ({ values: () => ({ onConflictDoNothing: () => ({ returning: async () => (existing ? [] : [{ id: "evt" }]) }) }) }),
    select: () => ({ from: () => ({ where: () => ({ limit: async () => (existing ? [existing] : []) }) }) }),
    update: () => ({ set: (v: any) => { updates.push(v); return { where: async () => {} }; } }),
  },
}));

import { POST } from "./route";

const call = (body: any) =>
  POST(new NextRequest(`http://x/api/webhooks/google_lead_ads?sourceId=${SOURCE_ID}`, { method: "POST", body: JSON.stringify(body) }));
const lead = (extra: any = {}) => ({
  lead_id: "L1", google_key: SECRET, gcl_id: "g1", campaign_id: "c1", form_id: "f1",
  user_column_data: [{ column_id: "EMAIL", string_value: "a@x.com" }, { column_id: "FULL_NAME", string_value: "Ada" }],
  ...extra,
});

describe("google lead form webhook", () => {
  beforeEach(() => {
    source = { id: SOURCE_ID, type: "google_lead_ads", isActive: 1, organizationId: "org-1", webhookSecret: SECRET, config: {} };
    existing = undefined;
    updates.length = 0;
    processLead.mockReset().mockResolvedValue({ status: "success", leadId: "lead-1" });
  });

  it("rejects a wrong key and a source with no secret (fail closed)", async () => {
    expect((await call(lead({ google_key: "nope" }))).status).toBe(401);
    source.webhookSecret = null;
    expect((await call(lead({ google_key: "" }))).status).toBe(401);
    expect(processLead).not.toHaveBeenCalled();
  });

  it("acks a test ping without creating a lead and records it", async () => {
    const res = await call(lead({ is_test: true }));
    expect(await res.json()).toEqual({ status: "test_ok" });
    expect(processLead).not.toHaveBeenCalled();
    expect(updateSource).toHaveBeenCalled();
  });

  it("ingests a lead with attribution and the Google lead id", async () => {
    const res = await call(lead());
    expect(res.status).toBe(200);
    expect(processLead.mock.calls[0][0]).toMatchObject({ name: "Ada", email: "a@x.com", externalId: "L1", customData: { gclId: "g1", campaignId: "c1", googleLeadId: "L1" } });
  });

  it("skips a retried delivery that already processed", async () => {
    existing = { id: "evt", status: "processed" };
    expect(await (await call(lead())).json()).toEqual({ status: "duplicate" });
    expect(processLead).not.toHaveBeenCalled();
  });

  it("422s and records a failure when there is no email or phone", async () => {
    const res = await call(lead({ user_column_data: [{ column_id: "FULL_NAME", string_value: "Ada" }] }));
    expect(res.status).toBe(422);
    expect(updates.at(-1)).toMatchObject({ status: "failed" });
  });

  it("records a failure and hides the error text on ingestion errors", async () => {
    processLead.mockRejectedValue(new Error("secret db detail"));
    const res = await call(lead());
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("secret db detail");
    expect(updates.at(-1)).toMatchObject({ status: "failed" });
  });
});

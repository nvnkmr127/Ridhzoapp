import { describe, it, expect, beforeEach, vi } from "vitest";

// Shared mutable state the module mocks read from (hoisted above the vi.mock calls).
const h = vi.hoisted(() => ({
  sources: [] as any[],
  updates: [] as any[],
  processLead: vi.fn(async () => ({ status: "success", leadId: "lead-1" })),
  fetchLeadgenData: vi.fn(async () => ({
    id: "lg1",
    form_id: "f1",
    field_data: [
      { name: "full_name", values: ["Sarah Connor"] },
      { name: "email", values: ["sarah@sky.net"] },
    ],
  })),
  isAuthError: vi.fn(() => false),
  markNeedsReconnect: vi.fn(async () => {}),
}));

vi.mock("@/db", () => ({
  db: {
    select: () => ({ from: () => ({ where: () => Promise.resolve(h.sources) }) }),
    update: () => ({ set: (v: any) => ({ where: () => { h.updates.push(v); return Promise.resolve(); } }) }),
  },
}));
vi.mock("@/db/schema", () => ({ webhookEvents: {}, leadSources: { type: "type" } }));
vi.mock("drizzle-orm", () => ({ eq: () => ({}) }));
vi.mock("@/lib/leads/ingestion", () => ({ IngestionService: { processLead: h.processLead } }));
vi.mock("@/domains/leads/sourceService", () => ({ LeadSourceService: { markNeedsReconnect: h.markNeedsReconnect } }));
vi.mock("@/domains/leads/metaTokenRefreshService", () => ({
  MetaTokenRefreshService: { fetchLeadgenData: h.fetchLeadgenData, isAuthError: h.isAuthError },
}));

import { FacebookIngestionService } from "./facebookIngestionService";

const event = (payload: any) => ({ id: "evt-1", payload });
const source = (config: any) => ({ id: "src-1", organizationId: "org-1", isActive: 1, config });

describe("FacebookIngestionService.processEvent", () => {
  beforeEach(() => {
    h.sources = [];
    h.updates = [];
    h.processLead.mockClear();
    h.fetchLeadgenData.mockClear();
    h.isAuthError.mockReturnValue(false);
  });

  it("throws when no source is connected for the Page (so it can be retried, not silently dropped)", async () => {
    h.sources = [];
    await expect(
      FacebookIngestionService.processEvent(event({ page_id: "p1", form_id: "f1", leadgen_id: "lg1" })),
    ).rejects.toThrow(/No Facebook Lead Ads source/i);
  });

  it("refuses to route a Page connected by two organizations", async () => {
    h.sources = [
      { ...source({ pageId: "p1", pageAccessToken: "t" }), organizationId: "org-1" },
      { ...source({ pageId: "p1", pageAccessToken: "t" }), organizationId: "org-2" },
    ];
    await expect(
      FacebookIngestionService.processEvent(event({ page_id: "p1", form_id: "f1", leadgen_id: "lg1" })),
    ).rejects.toThrow(/multiple organizations/i);
  });

  it("skips a lead whose form isn't in the form filter (no Graph call, no ingest)", async () => {
    h.sources = [source({ pageId: "p1", pageAccessToken: "t", formFilter: ["OTHER_FORM"] })];
    const res = await FacebookIngestionService.processEvent(event({ page_id: "p1", form_id: "f1", leadgen_id: "lg1" }));
    expect(res).toEqual({ status: "skipped", reason: "filtered_form" });
    expect(h.fetchLeadgenData).not.toHaveBeenCalled();
    expect(h.processLead).not.toHaveBeenCalled();
    expect(h.updates.at(-1).status).toBe("processed");
  });

  it("flags the source for reconnect on a dead token instead of throwing", async () => {
    h.sources = [source({ pageId: "p1", pageAccessToken: "t", formFilter: [] })];
    h.fetchLeadgenData.mockRejectedValueOnce(Object.assign(new Error("bad token"), { metaCode: 190 }));
    h.isAuthError.mockReturnValue(true);
    const res = await FacebookIngestionService.processEvent(event({ page_id: "p1", form_id: "f1", leadgen_id: "lg1" }));
    expect(res).toEqual({ status: "failed", reason: "needs_reconnect" });
    expect(h.markNeedsReconnect).toHaveBeenCalledWith("src-1");
  });

  it("fetches, maps and ingests a real lead, marking the event processed", async () => {
    h.sources = [source({ pageId: "p1", pageAccessToken: "t", formFilter: [] })];
    const res = await FacebookIngestionService.processEvent(event({ page_id: "p1", form_id: "f1", leadgen_id: "lg1" }));
    expect(h.fetchLeadgenData).toHaveBeenCalledWith("lg1", "t");
    expect(h.processLead).toHaveBeenCalledTimes(1);
    expect(h.processLead.mock.calls[0][0]).toMatchObject({ email: "sarah@sky.net", sourceId: "src-1", organizationId: "org-1" });
    expect(res).toMatchObject({ status: "success" });
    expect(h.updates.at(-1).status).toBe("processed");
  });
});

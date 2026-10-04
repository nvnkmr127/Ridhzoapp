import { describe, it, expect, vi, beforeEach } from "vitest";

let candidates: any[] = [];
const recapFn = vi.fn();

vi.mock("@/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          where: () => ({
            orderBy: () => ({
              limit: async () => candidates,
            }),
          }),
        }),
      }),
    }),
  },
}));

vi.mock("@/lib/ai/client", () => ({
  aiEnabled: () => true,
}));

vi.mock("@/lib/ai/leadAssist", () => ({
  recapForLead: (...a: any[]) => recapFn(...a),
}));

vi.mock("@/domains/billing/planNames", () => ({
  trialExpired: (org: any) => Boolean(org?.trialEndsAt && new Date(org.trialEndsAt).getTime() < Date.now()),
}));

vi.mock("../redis", () => ({ createRedis: vi.fn(), quietErrors: vi.fn() }));
vi.mock("bullmq", () => ({ Worker: vi.fn(), Queue: vi.fn() }));

import { processLeadAiPrewarm, scheduleLeadAiPrewarmScan, MAX_PER_ORG_PER_RUN } from "./leadAiPrewarmWorker";
import { Queue } from "bullmq";

describe("leadAiPrewarmWorker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    candidates = [];
  });

  it("prewarms open leads with missing or stale recaps", async () => {
    candidates = [
      {
        lead: { id: "l1", organizationId: "org1", name: "Ravi" },
        plan: "starter",
        trialEndsAt: null,
      },
    ];
    recapFn.mockResolvedValueOnce({ ai: true, summary: "Active enquiry" });

    const res = await processLeadAiPrewarm(10);
    expect(res.warmed).toBe(1);
    expect(recapFn).toHaveBeenCalledWith(candidates[0].lead, "org1", true, { billable: false });
  });

  it("never bills the workspace — prewarm is not a credit-consuming action", async () => {
    candidates = [{ lead: { id: "l1", organizationId: "org1", name: "Ravi" }, plan: "starter", trialEndsAt: null }];
    recapFn.mockResolvedValueOnce({ ai: true, summary: "Active enquiry" });

    await processLeadAiPrewarm(10);
    // billable:false must reach recapForLead, which is what skips consumeAiCredit/refundAiCredit.
    expect(recapFn.mock.calls[0][3]).toEqual({ billable: false });
  });

  it("skips free plans with no trial at all", async () => {
    candidates = [{ lead: { id: "l3", organizationId: "org3", name: "Anita" }, plan: "free", trialEndsAt: null }];

    const res = await processLeadAiPrewarm(10);
    expect(res.warmed).toBe(0);
    expect(res.skipped).toBe(1);
    expect(recapFn).not.toHaveBeenCalled();
  });

  it("prewarms free plans on an active trial", async () => {
    candidates = [
      { lead: { id: "l4", organizationId: "org4", name: "Sunil" }, plan: "free", trialEndsAt: new Date(Date.now() + 86_400_000) },
    ];
    recapFn.mockResolvedValueOnce({ ai: true, summary: "Trial lead" });

    const res = await processLeadAiPrewarm(10);
    expect(res.warmed).toBe(1);
  });

  it("caps how many leads one org can take in a single run", async () => {
    candidates = Array.from({ length: 12 }, (_, i) => ({
      lead: { id: `l${i}`, organizationId: "org1", name: `Lead ${i}` },
      plan: "starter",
      trialEndsAt: null,
    }));
    recapFn.mockResolvedValue({ ai: true, summary: "ok" });

    const res = await processLeadAiPrewarm(50);
    expect(res.warmed).toBe(MAX_PER_ORG_PER_RUN);
    expect(recapFn).toHaveBeenCalledTimes(MAX_PER_ORG_PER_RUN);
  });

  it("skips expired free plans", async () => {
    candidates = [
      {
        lead: { id: "l2", organizationId: "org2", name: "Priya" },
        plan: "free",
        trialEndsAt: new Date(Date.now() - 100_000),
      },
    ];

    const res = await processLeadAiPrewarm(10);
    expect(res.warmed).toBe(0);
    expect(res.skipped).toBe(1);
    expect(recapFn).not.toHaveBeenCalled();
  });

  it("registers 3-hour job scheduler in Queue", async () => {
    const upsertJobScheduler = vi.fn().mockResolvedValue(undefined);
    (Queue as any).mockImplementation(function () {
      return { upsertJobScheduler };
    });

    await scheduleLeadAiPrewarmScan();
    expect(upsertJobScheduler).toHaveBeenCalledWith(
      "lead-ai-prewarm-scan",
      { every: 3 * 60 * 60 * 1000 },
      expect.objectContaining({ name: "scan" }),
    );
  });
});

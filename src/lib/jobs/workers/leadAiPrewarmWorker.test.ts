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

import { processLeadAiPrewarm, scheduleLeadAiPrewarmScan } from "./leadAiPrewarmWorker";
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
    expect(recapFn).toHaveBeenCalledWith(candidates[0].lead, "org1", true);
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

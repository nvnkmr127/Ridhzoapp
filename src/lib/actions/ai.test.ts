import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateSequenceAction } from "./ai";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/rbac", () => ({
  requireOrg: vi.fn().mockResolvedValue({ organizationId: "org-1", userId: "user-1" }),
}));

vi.mock("@/domains/organizations/service", () => ({
  OrgService: {
    getOrganization: vi.fn().mockResolvedValue({ id: "org-1", name: "Test Org" }),
  },
}));

const useAiCredit = vi.fn().mockResolvedValue(true);
vi.mock("@/domains/billing/planService", () => ({
  PlanService: { useAiCredit: () => useAiCredit(), refundAiCredit: vi.fn() },
}));

describe("generateSequenceAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("generates contextual sequence steps for demo goal", async () => {
    const res = await generateSequenceAction("Schedule a product demo for new leads");
    expect(res.steps.length).toBeGreaterThan(0);
    expect(res.steps[0].channel).toBe("whatsapp");
    expect(res.steps[0].body.toLowerCase()).toContain("demo");
  });

  it("generates contextual sequence steps for meeting goal", async () => {
    const res = await generateSequenceAction("Book a consultation meeting");
    expect(res.steps.length).toBeGreaterThan(0);
    expect(res.steps.some((s) => s.body.toLowerCase().includes("call") || s.body.toLowerCase().includes("consultation"))).toBe(true);
  });

  it("generates contextual sequence steps for custom topic", async () => {
    const res = await generateSequenceAction("hiring logistics");
    expect(res.steps.length).toBeGreaterThan(0);
    expect(res.steps.some((s) => s.body.toLowerCase().includes("hiring logistics"))).toBe(true);
  });

  it("flags out-of-credits instead of calling the model", async () => {
    const prev = process.env.AI_GATEWAY_API_KEY;
    process.env.AI_GATEWAY_API_KEY = "test-key-long-enough";
    useAiCredit.mockResolvedValueOnce(false);
    const res = await generateSequenceAction("follow up on pricing");
    process.env.AI_GATEWAY_API_KEY = prev;
    expect(res.outOfCredits).toBe(true);
    expect(res.ai).toBe(false);
    expect(res.steps.length).toBeGreaterThan(0);
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// H3: the no-payment plan switch must never work in production, nor without the explicit test flag.
vi.mock("@/lib/rbac", () => ({ requirePermission: async () => ({ organizationId: "o1", userId: "u1" }) }));
const setPlan = vi.fn();
vi.mock("@/domains/billing/service", () => ({ BillingService: { setPlanManually: (...a: unknown[]) => setPlan(...a) } }));
vi.mock("@/domains/audit/service", () => ({ AuditService: { log: vi.fn() } }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/billing/razorpay", () => ({ isConfigured: () => false, verifyPaymentSignature: vi.fn() }));

import { setPlanManuallyAction } from "./billing";

describe("setPlanManuallyAction", () => {
  beforeEach(() => setPlan.mockReset());
  afterEach(() => { vi.unstubAllEnvs(); });

  it("refuses in production even with billing unconfigured and the flag set", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("BILLING_TEST_MODE", "1");
    const r = await setPlanManuallyAction("unlimited");
    expect(r.ok).toBe(false);
    expect(setPlan).not.toHaveBeenCalled();
  });

  it("refuses without BILLING_TEST_MODE", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("BILLING_TEST_MODE", "");
    expect((await setPlanManuallyAction("unlimited")).ok).toBe(false);
  });

  it("works locally with the flag and no Razorpay keys", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("BILLING_TEST_MODE", "1");
    expect((await setPlanManuallyAction("unlimited")).ok).toBe(true);
    expect(setPlan).toHaveBeenCalled();
  });
});

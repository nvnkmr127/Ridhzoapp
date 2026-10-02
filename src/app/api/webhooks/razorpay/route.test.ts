import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// M11: each Razorpay event id is handled once; a failed attempt is retried.
const handle = vi.fn();
const rows = new Map<string, { id: string; status: string }>();
vi.mock("@/lib/billing/razorpay", () => ({ verifyWebhookSignature: () => true }));
vi.mock("@/domains/billing/service", () => ({ BillingService: { handleWebhook: (...a: unknown[]) => handle(...a) } }));
vi.mock("drizzle-orm", () => ({ and: (...a: unknown[]) => a, eq: (_c: unknown, v: unknown) => v }));
vi.mock("@/db/schema", () => ({ webhookEvents: { provider: "p", idempotencyKey: "k", id: "id", status: "s" } }));
vi.mock("@/db", () => ({
  db: {
    insert: () => ({ values: (v: { idempotencyKey: string }) => ({ onConflictDoNothing: () => ({ returning: async () => {
      if (rows.has(v.idempotencyKey)) return [];
      rows.set(v.idempotencyKey, { id: "row-" + v.idempotencyKey, status: "processing" });
      return [{ id: "row-" + v.idempotencyKey }];
    } }) }) }),
    select: () => ({ from: () => ({ where: () => ({ limit: async () => [...rows.values()] }) }) }),
    update: () => ({ set: (v: { status: string }) => ({ where: async () => { for (const r of rows.values()) r.status = v.status; } }) }),
  },
}));

import { POST } from "./route";

const call = () => POST(new NextRequest("http://x/api/webhooks/razorpay", { method: "POST", headers: { "x-razorpay-signature": "s", "x-razorpay-event-id": "evt_1" }, body: JSON.stringify({ event: "subscription.charged", payload: { subscription: { entity: { id: "sub_1" } } } }) }));

describe("razorpay webhook ledger", () => {
  beforeEach(() => { rows.clear(); handle.mockReset(); });

  it("processes an event once, answering repeats as duplicates", async () => {
    handle.mockResolvedValue(undefined);
    expect((await (await call()).json()).duplicate).toBeUndefined();
    expect((await (await call()).json()).duplicate).toBe(true);
    expect(handle).toHaveBeenCalledTimes(1);
  });

  it("retries an event whose earlier attempt failed", async () => {
    handle.mockRejectedValueOnce(new Error("db down")).mockResolvedValue(undefined);
    expect((await call()).status).toBe(500);
    expect((await call()).status).toBe(200);
    expect(handle).toHaveBeenCalledTimes(2);
  });
});

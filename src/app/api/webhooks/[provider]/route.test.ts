import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createHmac } from "crypto";

const SECRET = "s3cret";
const SOURCE_ID = "11111111-2222-4333-8444-555555555555";
let source: any;
const inserted: any[] = [];

vi.mock("@/lib/rate-limit", () => ({ RateLimiter: { checkLimit: async () => ({ success: true, limit: 100, remaining: 99, reset: 0 }) } }));
vi.mock("@/lib/jobs/workers/ingestionWorker", () => ({ ingestionQueue: { add: vi.fn() } }));
vi.mock("@/domains/leads/sourceService", () => ({ LeadSourceService: { getSource: async () => source } }));
vi.mock("@/db", () => ({
  db: {
    insert: () => ({ values: (v: any) => { inserted.push(v); return { onConflictDoNothing: () => ({ returning: async () => [{ id: "evt-1" }] }) }; } }),
  },
}));

import { POST } from "./route";

const call = (provider: string, init: { body: string; type: string; query?: string; headers?: Record<string, string> }) =>
  POST(
    new NextRequest(`http://x/api/webhooks/${provider}?sourceId=${SOURCE_ID}${init.query ?? ""}`, {
      method: "POST",
      body: init.body,
      headers: { "content-type": init.type, ...(init.headers ?? {}) },
    }),
    { params: Promise.resolve({ provider }) },
  );

describe("generic lead webhook", () => {
  beforeEach(() => {
    source = { id: SOURCE_ID, type: "generic_webhook", isActive: 1, organizationId: "org-1", webhookSecret: SECRET };
    inserted.length = 0;
  });

  it("accepts a form-encoded post authenticated by ?key= (WordPress/Elementor style)", async () => {
    const res = await call("generic_webhook", { body: "Name=Ada&Email=ada%40x.com&Message=", type: "application/x-www-form-urlencoded", query: `&key=${SECRET}` });
    expect(res.status).toBe(202);
    expect(inserted[0].payload).toMatchObject({ Name: "Ada", Email: "ada@x.com", sourceId: SOURCE_ID });
    expect(inserted[0].payload).not.toHaveProperty("Message"); // empty fields dropped
  });

  it("still accepts a signed JSON post", async () => {
    const body = JSON.stringify({ name: "Ada", email: "ada@x.com" });
    const sig = "sha256=" + createHmac("sha256", SECRET).update(body).digest("hex");
    const res = await call("generic_webhook", { body, type: "application/json", headers: { "x-hub-signature-256": sig } });
    expect(res.status).toBe(202);
  });

  it("rejects a wrong key and an unauthenticated post", async () => {
    expect((await call("generic_webhook", { body: "name=a", type: "application/x-www-form-urlencoded", query: "&key=nope" })).status).toBe(401);
    expect((await call("generic_webhook", { body: "name=a", type: "application/x-www-form-urlencoded" })).status).toBe(401);
  });

  it("rejects a provider that doesn't match the source's type", async () => {
    const res = await call("webform", { body: "name=a", type: "application/x-www-form-urlencoded", query: `&key=${SECRET}` });
    expect(res.status).toBe(403);
  });
});

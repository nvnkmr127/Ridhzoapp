// Needs a throwaway Postgres with migrations applied:
//   SYNC_TEST_DATABASE_URL=postgresql://… npx vitest run src/app/api/v1/leads/sync.integration.test.ts
import { beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const url = process.env.SYNC_TEST_DATABASE_URL;
if (url) process.env.DATABASE_URL = url;

const auth = { organizationId: "", userId: "" as string | null, roleId: null as string | null };
vi.mock("@/lib/apiAuth", () => ({ authorizeApiRequest: async () => auth }));

describe.skipIf(!url)("GET /api/v1/leads?sync=1 (phone incremental sync)", () => {
  let db: typeof import("@/db").db;
  let leads: typeof import("@/db/schema").leads;
  let GET: typeof import("./route").GET;
  let other = "";

  const feed = async (after?: string | null, limit = 200) => {
    const res = await GET(new NextRequest(`http://x/api/v1/leads?sync=1&limit=${limit}${after ? `&after=${encodeURIComponent(after)}` : ""}`));
    expect(res.status).toBe(200);
    return (await res.json()) as { data: { id: string; name?: string; gone: boolean }[]; next: string | null; done: boolean };
  };

  beforeAll(async () => {
    ({ db } = await import("@/db"));
    ({ leads } = await import("@/db/schema"));
    ({ GET } = await import("./route"));
    const { organizations, users } = await import("@/db/schema");
    const [org] = await db.insert(organizations).values({ name: "Sync", slug: `sync-${Date.now()}` }).returning();
    const [me, them] = await db
      .insert(users)
      .values([
        { email: `me-${Date.now()}@x.io`, passwordHash: "x", organizationId: org.id },
        { email: `them-${Date.now()}@x.io`, passwordHash: "x", organizationId: org.id },
      ] as any)
      .returning();
    Object.assign(auth, { organizationId: org.id, userId: me.id });
    other = them.id;
  });

  it("pages every change once, then only what changed after the cursor — deletes and reassignments as gone", async () => {
    const { LeadService } = await import("@/domains/leads/service");
    const { eq } = await import("drizzle-orm");
    // Inserted by now() (µs precision) — the ms cursor must neither skip nor repeat them.
    const made = await db
      .insert(leads)
      .values(Array.from({ length: 5 }, (_, i) => ({ organizationId: auth.organizationId, name: `L${i}`, ownerId: auth.userId, customData: { _aiRecap: "big", note: i } })))
      .returning();

    const seen: string[] = [];
    let after: string | null = null;
    for (;;) {
      const page = await feed(after, 2);
      seen.push(...page.data.map((d) => d.id));
      after = page.next;
      if (page.done) break;
    }
    expect(seen.sort()).toEqual(made.map((m) => m.id).sort());
    expect((await feed(after)).data).toEqual([]); // nothing new

    await LeadService.deleteLead(made[0].id, auth.userId!, auth.organizationId);
    await db.update(leads).set({ ownerId: other, updatedAt: new Date() }).where(eq(leads.id, made[1].id));
    await LeadService.updateLead(made[2].id, { name: "Renamed" }, auth.userId!, auth.organizationId);

    const delta = await feed(after);
    expect(delta.done).toBe(true);
    expect(Object.fromEntries(delta.data.map((d) => [d.id, d.gone ? "gone" : d.name]))).toEqual({
      [made[0].id]: "gone", // deleted
      [made[1].id]: "gone", // not this rep's any more
      [made[2].id]: "Renamed",
    });
    const renamed = delta.data.find((d) => d.id === made[2].id) as any;
    expect(renamed.customData).toEqual({ note: 2 }); // server-internal blobs stay off the phone
  });

  it("PATCH with base: merges untouched fields, refuses a field changed elsewhere (409)", async () => {
    const { PATCH } = await import("./[id]/route");
    const saved = { ...auth };
    auth.userId = null; // API-key caller: no role checks in the way
    try {
      const [l] = await db.insert(leads).values({ organizationId: auth.organizationId, name: "Asha", company: "Acme" }).returning();
      const patch = (body: unknown) =>
        PATCH(new NextRequest(`http://x/api/v1/leads/${l.id}`, { method: "PATCH", body: JSON.stringify(body) }), { params: Promise.resolve({ id: l.id }) });

      const ok = await patch({ name: "Asha R", base: { name: "Asha" } });
      expect(ok.status).toBe(200);
      const clash = await patch({ company: "Beta", base: { company: "Old Co" } }); // the web moved it to Acme
      expect(clash.status).toBe(409);
      expect((await clash.json()).conflicts).toEqual([{ field: "company", server: "Acme" }]);
      expect((await patch({ company: "Beta" })).status).toBe(200); // "keep mine": sent without base
    } finally {
      Object.assign(auth, saved);
    }
  });

  it("POST with an Idempotency-Key creates the lead once", async () => {
    const { POST } = await import("./route");
    const saved = { ...auth };
    auth.userId = null;
    try {
      const key = crypto.randomUUID();
      const post = () =>
        POST(new NextRequest("http://x/api/v1/leads", { method: "POST", body: JSON.stringify({ name: "Once" }), headers: { "Idempotency-Key": key } }));
      const [a, b] = [await post(), await post()];
      expect(a.status).toBe(201);
      expect(b.headers.get("Idempotent-Replayed")).toBe("true");
      expect((await b.json()).data.id).toBe((await a.json()).data.id);
    } finally {
      Object.assign(auth, saved);
    }
  });
});

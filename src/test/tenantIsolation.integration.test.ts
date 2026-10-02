// Real-database tenant isolation checks (the unit tests mock the DB, so they can't prove a WHERE clause).
// Needs a throwaway Postgres with migrations applied:
//   SYNC_TEST_DATABASE_URL=postgresql://… npx vitest run src/test/tenantIsolation.integration.test.ts
import { beforeAll, describe, expect, it } from "vitest";

const url = process.env.SYNC_TEST_DATABASE_URL;
if (url) process.env.DATABASE_URL = url;

describe.skipIf(!url)("tenant isolation (real Postgres)", () => {
  let A = "", B = "", leadB = "", followUpB = "", tagB = "";
  let ActivityService: typeof import("@/domains/activities/service").ActivityService;
  let WhatsAppService: typeof import("@/lib/messaging/whatsapp/service").WhatsAppService;
  let FollowUpService: typeof import("@/domains/follow-ups/service").FollowUpService;
  let TagService: typeof import("@/domains/tags/service").TagService;
  let SequenceService: typeof import("@/domains/leads/sequenceService").SequenceService;
  let db: typeof import("@/db").db;
  let schema: typeof import("@/db/schema");

  beforeAll(async () => {
    ({ db } = await import("@/db"));
    schema = await import("@/db/schema");
    ({ ActivityService } = await import("@/domains/activities/service"));
    ({ WhatsAppService } = await import("@/lib/messaging/whatsapp/service"));
    ({ FollowUpService } = await import("@/domains/follow-ups/service"));
    ({ TagService } = await import("@/domains/tags/service"));
    ({ SequenceService } = await import("@/domains/leads/sequenceService"));
    const s = Date.now();
    const [a, b] = await db.insert(schema.organizations).values([{ name: "A", slug: `iso-a-${s}` }, { name: "B", slug: `iso-b-${s}` }]).returning();
    A = a.id; B = b.id;
    const [lb] = await db.insert(schema.leads).values({ organizationId: B, name: "B lead", phone: "+919000000001" }).returning();
    leadB = lb.id;
    await db.insert(schema.whatsappMessages).values({ leadId: leadB, direction: "outbound", body: "secret", status: "sent" });
    const [fu] = await db.insert(schema.followUps).values({ leadId: leadB, type: "call", title: "B call", status: "pending", dueAt: new Date(Date.now() + 3600_000) }).returning();
    followUpB = fu.id;
    const [tg] = await db.insert(schema.tags).values({ organizationId: B, name: "vip" }).returning();
    tagB = tg.id;
    await db.insert(schema.leadTags).values({ leadId: leadB, tagId: tagB });
  });

  it("refuses to attach an activity to another workspace's lead, and allows its own", async () => {
    await expect(ActivityService.addActivity({ organizationId: A, leadId: leadB, type: "note", content: "x" })).rejects.toThrow(/not found/i);
    await expect(ActivityService.addActivity({ organizationId: B, leadId: leadB, type: "note", content: "ok" })).resolves.toBeDefined();
  });

  it("does not list another workspace's WhatsApp thread or sequences", async () => {
    expect(await WhatsAppService.listForLead(leadB, A)).toEqual([]);
    expect((await WhatsAppService.listForLead(leadB, B)).length).toBe(1);
    expect(await SequenceService.listForLead(leadB, A)).toEqual([]);
  });

  it("will not complete another workspace's follow-up", async () => {
    expect(await FollowUpService.completeFollowUp(followUpB, A)).toBeUndefined();
    const [row] = await db.select({ status: schema.followUps.status }).from(schema.followUps).where((await import("drizzle-orm")).eq(schema.followUps.id, followUpB));
    expect(row.status).toBe("pending");
  });

  it("will not remove a tag through another workspace", async () => {
    await expect(TagService.removeFromLead(leadB, tagB, A)).rejects.toThrow();
    const rows = await db.select().from(schema.leadTags).where((await import("drizzle-orm")).eq(schema.leadTags.leadId, leadB));
    expect(rows.length).toBe(1);
  });
});

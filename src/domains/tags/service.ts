import { db } from "@/db";
import { tags, leadTags, leads } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { assertLeadInOrg } from "@/domains/leads/ownership";

export class TagService {
  static async listAll(organizationId: string) {
    return db.select().from(tags).where(eq(tags.organizationId, organizationId)).orderBy(tags.name);
  }

  static async getForLead(leadId: string) {
    return db
      .select({ id: tags.id, name: tags.name })
      .from(leadTags)
      .innerJoin(tags, eq(leadTags.tagId, tags.id))
      .where(eq(leadTags.leadId, leadId));
  }

  // Find-or-create the tag by name, then link it to the lead (idempotent both steps).
  static async addToLead(leadId: string, rawName: string, organizationId: string) {
    const name = rawName.trim();
    if (!name) throw new Error("Tag name required");
    await assertLeadInOrg(leadId, organizationId);

    let [tag] = await db.select().from(tags).where(and(eq(tags.organizationId, organizationId), eq(tags.name, name))).limit(1);
    if (!tag) {
      // onConflictDoNothing covers the race where two leads create the same new tag at once.
      await db.insert(tags).values({ organizationId, name }).onConflictDoNothing();
      [tag] = await db.select().from(tags).where(and(eq(tags.organizationId, organizationId), eq(tags.name, name))).limit(1);
    }

    // The (lead_id, tag_id) PK makes this a no-op on re-add and safe under a concurrent double-add.
    await db.insert(leadTags).values({ leadId, tagId: tag.id }).onConflictDoNothing();
    return { id: tag.id, name: tag.name };
  }

  static async removeFromLead(leadId: string, tagId: string, organizationId: string) {
    await assertLeadInOrg(leadId, organizationId);
    await db.delete(leadTags).where(and(eq(leadTags.leadId, leadId), eq(leadTags.tagId, tagId)));
  }

  static async bulkAddToLeads(leadIds: string[], rawName: string, organizationId: string) {
    const name = rawName.trim();
    if (!name || leadIds.length === 0) return [];
    // Keep only leads the caller's org actually owns.
    const owned = await db
      .select({ id: leads.id })
      .from(leads)
      .where(and(eq(leads.organizationId, organizationId), inArray(leads.id, leadIds)));
    leadIds = owned.map((l) => l.id);
    if (leadIds.length === 0) return [];

    let [tag] = await db.select().from(tags).where(and(eq(tags.organizationId, organizationId), eq(tags.name, name))).limit(1);
    if (!tag) {
      await db.insert(tags).values({ organizationId, name }).onConflictDoNothing();
      [tag] = await db.select().from(tags).where(and(eq(tags.organizationId, organizationId), eq(tags.name, name))).limit(1);
    }
    const values = leadIds.map((leadId) => ({ leadId, tagId: tag.id }));
    await db.insert(leadTags).values(values).onConflictDoNothing();
    return tag;
  }

  static async bulkRemoveFromLeads(leadIds: string[], tagId: string, organizationId: string) {
    if (leadIds.length === 0 || !tagId) return;
    const owned = await db
      .select({ id: leads.id })
      .from(leads)
      .where(and(eq(leads.organizationId, organizationId), inArray(leads.id, leadIds)));
    leadIds = owned.map((l) => l.id);
    if (leadIds.length === 0) return;
    await db.delete(leadTags).where(and(inArray(leadTags.leadId, leadIds), eq(leadTags.tagId, tagId)));
  }
}

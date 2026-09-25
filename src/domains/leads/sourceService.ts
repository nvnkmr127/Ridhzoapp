import { db } from "@/db";
import { leadSources, leads, assignmentRules } from "@/db/schema/leads";
import { leadDistributionRules } from "@/db/schema/integrations";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import crypto from "crypto";
import { encryptSecret } from "@/lib/crypto/secret";

export class LeadSourceService {
  static async getSources(organizationId: string) {
    if (!organizationId) return [];
    return db.select().from(leadSources).where(eq(leadSources.organizationId, organizationId));
  }

  /** Lead counts per source: total live, unworked "new", and recycle-bin (soft-deleted). */
  static async getLeadCounts(
    sourceIds: string[],
    organizationId?: string,
  ): Promise<Record<string, { total: number; new: number; deleted: number }>> {
    if (sourceIds.length === 0) return {};
    const conditions = [inArray(leads.sourceId, sourceIds)];
    if (organizationId) conditions.push(eq(leads.organizationId, organizationId));
    const rows = await db
      .select({
        sourceId: leads.sourceId,
        total: sql<number>`count(*) filter (where ${leads.deletedAt} is null)`,
        newCount: sql<number>`count(*) filter (where ${leads.deletedAt} is null and ${leads.status} = 'new')`,
        deleted: sql<number>`count(*) filter (where ${leads.deletedAt} is not null)`,
      })
      .from(leads)
      .where(and(...conditions))
      .groupBy(leads.sourceId);
    const out: Record<string, { total: number; new: number; deleted: number }> = {};
    for (const r of rows) {
      if (r.sourceId) out[r.sourceId] = { total: Number(r.total), new: Number(r.newCount), deleted: Number(r.deleted) };
    }
    return out;
  }

  static async getSource(id: string) {
    const [source] = await db.select().from(leadSources).where(eq(leadSources.id, id)).limit(1);
    return source;
  }

  static async createSource(data: { name: string; type: string; organizationId: string; config?: any }) {
    if (!data.organizationId) {
      throw new Error("organizationId is required to create a lead source");
    }
    const { PlanService } = await import("@/domains/billing/planService");
    await PlanService.assertCanAdd(data.organizationId, "sources");
    const webhookSecret = crypto.randomBytes(32).toString("hex");
    
    const [source] = await db.insert(leadSources).values({
      name: data.name,
      type: data.type,
      organizationId: data.organizationId,
      config: data.config || {},
      webhookSecret,
    }).returning();
    
    return source;
  }

  // Deletes a source after detaching it from existing leads (FK is NO ACTION, so we null it)
  // and removing its assignment + alert rules (FKs are NO ACTION). Existing leads are kept, just un-sourced.
  // Alert rules are deleted, not widened to "any source", so recipients don't suddenly get every lead.
  static async deleteSource(id: string, organizationId: string) {
    await db.update(leads).set({ sourceId: null })
      .where(and(eq(leads.sourceId, id), eq(leads.organizationId, organizationId)));
    await db.delete(assignmentRules).where(eq(assignmentRules.sourceId, id));
    await db.delete(leadDistributionRules)
      .where(and(eq(leadDistributionRules.sourceId, id), eq(leadDistributionRules.organizationId, organizationId)));
    await db.delete(leadSources).where(and(eq(leadSources.id, id), eq(leadSources.organizationId, organizationId)));
    return { ok: true };
  }

  // Upsert a Facebook Lead Ads source for this org, keyed by Page id, storing the current Page
  // access token in `config`. Called from the OAuth callback after a successful connection.
  static async upsertFacebookPageSource(
    organizationId: string,
    page: { pageId: string; pageAccessToken: string; expiresAt?: Date | null; name?: string },
  ) {
    // A Facebook Page belongs to exactly one org. If another org already connected it, refuse —
    // otherwise ingestion for that Page becomes ambiguous and gets blocked for both tenants.
    const conflict = await db
      .select({ id: leadSources.id })
      .from(leadSources)
      .where(
        and(
          eq(leadSources.type, "facebook_lead_ads"),
          ne(leadSources.organizationId, organizationId),
          sql`${leadSources.config}->>'pageId' = ${page.pageId}`,
        ),
      )
      .limit(1);
    if (conflict.length > 0) {
      throw new Error("This Facebook Page is already connected by another organization.");
    }

    const rows = await db
      .select()
      .from(leadSources)
      .where(and(eq(leadSources.organizationId, organizationId), eq(leadSources.type, "facebook_lead_ads")));
    const existing = rows.find((s) => (s.config as any)?.pageId === page.pageId);
    // Merge onto any existing config so reconnecting (token refresh / re-auth) preserves the
    // user's formFilter and other settings instead of wiping them. Reconnecting also clears any
    // "needs reconnect" flag a prior auth failure raised.
    const config = {
      ...((existing?.config as Record<string, unknown>) ?? {}),
      pageId: page.pageId,
      // Encrypt the Page access token at rest; every read path decrypts via readSecret.
      pageAccessToken: encryptSecret(page.pageAccessToken),
      expiresAt: page.expiresAt ? page.expiresAt.toISOString() : null,
      needsReconnect: false,
    };
    if (existing) {
      const [updated] = await db
        .update(leadSources)
        .set({ config, isActive: 1, ...(page.name ? { name: page.name } : {}) })
        .where(eq(leadSources.id, existing.id))
        .returning();
      return updated;
    }
    return this.createSource({ name: page.name || `Facebook Page ${page.pageId}`, type: "facebook_lead_ads", organizationId, config });
  }

  static async updateSource(
    id: string,
    data: { name?: string; isActive?: number; config?: any },
    organizationId?: string,
  ) {
    const scope = organizationId
      ? and(eq(leadSources.id, id), eq(leadSources.organizationId, organizationId))
      : eq(leadSources.id, id);
    const [updated] = await db.update(leadSources)
      .set(data)
      .where(scope)
      .returning();

    return updated;
  }

  /** Flags a source as needing re-auth (dead Meta token) and deactivates it, so ingestion stops
   *  wasting Graph calls and the UI can prompt a reconnect instead of failing silently. */
  static async markNeedsReconnect(id: string) {
    const [source] = await db.select().from(leadSources).where(eq(leadSources.id, id)).limit(1);
    if (!source) return;
    const config = { ...((source.config as Record<string, unknown>) ?? {}), needsReconnect: true, webhookSubscribed: false };
    await db.update(leadSources).set({ config, isActive: 0 }).where(eq(leadSources.id, id));
  }
}

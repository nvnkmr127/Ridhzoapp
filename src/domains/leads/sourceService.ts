import { db } from "@/db";
import { leadSources, leads, assignmentRules } from "@/db/schema/leads";
import { and, eq, count, inArray, isNull } from "drizzle-orm";
import crypto from "crypto";

export class LeadSourceService {
  static async getSources(organizationId?: string) {
    if (organizationId) {
      return db.select().from(leadSources).where(eq(leadSources.organizationId, organizationId));
    }
    return db.select().from(leadSources);
  }

  /** Count of live (non-deleted) leads per source, for the given source ids. */
  static async getLeadCounts(sourceIds: string[]): Promise<Record<string, number>> {
    if (sourceIds.length === 0) return {};
    const rows = await db
      .select({ sourceId: leads.sourceId, c: count() })
      .from(leads)
      .where(and(inArray(leads.sourceId, sourceIds), isNull(leads.deletedAt)))
      .groupBy(leads.sourceId);
    const out: Record<string, number> = {};
    for (const r of rows) if (r.sourceId) out[r.sourceId] = Number(r.c);
    return out;
  }

  static async getSource(id: string) {
    const [source] = await db.select().from(leadSources).where(eq(leadSources.id, id)).limit(1);
    return source;
  }

  static async createSource(data: { name: string; type: string; organizationId?: string; config?: any }) {
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
  // and removing its assignment rules. Existing leads are kept, just un-sourced.
  static async deleteSource(id: string, organizationId: string) {
    await db.update(leads).set({ sourceId: null })
      .where(and(eq(leads.sourceId, id), eq(leads.organizationId, organizationId)));
    await db.delete(assignmentRules).where(eq(assignmentRules.sourceId, id));
    await db.delete(leadSources).where(and(eq(leadSources.id, id), eq(leadSources.organizationId, organizationId)));
    return { ok: true };
  }

  // Upsert a Facebook Lead Ads source for this org, keyed by Page id, storing the current Page
  // access token in `config`. Called from the OAuth callback after a successful connection.
  static async upsertFacebookPageSource(
    organizationId: string,
    page: { pageId: string; pageAccessToken: string; expiresAt?: Date | null; name?: string },
  ) {
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
      pageAccessToken: page.pageAccessToken,
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
    const config = { ...((source.config as Record<string, unknown>) ?? {}), needsReconnect: true };
    await db.update(leadSources).set({ config, isActive: 0 }).where(eq(leadSources.id, id));
  }
}

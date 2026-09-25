import { db } from "@/db";
import { leadSources, leads, assignmentRules } from "@/db/schema/leads";
import { leadDistributionRules, webhookEvents } from "@/db/schema/integrations";
import { users, teams } from "@/db/schema/users";
import { and, eq, gt, inArray, isNull, ne, sql } from "drizzle-orm";
import crypto from "crypto";
import { encryptSecret, readSecret } from "@/lib/crypto/secret";
import { UserFacingError } from "@/lib/actions/result";

// How new leads from a source get an owner. "none" = unassigned; "user" = always this person;
// "team" = take turns across the team's active members (AssignmentService does the rotation).
export type SourceAssignment = { mode: "none" } | { mode: "user"; userId: string } | { mode: "team"; teamId: string };

// Source types whose setup uses the per-source webhook URL + secret (Facebook posts to the app-level
// /api/webhooks/facebook endpoint instead, and web forms post from the hosted /f/<id> page).
export const WEBHOOK_SOURCE_TYPES = new Set(["generic_webhook", "google_lead_ads"]);

// What the browser needs, and no more: never the (encrypted) Facebook Page token, and the secret
// only for sources whose setup actually uses it.
export function toClientSource(s: typeof leadSources.$inferSelect) {
  const config = { ...((s.config ?? {}) as Record<string, unknown>) };
  delete config.pageAccessToken;
  return {
    id: s.id,
    name: s.name,
    type: s.type,
    isActive: s.isActive,
    webhookSecret: WEBHOOK_SOURCE_TYPES.has(s.type ?? "") ? s.webhookSecret : null,
    config,
  };
}

export class LeadSourceService {
  static async getSources(organizationId: string) {
    if (!organizationId) return [];
    return db.select().from(leadSources).where(eq(leadSources.organizationId, organizationId));
  }

  /** Lead counts per source: total live, unworked "new", recycle-bin (soft-deleted), and when the last one arrived. */
  static async getLeadCounts(
    sourceIds: string[],
    organizationId?: string,
  ): Promise<Record<string, { total: number; new: number; deleted: number; lastAt: string | null }>> {
    if (sourceIds.length === 0) return {};
    const conditions = [inArray(leads.sourceId, sourceIds)];
    if (organizationId) conditions.push(eq(leads.organizationId, organizationId));
    const rows = await db
      .select({
        sourceId: leads.sourceId,
        total: sql<number>`count(*) filter (where ${leads.deletedAt} is null)`,
        newCount: sql<number>`count(*) filter (where ${leads.deletedAt} is null and ${leads.status} = 'new')`,
        deleted: sql<number>`count(*) filter (where ${leads.deletedAt} is not null)`,
        lastAt: sql<string | null>`max(${leads.createdAt})`,
      })
      .from(leads)
      .where(and(...conditions))
      .groupBy(leads.sourceId);
    const out: Record<string, { total: number; new: number; deleted: number; lastAt: string | null }> = {};
    for (const r of rows) {
      if (r.sourceId) {
        out[r.sourceId] = {
          total: Number(r.total),
          new: Number(r.newCount),
          deleted: Number(r.deleted),
          lastAt: r.lastAt ? new Date(r.lastAt).toISOString() : null,
        };
      }
    }
    return out;
  }

  /** Deliveries that failed in the last 7 days, per source — the "leads are failing" signal on each card. */
  static async recentFailures(organizationId: string): Promise<Record<string, number>> {
    const sources = await this.getSources(organizationId);
    if (sources.length === 0) return {};
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const bySourceId = new Map(sources.map((s) => [s.id, s.id]));
    const byPageId = new Map(
      sources.filter((s) => s.type === "facebook_lead_ads" && (s.config as any)?.pageId).map((s) => [String((s.config as any).pageId), s.id]),
    );
    // ponytail: scans the week's failed events (small); add an index on (status, created_at) if it grows.
    const rows = await db
      .select({ sourceId: sql<string | null>`${webhookEvents.payload}->>'sourceId'`, pageId: sql<string | null>`${webhookEvents.payload}->>'page_id'` })
      .from(webhookEvents)
      .where(and(eq(webhookEvents.status, "failed"), gt(webhookEvents.createdAt, since)));
    const out: Record<string, number> = {};
    for (const r of rows) {
      const id = (r.sourceId && bySourceId.get(r.sourceId)) || (r.pageId && byPageId.get(r.pageId));
      if (id) out[id] = (out[id] ?? 0) + 1;
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
  // A Facebook Page is also unsubscribed from Meta's lead webhooks (best-effort), so Meta stops
  // sending leads for a source that no longer exists. Returns the deleted row, or undefined.
  static async deleteSource(id: string, organizationId: string) {
    const [source] = await db.select().from(leadSources).where(and(eq(leadSources.id, id), eq(leadSources.organizationId, organizationId))).limit(1);
    if (!source) return undefined;
    await db.update(leads).set({ sourceId: null })
      .where(and(eq(leads.sourceId, id), eq(leads.organizationId, organizationId)));
    await db.delete(assignmentRules).where(eq(assignmentRules.sourceId, id));
    await db.delete(leadDistributionRules)
      .where(and(eq(leadDistributionRules.sourceId, id), eq(leadDistributionRules.organizationId, organizationId)));
    await db.delete(leadSources).where(and(eq(leadSources.id, id), eq(leadSources.organizationId, organizationId)));

    const cfg = (source.config as Record<string, any>) ?? {};
    if (source.type === "facebook_lead_ads" && cfg.pageId && cfg.pageAccessToken) {
      try {
        const { MetaTokenRefreshService } = await import("@/domains/leads/metaTokenRefreshService");
        await MetaTokenRefreshService.unsubscribePageFromLeadgen(cfg.pageId, readSecret(cfg.pageAccessToken)!);
      } catch (e) {
        console.warn("[sources] couldn't unsubscribe deleted Page from leadgen (non-fatal)", (e as Error)?.message);
      }
    }
    return source;
  }

  // Upsert a Facebook Lead Ads source for this org, keyed by Page id, storing the current Page
  // access token in `config`. Called after the user picks Pages in the connect dialog.
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
    // Patch (not replace) the config so reconnecting (token refresh / re-auth) preserves the user's
    // formFilter and other settings. Reconnecting also clears any "needs reconnect" flag.
    const patch = {
      pageId: page.pageId,
      // Encrypt the Page access token at rest; every read path decrypts via readSecret.
      pageAccessToken: encryptSecret(page.pageAccessToken),
      expiresAt: page.expiresAt ? page.expiresAt.toISOString() : null,
      needsReconnect: false,
    };
    if (existing) {
      return this.updateSource(existing.id, { isActive: 1, configPatch: patch, ...(page.name ? { name: page.name } : {}) }, organizationId);
    }
    return this.createSource({ name: page.name || `Facebook Page ${page.pageId}`, type: "facebook_lead_ads", organizationId, config: patch });
  }

  // `configPatch` is merged into the stored config in SQL (jsonb ||), never read-modify-written, so a
  // long-running sync or a concurrent save can't overwrite keys it didn't touch. Returns the updated
  // row, or undefined when no source matched (callers report NOT_FOUND).
  static async updateSource(
    id: string,
    data: { name?: string; isActive?: number; configPatch?: Record<string, unknown> },
    organizationId?: string,
  ) {
    const scope = organizationId
      ? and(eq(leadSources.id, id), eq(leadSources.organizationId, organizationId))
      : eq(leadSources.id, id);
    const { configPatch, ...rest } = data;
    const set: Record<string, unknown> = { ...rest };
    if (configPatch) set.config = sql`coalesce(${leadSources.config}, '{}'::jsonb) || ${JSON.stringify(configPatch)}::jsonb`;
    const [updated] = await db.update(leadSources)
      .set(set)
      .where(scope)
      .returning();

    return updated;
  }

  /** Flags a source as needing re-auth (dead Meta token) and deactivates it, so ingestion stops
   *  wasting Graph calls and the UI can prompt a reconnect instead of failing silently. */
  static async markNeedsReconnect(id: string) {
    await this.updateSource(id, { isActive: 0, configPatch: { needsReconnect: true, webhookSubscribed: false } });
  }

  // New webhook/Google key. The old one stops working immediately.
  static async regenerateSecret(id: string, organizationId: string) {
    const [row] = await db
      .update(leadSources)
      .set({ webhookSecret: crypto.randomBytes(32).toString("hex") })
      .where(and(eq(leadSources.id, id), eq(leadSources.organizationId, organizationId)))
      .returning();
    return row;
  }

  // --- Automatic owner assignment (one rule per source; AssignmentService applies it on ingest) ---

  static async getAssignments(organizationId: string): Promise<Record<string, SourceAssignment>> {
    const rows = await db
      .select({ sourceId: assignmentRules.sourceId, type: assignmentRules.type, userId: assignmentRules.userId, teamId: assignmentRules.teamId })
      .from(assignmentRules)
      .innerJoin(leadSources, eq(leadSources.id, assignmentRules.sourceId))
      .where(eq(leadSources.organizationId, organizationId));
    const out: Record<string, SourceAssignment> = {};
    for (const r of rows) {
      if (!r.sourceId) continue;
      if (r.type === "source_round_robin" && r.teamId) out[r.sourceId] = { mode: "team", teamId: r.teamId };
      else if (r.userId) out[r.sourceId] = { mode: "user", userId: r.userId };
    }
    return out;
  }

  static async setAssignment(organizationId: string, sourceId: string, a: SourceAssignment) {
    const [source] = await db.select({ id: leadSources.id }).from(leadSources)
      .where(and(eq(leadSources.id, sourceId), eq(leadSources.organizationId, organizationId))).limit(1);
    if (!source) return undefined;
    if (a.mode === "user") {
      const [u] = await db.select({ id: users.id }).from(users)
        .where(and(eq(users.id, a.userId), eq(users.organizationId, organizationId), eq(users.isActive, true), isNull(users.deletedAt))).limit(1);
      if (!u) throw new UserFacingError("That person isn't an active member any more. Pick someone else.");
    }
    if (a.mode === "team") {
      const [t] = await db.select({ id: teams.id }).from(teams)
        .where(and(eq(teams.id, a.teamId), eq(teams.organizationId, organizationId))).limit(1);
      if (!t) throw new UserFacingError("That team no longer exists. Refresh the page.");
    }
    await db.transaction(async (tx) => {
      await tx.delete(assignmentRules).where(eq(assignmentRules.sourceId, sourceId));
      if (a.mode === "none") return;
      await tx.insert(assignmentRules).values(
        a.mode === "user"
          ? { sourceId, type: "source_direct", userId: a.userId }
          : { sourceId, type: "source_round_robin", teamId: a.teamId },
      );
    });
    return a;
  }
}

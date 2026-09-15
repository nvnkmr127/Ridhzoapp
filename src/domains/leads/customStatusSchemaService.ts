import { db } from "@/db";
import { customStatusConfigs, leads, automations, automationActions } from "@/db/schema";
import { and, eq, asc, count, isNull, sql } from "drizzle-orm";

export type StatusCategory = "open" | "in_progress" | "won" | "lost" | "unqualified";

export interface CustomStatusItem {
  id?: string;
  key: string;
  label: string;
  color: string;
  category: StatusCategory;
  orderIndex: number;
  isSystemDefault: boolean;
}

export const DEFAULT_SYSTEM_STATUSES: CustomStatusItem[] = [
  { key: "new", label: "New", color: "#3B82F6", category: "open", orderIndex: 1, isSystemDefault: true },
  { key: "active", label: "Active", color: "#10B981", category: "in_progress", orderIndex: 2, isSystemDefault: true },
  { key: "won", label: "Won", color: "#059669", category: "won", orderIndex: 3, isSystemDefault: true },
  { key: "lost", label: "Lost", color: "#EF4444", category: "lost", orderIndex: 4, isSystemDefault: true },
  { key: "unqualified", label: "Unqualified", color: "#6B7280", category: "unqualified", orderIndex: 5, isSystemDefault: true },
];

// Base-key → category, always available even before a tenant seeds its schema. Every status-driven
// decision (won/lost bookkeeping, analytics, board grouping) must resolve category through the map
// below, NOT by comparing against the literal base keys — otherwise custom statuses are invisible.
const BASE_CATEGORY: Record<string, StatusCategory> = Object.fromEntries(
  DEFAULT_SYSTEM_STATUSES.map((s) => [s.key, s.category]),
) as Record<string, StatusCategory>;

export class CustomStatusSchemaService {
  /**
   * Resolves each status key in the tenant to its category. Read-only (never seeds), and always
   * includes the five base keys so callers get a category even for tenants that haven't customised.
   */
  static async getStatusCategoryMap(organizationId: string): Promise<Map<string, StatusCategory>> {
    const map = new Map<string, StatusCategory>(Object.entries(BASE_CATEGORY) as [string, StatusCategory][]);
    const rows = await db
      .select({ key: customStatusConfigs.key, category: customStatusConfigs.category })
      .from(customStatusConfigs)
      .where(eq(customStatusConfigs.organizationId, organizationId));
    for (const r of rows) {
      if (r.key) map.set(r.key, (r.category as StatusCategory) ?? "open");
    }
    return map;
  }

  /** Category for a single status key (base fallback → 'open' for an unknown custom key). */
  static async getStatusCategory(organizationId: string, key: string): Promise<StatusCategory> {
    const map = await this.getStatusCategoryMap(organizationId);
    return map.get(key) ?? map.get(key.toLowerCase()) ?? BASE_CATEGORY[key] ?? "open";
  }

  /**
   * Retrieves tenant status schema configuration, seeding default statuses if none exist yet.
   */
  static async getTenantStatusSchema(organizationId: string): Promise<CustomStatusItem[]> {
    const existing = await db
      .select({
        id: customStatusConfigs.id,
        key: customStatusConfigs.key,
        label: customStatusConfigs.label,
        color: customStatusConfigs.color,
        category: customStatusConfigs.category,
        orderIndex: customStatusConfigs.orderIndex,
        isSystemDefault: customStatusConfigs.isSystemDefault,
      })
      .from(customStatusConfigs)
      .where(eq(customStatusConfigs.organizationId, organizationId))
      .orderBy(asc(customStatusConfigs.orderIndex));

    if (existing.length > 0) {
      return existing.map((s) => ({
        id: s.id,
        key: s.key,
        label: s.label,
        color: s.color,
        category: s.category as StatusCategory,
        orderIndex: s.orderIndex,
        isSystemDefault: s.isSystemDefault === 1,
      }));
    }

    // Seed defaults. onConflictDoNothing + the (org, key) unique index makes this safe under the
    // race where two first-loads seed at once — the loser inserts nothing instead of duplicating
    // all five rows. Re-read so we always return exactly what's persisted.
    const seedValues = DEFAULT_SYSTEM_STATUSES.map((s) => ({
      organizationId,
      key: s.key,
      label: s.label,
      color: s.color,
      category: s.category,
      orderIndex: s.orderIndex,
      isSystemDefault: 1,
    }));

    await db
      .insert(customStatusConfigs)
      .values(seedValues)
      .onConflictDoNothing({ target: [customStatusConfigs.organizationId, customStatusConfigs.key] });

    const seeded = await db
      .select({
        id: customStatusConfigs.id,
        key: customStatusConfigs.key,
        label: customStatusConfigs.label,
        color: customStatusConfigs.color,
        category: customStatusConfigs.category,
        orderIndex: customStatusConfigs.orderIndex,
        isSystemDefault: customStatusConfigs.isSystemDefault,
      })
      .from(customStatusConfigs)
      .where(eq(customStatusConfigs.organizationId, organizationId))
      .orderBy(asc(customStatusConfigs.orderIndex));

    return seeded.map((s) => ({
      id: s.id,
      key: s.key,
      label: s.label,
      color: s.color,
      category: s.category as StatusCategory,
      orderIndex: s.orderIndex,
      isSystemDefault: s.isSystemDefault === 1,
    }));
  }

  /**
   * Upserts or creates a custom status for a tenant organization.
   */
  static async addOrUpdateStatus(
    organizationId: string,
    statusItem: { key: string; label: string; color: string; category: StatusCategory; orderIndex?: number }
  ): Promise<CustomStatusItem> {
    const cleanKey = statusItem.key.toLowerCase().trim().replace(/[^a-z0-9_]/g, "_");

    const [existing] = await db
      .select()
      .from(customStatusConfigs)
      .where(
        and(
          eq(customStatusConfigs.organizationId, organizationId),
          eq(customStatusConfigs.key, cleanKey)
        )
      )
      .limit(1);

    if (existing) {
      // A system default's CATEGORY drives won/lost bookkeeping and analytics — relabel/recolor is
      // fine, but silently re-categorising e.g. "won" → "open" would corrupt that. Keep the base
      // category fixed for system rows; only custom statuses may change category on update.
      const category = existing.isSystemDefault === 1 ? (existing.category as StatusCategory) : statusItem.category;
      const [updated] = await db
        .update(customStatusConfigs)
        .set({
          label: statusItem.label,
          color: statusItem.color,
          category,
          orderIndex: statusItem.orderIndex ?? existing.orderIndex,
        })
        .where(eq(customStatusConfigs.id, existing.id))
        .returning();

      return {
        id: updated.id,
        key: updated.key,
        label: updated.label,
        color: updated.color,
        category: updated.category as StatusCategory,
        orderIndex: updated.orderIndex,
        isSystemDefault: updated.isSystemDefault === 1,
      };
    }

    const [created] = await db
      .insert(customStatusConfigs)
      .values({
        organizationId,
        key: cleanKey,
        label: statusItem.label,
        color: statusItem.color,
        category: statusItem.category,
        orderIndex: statusItem.orderIndex ?? 10,
        isSystemDefault: 0,
      })
      .returning();

    return {
      id: created.id,
      key: created.key,
      label: created.label,
      color: created.color,
      category: created.category as StatusCategory,
      orderIndex: created.orderIndex,
      isSystemDefault: false,
    };
  }

  /**
   * Deletes a custom status (system defaults cannot be deleted).
   */
  static async deleteCustomStatus(organizationId: string, statusKey: string): Promise<boolean> {
    const [existing] = await db
      .select()
      .from(customStatusConfigs)
      .where(
        and(
          eq(customStatusConfigs.organizationId, organizationId),
          eq(customStatusConfigs.key, statusKey)
        )
      )
      .limit(1);

    if (!existing) return false;
    if (existing.isSystemDefault === 1) {
      throw new Error("System default statuses cannot be deleted.");
    }

    // Don't strand leads on a status that will no longer exist (they'd render a raw key and fall out
    // of category-based logic). Require the tenant to move them off it first.
    const [{ inUse }] = await db
      .select({ inUse: count() })
      .from(leads)
      .where(and(eq(leads.organizationId, organizationId), eq(leads.status, statusKey), isNull(leads.deletedAt)));
    if (Number(inUse) > 0) {
      throw new Error(`${inUse} lead(s) still use this status. Move them to another status before deleting it.`);
    }

    // Also block if an automation would move leads INTO this status — deleting it would leave the
    // automation writing a status key that no longer exists. (Trigger/condition references are
    // lower-impact — they just stop matching — so only change_status actions are guarded here.)
    const [{ refs }] = await db
      .select({ refs: count() })
      .from(automationActions)
      .innerJoin(automations, eq(automationActions.automationId, automations.id))
      .where(and(
        eq(automations.organizationId, organizationId),
        eq(automationActions.type, "change_status"),
        sql`${automationActions.config}->>'status' = ${statusKey}`,
      ));
    if (Number(refs) > 0) {
      throw new Error(`${refs} automation(s) set leads to this status. Update those automations before deleting it.`);
    }

    await db
      .delete(customStatusConfigs)
      .where(eq(customStatusConfigs.id, existing.id));

    return true;
  }
}

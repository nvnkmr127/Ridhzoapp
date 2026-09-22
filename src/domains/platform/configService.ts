import { db } from "@/db";
import { sql } from "drizzle-orm";
import { unstable_cache, revalidateTag } from "next/cache";

const configTag = (key: string) => `platform-config:${key}`;

export interface BroadcastConfig {
  message: string;
  active: boolean;
  level: "info" | "warning" | "destructive";
  targetPlan?: "free" | "pro" | "business" | "all" | null;
  targetOrgId?: string | null;
  updatedAt?: string;
}

export function shouldShowBroadcast(
  broadcast: BroadcastConfig | null | undefined,
  currentOrg: { id: string; plan: string } | null
): boolean {
  if (!broadcast || !broadcast.active || !broadcast.message?.trim()) return false;

  // Single tenant target
  if (broadcast.targetOrgId) {
    if (!currentOrg || currentOrg.id !== broadcast.targetOrgId) return false;
  }

  // Plan target
  if (broadcast.targetPlan && broadcast.targetPlan !== "all") {
    if (!currentOrg || currentOrg.plan !== broadcast.targetPlan) return false;
  }

  return true;
}

export class PlatformConfigService {
  private static tableEnsured = false;

  private static async ensureTable(): Promise<void> {
    if (this.tableEnsured) return;
    try {
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS platform_configs (
          key VARCHAR(100) PRIMARY KEY,
          value JSONB NOT NULL,
          updated_at TIMESTAMP DEFAULT NOW() NOT NULL
        );
      `);
      this.tableEnsured = true;
    } catch (err) {
      // DB offline or missing DDL grant. Log it — otherwise get() silently returns defaults and
      // set() silently no-ops, hiding a real misconfiguration (e.g. broadcasts never persisting).
      console.error("[PlatformConfigService] ensureTable failed — config reads/writes will be no-ops", err);
    }
  }

  static async get<T>(key: string, defaultValue: T): Promise<T> {
    await this.ensureTable();
    try {
      const rows = (await db.execute(
        sql`SELECT value FROM platform_configs WHERE key = ${key} LIMIT 1`
      )) as any[];
      if (rows && rows[0] && rows[0].value !== undefined) {
        return rows[0].value as T;
      }
      return defaultValue;
    } catch {
      return defaultValue;
    }
  }

  static async set<T>(key: string, value: T): Promise<void> {
    await this.ensureTable();
    try {
      await db.execute(sql`
        INSERT INTO platform_configs (key, value, updated_at)
        VALUES (${key}, ${JSON.stringify(value)}::jsonb, NOW())
        ON CONFLICT (key) DO UPDATE
        SET value = EXCLUDED.value, updated_at = NOW();
      `);
      // Drop any cached read of this key so an admin's change (maintenance toggle, broadcast) shows
      // up on the next request instead of after the 60s TTL. No-op outside a request scope (workers).
      try { revalidateTag(configTag(key)); } catch { /* not in a request/action context */ }
    } catch (err) {
      console.error("[PlatformConfigService] failed to set", key, err);
    }
  }

  // Cached read for GLOBAL, rarely-changing keys (maintenance_mode, broadcast) that the dashboard
  // layout + banners fetch on EVERY page render. The remote DB adds ~300ms per round-trip, so serving
  // these from Next's data cache (60s TTL, invalidated by set()) removes two queries from the critical
  // path of every navigation. Do NOT use for per-tenant config (billing lifecycle) — use get().
  static async getGlobalCached<T>(key: string, defaultValue: T): Promise<T> {
    const cached = unstable_cache(
      async () => this.get<T>(key, defaultValue),
      ["platform-config", key],
      { tags: [configTag(key)], revalidate: 60 },
    );
    return cached();
  }
}

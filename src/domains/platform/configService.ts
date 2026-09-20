import { db } from "@/db";
import { sql } from "drizzle-orm";

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
    } catch (err) {
      console.error("[PlatformConfigService] failed to set", key, err);
    }
  }
}

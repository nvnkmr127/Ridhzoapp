import { db } from "@/db";
import { sql } from "drizzle-orm";

export interface BroadcastConfig {
  message: string;
  active: boolean;
  level: "info" | "warning" | "destructive";
  updatedAt?: string;
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
    } catch {
      // DB offline or permission limitation
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

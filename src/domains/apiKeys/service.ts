import { db } from "@/db";
import { apiKeys } from "@/db/schema";
import { and, desc, eq, isNull, lt, or } from "drizzle-orm";
import crypto from "crypto";

function hash(raw: string) {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

export type ApiKeyScope = "full" | "read_only";

// Don't rewrite lastUsedAt on every request — a busy key would hammer one row (lock contention +
// write amplification against the remote DB). One update per minute is plenty for a display column.
const USAGE_WRITE_THROTTLE_MS = 60_000;

export class ApiKeyService {
  static async list(organizationId: string) {
    return db
      .select({ id: apiKeys.id, name: apiKeys.name, prefix: apiKeys.prefix, scope: apiKeys.scope, lastUsedAt: apiKeys.lastUsedAt, revokedAt: apiKeys.revokedAt, createdAt: apiKeys.createdAt })
      .from(apiKeys)
      .where(eq(apiKeys.organizationId, organizationId))
      .orderBy(desc(apiKeys.createdAt));
  }

  // Returns the raw key ONCE — it is never retrievable again (only its hash is stored).
  static async create(organizationId: string, name: string, createdById: string, scope: ApiKeyScope = "full") {
    const raw = `pk_${crypto.randomBytes(24).toString("hex")}`;
    const [row] = await db
      .insert(apiKeys)
      .values({ organizationId, name, keyHash: hash(raw), prefix: raw.slice(0, 12), createdById, scope })
      .returning({ id: apiKeys.id, name: apiKeys.name, prefix: apiKeys.prefix, scope: apiKeys.scope });
    return { ...row, key: raw };
  }

  static async revoke(organizationId: string, id: string) {
    await db
      .update(apiKeys)
      .set({ revokedAt: new Date() })
      .where(and(eq(apiKeys.id, id), eq(apiKeys.organizationId, organizationId)));
  }

  // Hard delete — removes the row entirely (revoke keeps it for the audit trail; delete is for
  // clearing keys the tenant no longer wants listed). The key can't authenticate afterwards either.
  static async remove(organizationId: string, id: string) {
    await db.delete(apiKeys).where(and(eq(apiKeys.id, id), eq(apiKeys.organizationId, organizationId)));
  }

  // Resolve a raw bearer key to its org + scope. Returns null if unknown or revoked.
  // Does NOT write — the caller records usage via touchLastUsed() only once the request is allowed
  // (so a suspended/read-only-rejected request doesn't show as "used"), and best-effort so a usage
  // write failure never fails an otherwise-valid API call.
  static async verify(raw: string): Promise<{ id: string; organizationId: string; scope: ApiKeyScope } | null> {
    if (!raw?.startsWith("pk_")) return null;
    const [row] = await db
      .select({ id: apiKeys.id, organizationId: apiKeys.organizationId, scope: apiKeys.scope })
      .from(apiKeys)
      .where(and(eq(apiKeys.keyHash, hash(raw)), isNull(apiKeys.revokedAt)))
      .limit(1);
    if (!row) return null;
    return { id: row.id, organizationId: row.organizationId, scope: (row.scope as ApiKeyScope) ?? "full" };
  }

  // Best-effort, throttled usage stamp. Fire-and-forget: never awaited on the request's critical
  // path and never throws — a failed stamp must not turn a valid request into a 500.
  static touchLastUsed(id: string): void {
    const cutoff = new Date(Date.now() - USAGE_WRITE_THROTTLE_MS);
    void db
      .update(apiKeys)
      .set({ lastUsedAt: new Date() })
      .where(and(eq(apiKeys.id, id), or(isNull(apiKeys.lastUsedAt), lt(apiKeys.lastUsedAt, cutoff))))
      .catch(() => {});
  }
}

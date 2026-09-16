import { db } from "@/db";
import { auditLogs, users } from "@/db/schema";
import { and, desc, eq, lt, or } from "drizzle-orm";
import { logError } from "@/lib/log";

const DEFAULT_LIMIT = 100;

export class AuditService {
  // Best-effort: an audit write must never break the action it records.
  static async log(input: {
    organizationId: string;
    userId?: string | null;
    action: string;
    entityType?: string;
    entityId?: string | null;
    metadata?: Record<string, unknown>;
  }) {
    try {
      // Snapshot the actor's identity now, so a later rename/email change/deactivation can't
      // rewrite what this row appears to say. A lookup failure here (deleted between the request
      // starting and this write — vanishingly rare) just leaves the snapshot null; the live join
      // in list() below still has a chance to resolve it for older behavior.
      let actorName: string | null = null;
      let actorEmail: string | null = null;
      if (input.userId) {
        const [u] = await db
          .select({ firstName: users.firstName, lastName: users.lastName, email: users.email })
          .from(users)
          .where(eq(users.id, input.userId))
          .limit(1);
        if (u) {
          actorName = [u.firstName, u.lastName].filter(Boolean).join(" ") || null;
          actorEmail = u.email;
        }
      }

      await db.insert(auditLogs).values({
        organizationId: input.organizationId,
        userId: input.userId ?? null,
        actorName,
        actorEmail,
        action: input.action,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        metadata: input.metadata ?? {},
      });
    } catch (e) {
      // Routed through the same structured logger every other server-side failure uses (ref id +
      // full error, never surfaced to the client) so an audit write failure is greppable/alertable
      // the same way any other production error is, instead of a bare, unlabeled console.error.
      logError("audit.log", e, { action: input.action, organizationId: input.organizationId });
    }
  }

  // Keyset-paginated read, newest first. `cursor` is the opaque string a previous page's
  // `nextCursor` returned — pass it to fetch the next page; omit it for the first page.
  // `action` optionally restricts to one action string (exact match).
  static async list(
    organizationId: string,
    opts: { limit?: number; cursor?: string | null; action?: string } = {},
  ) {
    const limit = Math.min(Math.max(opts.limit ?? DEFAULT_LIMIT, 1), 500);
    const cursor = decodeCursor(opts.cursor);

    const where = and(
      eq(auditLogs.organizationId, organizationId),
      opts.action ? eq(auditLogs.action, opts.action) : undefined,
      cursor
        ? or(
            lt(auditLogs.createdAt, cursor.createdAt),
            and(eq(auditLogs.createdAt, cursor.createdAt), lt(auditLogs.id, cursor.id)),
          )
        : undefined,
    );

    const rows = await db
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        entityType: auditLogs.entityType,
        entityId: auditLogs.entityId,
        metadata: auditLogs.metadata,
        createdAt: auditLogs.createdAt,
        actorName: auditLogs.actorName,
        actorEmail: auditLogs.actorEmail,
        // Live join stays as a fallback for rows written before actor snapshotting existed.
        liveActorEmail: users.email,
        liveActorFirst: users.firstName,
        liveActorLast: users.lastName,
      })
      .from(auditLogs)
      .leftJoin(users, eq(auditLogs.userId, users.id))
      .where(where)
      // (created_at, id) both descending: a deterministic tiebreak when two rows share a
      // timestamp (same-transaction writes), and the sort key the keyset predicate above matches.
      .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];
    const nextCursor = hasMore && last ? encodeCursor(last.createdAt, last.id) : null;

    return { rows: page, nextCursor };
  }
}

function encodeCursor(createdAt: Date, id: string): string {
  return Buffer.from(JSON.stringify({ t: createdAt.toISOString(), id })).toString("base64url");
}

function decodeCursor(cursor: string | null | undefined): { createdAt: Date; id: string } | null {
  if (!cursor) return null;
  try {
    const { t, id } = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    if (typeof t !== "string" || typeof id !== "string") return null;
    const createdAt = new Date(t);
    if (Number.isNaN(createdAt.getTime())) return null;
    return { createdAt, id };
  } catch {
    return null; // a malformed/tampered cursor just falls back to the first page
  }
}

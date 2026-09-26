import { NextRequest, NextResponse } from "next/server";
import { and, eq, lt } from "drizzle-orm";
import { db } from "@/db";
import { apiIdempotencyKeys as keys } from "@/db/schema";
import type { ApiAuth } from "@/lib/apiAuth";

const KEY_RE = /^[A-Za-z0-9-]{8,100}$/;
// A row still "processing" after this long belongs to a request that died mid-way — take it over.
const STALE_MS = 60_000;
const WAIT_MS = 500;
const MAX_ATTEMPTS = 10;

// How long keys are kept: the app keeps queued actions for 30 days, plus a margin.
export const IDEMPOTENCY_RETENTION_DAYS = 35;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Runs handler at most once per (organization, Idempotency-Key header). A repeat gets the first
// successful response back (with Idempotent-Replayed: true). Failed responses aren't stored, so a
// retry of a request that failed runs for real. No header → handler runs as before.
export async function withIdempotency(
  req: NextRequest,
  auth: ApiAuth,
  route: string,
  handler: () => Promise<NextResponse>,
): Promise<NextResponse> {
  const key = req.headers.get("idempotency-key");
  if (!key || !KEY_RE.test(key)) return handler();
  const sameKey = and(eq(keys.organizationId, auth.organizationId), eq(keys.key, key));

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const [claimed] = await db
      .insert(keys)
      .values({ organizationId: auth.organizationId, userId: auth.userId ?? null, key, route })
      .onConflictDoNothing()
      .returning({ id: keys.id });

    if (claimed) {
      let res: NextResponse;
      try {
        res = await handler();
      } catch (e) {
        await db.delete(keys).where(eq(keys.id, claimed.id));
        throw e;
      }
      if (res.ok) {
        const body = await res.clone().json().catch(() => null);
        await db.update(keys).set({ status: res.status, response: body }).where(eq(keys.id, claimed.id));
      } else {
        await db.delete(keys).where(eq(keys.id, claimed.id));
      }
      return res;
    }

    const [row] = await db.select().from(keys).where(sameKey);
    if (!row) continue; // released between our insert and select — claim it again
    if (row.route !== route) {
      return NextResponse.json({ error: "This Idempotency-Key was already used for a different request" }, { status: 422 });
    }
    if (row.status != null) {
      return NextResponse.json(row.response, { status: row.status, headers: { "Idempotent-Replayed": "true" } });
    }
    if (Date.now() - row.createdAt.getTime() > STALE_MS) {
      await db.delete(keys).where(and(sameKey, lt(keys.createdAt, new Date(Date.now() - STALE_MS))));
      continue;
    }
    await sleep(WAIT_MS); // the first copy is still running — wait for its result
  }
  return NextResponse.json({ error: "This request is already being processed. Please try again." }, { status: 409 });
}

// Daily cleanup (recycle-bin worker): drop keys older than any queued retry could be.
export async function purgeExpiredIdempotencyKeys() {
  const cutoff = new Date(Date.now() - IDEMPOTENCY_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const removed = await db.delete(keys).where(lt(keys.createdAt, cutoff)).returning({ id: keys.id });
  return removed.length;
}

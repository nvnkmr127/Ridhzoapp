import { NextRequest, NextResponse } from "next/server";
import { and, eq, lt } from "drizzle-orm";
import { db } from "@/db";
import { apiIdempotencyKeys as keys } from "@/db/schema";
import type { ApiAuth } from "@/lib/apiAuth";
import { fail, type ActionResult } from "@/lib/actions/result";

const KEY_RE = /^[A-Za-z0-9-]{8,100}$/;
// A row still "processing" after this long belongs to a request that died mid-way — take it over.
const STALE_MS = 60_000;
const WAIT_MS = 500;
const MAX_ATTEMPTS = 10;

// How long keys are kept: the app keeps queued actions for 30 days, plus a margin.
export const IDEMPOTENCY_RETENTION_DAYS = 35;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Outcome<T> = { value: T; store?: { status: number; body: unknown } };

// Core: runs `run` at most once per (organization, key). A concurrent/late repeat waits for the first
// copy and gets its stored result via `replay`. A run that fails (no `store`) or throws releases the
// key, so a retry runs for real.
async function runOnce<T>(
  scope: { organizationId: string; userId: string | null; key: string; route: string },
  run: () => Promise<Outcome<T>>,
  replay: (status: number, body: unknown) => T,
  refuse: (message: string, status: number) => T,
): Promise<T> {
  const { organizationId, userId, key, route } = scope;
  const sameKey = and(eq(keys.organizationId, organizationId), eq(keys.key, key));

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const [claimed] = await db
      .insert(keys)
      .values({ organizationId, userId, key, route })
      .onConflictDoNothing()
      .returning({ id: keys.id });

    if (claimed) {
      let out: Outcome<T>;
      try {
        out = await run();
      } catch (e) {
        await db.delete(keys).where(eq(keys.id, claimed.id));
        throw e;
      }
      if (out.store) {
        await db.update(keys).set({ status: out.store.status, response: out.store.body }).where(eq(keys.id, claimed.id));
      } else {
        await db.delete(keys).where(eq(keys.id, claimed.id));
      }
      return out.value;
    }

    const [row] = await db.select().from(keys).where(sameKey);
    if (!row) continue; // released between our insert and select — claim it again
    if (row.route !== route) return refuse("This Idempotency-Key was already used for a different request", 422);
    if (row.status != null) return replay(row.status, row.response);
    if (Date.now() - row.createdAt.getTime() > STALE_MS) {
      await db.delete(keys).where(and(sameKey, lt(keys.createdAt, new Date(Date.now() - STALE_MS))));
      continue;
    }
    await sleep(WAIT_MS); // the first copy is still running — wait for its result
  }
  return refuse("This request is already being processed. Please try again.", 409);
}

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
  return runOnce(
    { organizationId: auth.organizationId, userId: auth.userId ?? null, key, route },
    async () => {
      const res = await handler();
      if (!res.ok) return { value: res };
      const body = await res.clone().json().catch(() => null);
      return { value: res, store: { status: res.status, body } };
    },
    (status, body) => NextResponse.json(body, { status, headers: { "Idempotent-Replayed": "true" } }),
    (error, status) => NextResponse.json({ error }, { status }),
  );
}

// The same guarantee for a server action that returns an ActionResult: a client retrying with the
// same key (e.g. the web offline queue replaying a lead whose first POST did land) gets the first
// successful result back instead of creating a second record. Invalid/missing key → runs as-is.
export async function actionOnce<T>(
  scope: { organizationId: string; userId: string; route: string },
  key: string | undefined,
  run: () => Promise<ActionResult<T>>,
): Promise<ActionResult<T>> {
  if (!key || !KEY_RE.test(key)) return run();
  return runOnce<ActionResult<T>>(
    { ...scope, key },
    async () => {
      const res = await run();
      return res.ok ? { value: res, store: { status: 200, body: res } } : { value: res };
    },
    (_status, body) => body as ActionResult<T>,
    (message) => fail("SERVER", message), // retryable — not "duplicate"
  );
}

// Daily cleanup (recycle-bin worker): drop keys older than any queued retry could be.
export async function purgeExpiredIdempotencyKeys() {
  const cutoff = new Date(Date.now() - IDEMPOTENCY_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const removed = await db.delete(keys).where(lt(keys.createdAt, cutoff)).returning({ id: keys.id });
  return removed.length;
}

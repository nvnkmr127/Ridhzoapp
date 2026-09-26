import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

// A one-row stand-in for api_idempotency_keys: each test exercises a single key, so every
// select/update/delete targets that row (the drizzle where-clauses are opaque here).
type Row = { id: string; organizationId: string; userId: string | null; key: string; route: string; status: number | null; response: unknown; createdAt: Date };
let row: Row | null = null;

vi.mock("@/db", () => ({
  db: {
    insert: () => ({
      values: (v: Omit<Row, "id" | "status" | "response" | "createdAt">) => ({
        onConflictDoNothing: () => ({
          returning: async () => {
            if (row) return [];
            row = { id: "row-1", status: null, response: null, createdAt: new Date(), ...v };
            return [{ id: row.id }];
          },
        }),
      }),
    }),
    select: () => ({ from: () => ({ where: async () => (row ? [row] : []) }) }),
    update: () => ({ set: (s: Partial<Row>) => ({ where: async () => { if (row) row = { ...row, ...s }; } }) }),
    delete: () => ({ where: () => { row = null; return { returning: async () => [] }; } }),
  },
}));

import { withIdempotency } from "./idempotency";

const auth = { organizationId: "org-1", userId: "user-1" };
const KEY = "0b7c5a1e-2f7d-4c1a-9f6e-3d2b1a0c9e8f";
const req = (key?: string) =>
  new NextRequest("http://x/api/v1/leads/l1/notes", { method: "POST", headers: key ? { "idempotency-key": key } : {} });

describe("withIdempotency", () => {
  beforeEach(() => {
    row = null;
  });

  it("runs the handler as before when there's no Idempotency-Key", async () => {
    const handler = vi.fn(async () => NextResponse.json({ data: 1 }, { status: 201 }));
    const res = await withIdempotency(req(), auth, "notes:l1", handler);
    expect(res.status).toBe(201);
    expect(handler).toHaveBeenCalledOnce();
    expect(row).toBeNull();
  });

  it("runs once per key and replays the first response to a retry", async () => {
    let n = 0;
    const handler = vi.fn(async () => NextResponse.json({ data: { id: `note-${++n}` } }, { status: 201 }));

    const first = await withIdempotency(req(KEY), auth, "notes:l1", handler);
    const retry = await withIdempotency(req(KEY), auth, "notes:l1", handler);

    expect(handler).toHaveBeenCalledOnce();
    expect(first.status).toBe(201);
    expect(retry.status).toBe(201);
    expect(retry.headers.get("Idempotent-Replayed")).toBe("true");
    expect(await retry.json()).toEqual({ data: { id: "note-1" } });
  });

  it("doesn't store a failed response, so the retry runs for real", async () => {
    const handler = vi
      .fn()
      .mockResolvedValueOnce(NextResponse.json({ error: "try again" }, { status: 500 }))
      .mockResolvedValueOnce(NextResponse.json({ data: { logged: true } }, { status: 201 }));

    expect((await withIdempotency(req(KEY), auth, "contact:l1", handler)).status).toBe(500);
    expect(row).toBeNull();
    expect((await withIdempotency(req(KEY), auth, "contact:l1", handler)).status).toBe(201);
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("releases the key when the handler throws", async () => {
    await expect(withIdempotency(req(KEY), auth, "reply:l1", async () => { throw new Error("boom"); })).rejects.toThrow("boom");
    expect(row).toBeNull();
  });

  it("rejects a key reused for a different request", async () => {
    await withIdempotency(req(KEY), auth, "notes:l1", async () => NextResponse.json({ data: 1 }, { status: 201 }));
    const handler = vi.fn();
    const res = await withIdempotency(req(KEY), auth, "notes:l2", handler);
    expect(res.status).toBe(422);
    expect(handler).not.toHaveBeenCalled();
  });

  it("takes over a key left 'processing' by a request that died", async () => {
    row = { id: "old", organizationId: "org-1", userId: "user-1", key: KEY, route: "notes:l1", status: null, response: null, createdAt: new Date(Date.now() - 5 * 60_000) };
    const handler = vi.fn(async () => NextResponse.json({ data: 1 }, { status: 201 }));
    const res = await withIdempotency(req(KEY), auth, "notes:l1", handler);
    expect(res.status).toBe(201);
    expect(handler).toHaveBeenCalledOnce();
  });

  it("ignores a malformed key", async () => {
    const handler = vi.fn(async () => NextResponse.json({ data: 1 }, { status: 201 }));
    await withIdempotency(req("bad key!"), auth, "notes:l1", handler);
    expect(row).toBeNull();
    expect(handler).toHaveBeenCalledOnce();
  });
});

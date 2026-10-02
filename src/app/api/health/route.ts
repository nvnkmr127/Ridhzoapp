import { NextResponse } from "next/server";
import { db } from "@/db";
import { sql } from "drizzle-orm";
import { redisConfigured, createRedis, WORKER_HEARTBEAT_KEY } from "@/lib/jobs/redis";

// One shared command client (a new connection per probe leaked a socket whenever ping threw).
let probe: ReturnType<typeof createRedis> | undefined;

export const dynamic = "force-dynamic";

export async function GET() {
  let dbOk = false;
  let redisOk = false;

  try {
    await db.execute(sql`SELECT 1`);
    dbOk = true;
  } catch {
    dbOk = false;
  }

  let workerAgeSec: number | null = null;
  if (redisConfigured()) {
    try {
      probe ??= createRedis({ maxRetriesPerRequest: 1 });
      redisOk = (await probe.ping()) === "PONG";
      const beat = redisOk ? await probe.get(WORKER_HEARTBEAT_KEY) : null;
      workerAgeSec = beat ? Math.round((Date.now() - Number(beat)) / 1000) : null;
    } catch {
      redisOk = false;
    }
  }
  // The background worker is a separate process: report it, and only fail the probe on it when asked to
  // (HEALTH_REQUIRE_WORKER=1) — a web-only instance mustn't be marked down because the worker restarts.
  const workerUp = workerAgeSec !== null;
  const workerRequired = process.env.HEALTH_REQUIRE_WORKER === "1" && redisConfigured();

  const healthy = dbOk && (!redisConfigured() || redisOk) && (!workerRequired || workerUp);

  return NextResponse.json(
    {
      status: healthy ? "healthy" : "degraded",
      timestamp: new Date().toISOString(),
      services: {
        database: dbOk ? "up" : "down",
        redis: !redisConfigured() ? "not_configured" : redisOk ? "up" : "down",
        worker: !redisConfigured() ? "not_configured" : workerUp ? "up" : "no_heartbeat",
      },
    },
    { status: healthy ? 200 : 503 }
  );
}

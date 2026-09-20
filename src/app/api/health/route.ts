import { NextResponse } from "next/server";
import { db } from "@/db";
import { sql } from "drizzle-orm";
import { redisConfigured, createRedis } from "@/lib/jobs/redis";

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

  if (redisConfigured()) {
    try {
      const client = createRedis({ maxRetriesPerRequest: 1 });
      const pong = await client.ping();
      redisOk = pong === "PONG";
      client.disconnect();
    } catch {
      redisOk = false;
    }
  }

  const healthy = dbOk && (!redisConfigured() || redisOk);

  return NextResponse.json(
    {
      status: healthy ? "healthy" : "degraded",
      timestamp: new Date().toISOString(),
      services: {
        database: dbOk ? "up" : "down",
        redis: !redisConfigured() ? "not_configured" : redisOk ? "up" : "down",
      },
    },
    { status: healthy ? 200 : 503 }
  );
}

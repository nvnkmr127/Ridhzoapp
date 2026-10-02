import Redis, { type RedisOptions } from "ioredis";

// One place to build every ioredis connection. Two things here stop a DOWN Redis from flooding the
// logs with a stack trace on every reconnect attempt (ECONNREFUSED 127.0.0.1:6379):
//   1. a backoff retryStrategy, so we don't hammer the socket, and
//   2. a throttled 'error' handler on every client — an unhandled ioredis 'error' event is what
//      prints the raw connection stack, and there were connections created without one.
/** Whether a Redis is actually configured. When false (e.g. a Vercel deploy with no managed Redis),
 *  background jobs are disabled rather than looping ECONNREFUSED against localhost. */
export function redisConfigured(): boolean {
  return Boolean(process.env.REDIS_URL);
}

let lastLog = 0;
function logConnError(err: Error): void {
  const now = Date.now();
  if (now - lastLog > 30_000) {
    lastLog = now;
    const code = (err as NodeJS.ErrnoException).code || err.message;
    console.warn(`[redis] connection error (${code}); retrying in background. Further errors muted for 30s.`);
  }
}

/** Build an ioredis client with a throttled error handler. Pass BullMQ's required
 *  `{ maxRetriesPerRequest: null }` for queue/worker connections; omit it for plain command clients.
 *  When no REDIS_URL is configured it does NOT retry — one failed connect, then stop, so a
 *  Redis-less deploy never floods the logs with reconnect attempts to localhost. */
export function createRedis(opts: RedisOptions = {}, url?: string): Redis {
  const target = url || process.env.REDIS_URL;
  const isServerless = Boolean(process.env.VERCEL);
  const client = new Redis(target || "redis://localhost:6379", {
    connectTimeout: 5000,
    commandTimeout: 5000,
    maxRetriesPerRequest: opts.maxRetriesPerRequest !== undefined ? opts.maxRetriesPerRequest : 1,
    enableOfflineQueue: opts.enableOfflineQueue ?? true,
    retryStrategy: (times) => {
      if (!target || (isServerless && times > 2)) return null;
      return Math.min(times * 500, 2000);
    },
    ...opts,
  });
  client.on("error", logConnError);
  return client;
}

/** BullMQ Worker/QueueEvents surface connection problems as their own 'error' event; without a
 *  listener Node throws "Unhandled 'error' event". Attach a quiet one (the connection already logs). */
const liveWorkers = new Set<{ close(): Promise<void> }>();

export function quietErrors(emitter: { on(event: "error", listener: (err: Error) => void): unknown; close?: () => Promise<void> }): void {
  emitter.on("error", () => {});
  // Every consumer passes through here, so this is where they're tracked for a graceful shutdown.
  if (typeof emitter.close === "function") liveWorkers.add(emitter as { close(): Promise<void> });
}

/** Stop taking new jobs and let running ones finish (BullMQ `close()`), bounded by `timeoutMs`. Used on SIGTERM
 *  so a deploy doesn't kill jobs mid-run (which BullMQ would later re-deliver → duplicate side effects). */
export async function closeAllWorkers(timeoutMs = 25_000): Promise<void> {
  const done = Promise.allSettled([...liveWorkers].map((w) => w.close()));
  await Promise.race([done, new Promise((r) => setTimeout(r, timeoutMs))]);
}

export const WORKER_HEARTBEAT_KEY = "ridhzo:worker:heartbeat";

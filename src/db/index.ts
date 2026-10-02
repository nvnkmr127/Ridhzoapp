import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL!;

declare global {
  // eslint-disable-next-line no-var -- global augmentation requires `var`
  var _dbClient: postgres.Sql | undefined;
}

// Remote DBs must use TLS — "prefer" silently falls back to plaintext. An explicit ?sslmode= in the
// URL wins (e.g. sslmode=disable for a compose-network Postgres without certificates); local hosts
// default to no TLS.
function sslFor(url: string | undefined): false | "require" | "prefer" | "verify-full" {
  const mode = url?.match(/[?&]sslmode=([a-z-]+)/)?.[1];
  if (mode === "disable") return false;
  if (mode === "prefer" || mode === "verify-full" || mode === "require") return mode;
  return /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(url ?? "") ? false : "require";
}

// Pool size per PROCESS. On Vercel every function instance gets its own pool, so N instances × max
// connections must stay under the database's max_connections: serverless defaults to a small pool
// (override with DB_POOL_MAX); a long-lived server (worker, `next start`) keeps the larger one.
function poolMax(isProd: boolean): number {
  const fromEnv = Number(process.env.DB_POOL_MAX);
  if (Number.isInteger(fromEnv) && fromEnv > 0) return fromEnv;
  if (process.env.VERCEL) return 5;
  return isProd ? 20 : 10;
}

// Prepared statements don't survive a transaction-mode pooler (pgbouncer / Supabase :6543): the next query
// may land on a backend that never saw the PREPARE. Turn them off automatically for those URLs, or
// explicitly with DB_PREPARE=0.
function usePrepared(url: string | undefined): boolean {
  if (process.env.DB_PREPARE === "0") return false;
  if (process.env.DB_PREPARE === "1") return true;
  return !(/[?&]pgbouncer=true/.test(url ?? "") || /:6543\//.test(url ?? ""));
}

function getClient(): postgres.Sql {
  if (!globalThis._dbClient) {
    const isProd = process.env.NODE_ENV === "production";
    globalThis._dbClient = postgres(connectionString, {
      prepare: usePrepared(connectionString), // re-parse savings; off behind a transaction pooler (see usePrepared)
      fetch_types: false, // Prevents redundant pg_type queries on connection
      max: poolMax(isProd), // see poolMax
      idle_timeout: 20, // Proactively close idle sockets before remote cloud proxies terminate them
      connect_timeout: 10, // Generous handshake timeout for cloud proxy
      max_lifetime: 60 * 10, // 10m connection lifetime avoids stale sockets across proxy limits
      keep_alive: 10, // TCP keepalive probes prevent firewalls/proxies from dropping idle connections
      ssl: sslFor(connectionString),
      onnotice: () => {},
      // Never in production: logging every query WITH bound params leaks lead PII (names, emails,
      // phones) and reset-token hashes into stdout/persisted logs.
      debug: isProd
        ? undefined
        : (connection, query, params) => {
            const time = new Date().toISOString().slice(11, 23);
            const snippet = query.trim().replace(/\s+/g, ' ');
            console.log(`[DB DEBUG ${time} socket#${connection}] ${snippet.slice(0, 160)}${snippet.length > 160 ? '...' : ''}`, params?.length ? params : '');
          },
      connection: {
        timezone: "UTC",
      },
      types: {
        timestamp: {
          to: 1114,
          from: [1114],
          serialize: (x: any) => (x instanceof Date ? x : new Date(x)).toISOString(),
          parse: (x: string) => new Date(x.endsWith("Z") ? x : x.replace(" ", "T") + "Z"),
        },
      },
    });
  }
  return globalThis._dbClient;
}

export const db = drizzle(getClient(), { schema });

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

function getClient(): postgres.Sql {
  if (!globalThis._dbClient) {
    const isProd = process.env.NODE_ENV === "production";
    globalThis._dbClient = postgres(connectionString, {
      prepare: true, // Prepared statements eliminate query re-parsing on Postgres
      fetch_types: false, // Prevents redundant pg_type queries on connection
      max: isProd ? 20 : 10, // Avoid socket starvation when mobile screens fire parallel subqueries
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

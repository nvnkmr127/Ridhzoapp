import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL!;

declare global {
  // eslint-disable-next-line no-var -- global augmentation requires `var`
  var _dbClient: postgres.Sql | undefined;
}

function getClient(): postgres.Sql {
  if (!globalThis._dbClient) {
    const isProd = process.env.NODE_ENV === "production";
    globalThis._dbClient = postgres(connectionString, {
      prepare: false,
      fetch_types: false, // Prevents redundant pg_type queries on connection
      max: isProd ? 10 : 5,
      idle_timeout: 10, // Release idle TCP sockets automatically after 10s
      connect_timeout: 5, // Fail fast (5s max) so queries never block for 30s TCP timeouts
      max_lifetime: 60 * 30, // 30m max connection lifetime
      debug: (connection, query, params) => {
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

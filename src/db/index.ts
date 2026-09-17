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
    globalThis._dbClient = postgres(connectionString, {
      prepare: false,
      fetch_types: false, // Prevents redundant pg_type queries on connection
      max: process.env.NODE_ENV === "production" ? 20 : 5,
      idle_timeout: 15, // Release idle TCP sockets automatically after 15s without breaking pool reference
      connect_timeout: 10, // Fail fast (10s) if database is unreachable
      max_lifetime: 60 * 30, // 30m max connection lifetime
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

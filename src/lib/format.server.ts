import "server-only";
import { cache } from "react";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { DEFAULT_FORMAT, type OrgFormat } from "@/lib/format";

// Per-request memoized fetch (React cache) — many server components on one page share a single query.
// Server-only: keeps the db/postgres import out of any client bundle that uses the pure formatters.
export const getOrgFormat = cache(async (organizationId: string): Promise<OrgFormat> => {
  const [org] = await db
    .select({
      currency: organizations.currency,
      locale: organizations.locale,
      dateFormat: organizations.dateFormat,
      timezone: organizations.timezone,
    })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);
  return {
    currency: org?.currency || DEFAULT_FORMAT.currency,
    locale: org?.locale || DEFAULT_FORMAT.locale,
    dateFormat: org?.dateFormat || DEFAULT_FORMAT.dateFormat,
    timezone: org?.timezone || DEFAULT_FORMAT.timezone,
  };
});

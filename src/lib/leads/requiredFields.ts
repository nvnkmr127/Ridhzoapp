import { db } from "@/db";
import { organizations } from "@/db/schema";
import { eq } from "drizzle-orm";

// Which lead fields the org marked required at capture. "name" is always required (NOT NULL column),
// so callers never need to special-case it. Returns the fields that are configured AND missing from
// the payload — the single source of truth shared by EVERY create path (manual, API, ingestion,
// booking) so the setting can't be enforced in the UI while a backend path bypasses it.
// Company is no longer asked for on the add/edit forms, so it can't be required either — an org that
// saved it as required earlier would otherwise be unable to add a lead at all.
const OPTIONAL_REQUIREABLE = ["email", "phone"] as const;
type Requireable = (typeof OPTIONAL_REQUIREABLE)[number];

export function findMissingRequiredFields(
  required: readonly string[] | null | undefined,
  data: { email?: string | null; phone?: string | null; company?: string | null },
): Requireable[] {
  const req = new Set(required ?? ["name"]);
  return OPTIONAL_REQUIREABLE.filter((f) => req.has(f) && !data[f]?.toString().trim());
}

// Throws a VALIDATION error (with per-field errors) when a required field is missing. Shared by the
// synchronous create paths; ingestion uses findMissingRequiredFields directly so it can log instead.
export async function assertRequiredLeadFields(
  organizationId: string,
  data: { email?: string | null; phone?: string | null; company?: string | null },
): Promise<void> {
  const [org] = await db
    .select({ requiredLeadFields: organizations.requiredLeadFields })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);
  const missing = findMissingRequiredFields(org?.requiredLeadFields, data);
  if (missing.length) {
    const err = new Error(`Missing required field(s): ${missing.join(", ")}`);
    (err as { code?: string }).code = "VALIDATION";
    (err as { fieldErrors?: Record<string, string> }).fieldErrors = Object.fromEntries(
      missing.map((f) => [f, "This field is required."]),
    );
    throw err;
  }
}

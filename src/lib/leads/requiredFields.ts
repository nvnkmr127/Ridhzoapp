import { db } from "@/db";
import { organizations } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  findMissingMandatoryLeadFields,
  type LeadFieldConfig,
} from "./fieldConfig";

// Which contact channels the org marked required at capture (name, email, phone).
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
// synchronous create paths (manual, API, ingestion, booking) so the setting can't be bypassed.
export async function assertRequiredLeadFields(
  organizationId: string,
  data: {
    email?: string | null;
    phone?: string | null;
    company?: string | null;
    customData?: Record<string, unknown> | null;
    [key: string]: unknown;
  },
): Promise<void> {
  const [org] = await db
    .select({
      requiredLeadFields: organizations.requiredLeadFields,
      leadFieldConfig: organizations.leadFieldConfig,
    })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);

  const missingContact = findMissingRequiredFields(org?.requiredLeadFields, data);
  const missingConfigured = findMissingMandatoryLeadFields(
    org?.leadFieldConfig as LeadFieldConfig | undefined,
    data as Record<string, unknown>,
  );

  const fieldErrors: Record<string, string> = {};
  for (const f of missingContact) {
    fieldErrors[f] = "This field is required.";
  }
  for (const f of missingConfigured) {
    fieldErrors[f.key] = `${f.label} is required.`;
  }

  const allMissingLabels = [
    ...missingContact.map((f) => f.charAt(0).toUpperCase() + f.slice(1)),
    ...missingConfigured.map((f) => f.label),
  ];

  if (allMissingLabels.length > 0) {
    const err = new Error(`Missing required field(s): ${allMissingLabels.join(", ")}`);
    (err as { code?: string }).code = "VALIDATION";
    (err as { fieldErrors?: Record<string, string> }).fieldErrors = fieldErrors;
    throw err;
  }
}

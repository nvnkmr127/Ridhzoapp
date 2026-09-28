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

// Field errors for an EDIT. Only fields this request sends are checked: a lead created before a field
// became mandatory (or before email/phone became required) can still have its status or name changed
// without filling everything first. A form that sends the field — the edit dialog sends them all —
// still can't save it empty.
export function leadEditFieldErrors(
  org: { requiredLeadFields?: readonly string[] | null; leadFieldConfig?: unknown } | null | undefined,
  candidate: Record<string, unknown>,
  touched: Iterable<string>,
): Record<string, string> {
  const sent = new Set(touched);
  const errors: Record<string, string> = {};
  for (const f of findMissingRequiredFields(org?.requiredLeadFields, candidate as { email?: string | null; phone?: string | null })) {
    if (sent.has(f)) errors[f] = `${f === "email" ? "Email" : "Phone"} is required.`;
  }
  for (const f of findMissingMandatoryLeadFields(org?.leadFieldConfig as LeadFieldConfig | undefined, candidate)) {
    if (sent.has(f.key)) errors[f.key] = `${f.label} is required.`;
  }
  return errors;
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

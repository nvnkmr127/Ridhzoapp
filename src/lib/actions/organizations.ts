"use server";

import { requireOrg, requirePermission } from "@/lib/rbac";
import { revalidatePath } from "next/cache";
import { OrgService } from "@/domains/organizations/service";
import { AuditService } from "@/domains/audit/service";
import { z } from "zod";
import { ok, fail, actionFail, zodFieldErrors } from "@/lib/actions/result";

const LEAD_FIELDS = ["name", "email", "phone", "company"] as const;

const opt = (max: number) => z.string().trim().max(max).nullish().transform((v) => v || null);

// A real IANA zone the runtime can format in — rejects typos that would otherwise silently disable
// quiet hours (nextSendableAt swallows a bad zone and sends anytime).
function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const updateOrgSchema = z.object({
  name: z.string().trim().min(1, "Organization name is required").max(255),
  // Localisation
  timezone: z.string().trim().min(1).max(64).refine(isValidTimezone, "Not a valid timezone"),
  locale: z.string().trim().min(1).max(10),
  currency: z.string().trim().length(3),
  dateFormat: z.string().trim().min(1).max(20),
  // Company information
  industry: opt(120),
  // Free-text business description fed to the AI assists (see organizations.aiContext).
  aiContext: opt(4000),
  phone: opt(30),
  // Blank → null; otherwise must parse as a URL (http(s):// prepended if the user omitted it), so a
  // direct/API caller can't persist "not a url" that the client would have rejected.
  website: z
    .string()
    .trim()
    .max(255)
    .nullish()
    .transform((v) => (v ? v : null))
    .refine((v) => {
      if (!v) return true;
      try {
        new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`);
        return true;
      } catch {
        return false;
      }
    }, "Enter a valid website URL"),
  addressLine1: opt(255),
  city: opt(120),
  state: opt(120),
  postalCode: opt(20),
  // Blank is allowed (→ null); a 2-letter code otherwise. Without the "" branch an empty
  // country field fails length(2) and blocks the whole settings save.
  country: z.string().trim().length(2).or(z.literal("")).nullish().transform((v) => v || null),
  // SLA escalation window in hours; 0/empty turns it off (stored as null). Decimals are rounded
  // rather than rejected (the UI number input allows them), so a "1.5" doesn't fail the whole save.
  slaHours: z.coerce.number().min(0).max(720).nullish().transform((v) => (v ? Math.round(v) : null)),
  // Sequence send window (quiet hours), local to the org timezone. Both null = always send.
  sequenceWindowStart: z.coerce.number().int().min(0).max(23).nullish().transform((v) => (v == null || Number.isNaN(v) ? null : v)),
  sequenceWindowEnd: z.coerce.number().int().min(1).max(24).nullish().transform((v) => (v == null || Number.isNaN(v) ? null : v)),
  // WhatsApp send mode: personal (wa.me one-tap) or bsp (Business API).
  whatsappMode: z.enum(["personal", "bsp"]).default("personal"),
  // "name" is always required; keep only known fields and force-include name.
  requiredLeadFields: z
    .array(z.enum(LEAD_FIELDS))
    .default(["name"])
    .transform((arr) => Array.from(new Set(["name", ...arr]))),
  // ISO timestamp the form loaded the org with — enables optimistic concurrency (see service).
  expectedUpdatedAt: z.string().optional().or(z.literal("")),
});

export async function getOrganizationAction() {
  const { organizationId } = await requireOrg();
  return OrgService.getOrganization(organizationId);
}

export async function updateOrganizationAction(input: z.input<typeof updateOrgSchema>) {
  const { organizationId, userId } = await requirePermission("settings.manage");
  const parsed = updateOrgSchema.safeParse(input);
  if (!parsed.success) {
    return fail("VALIDATION", parsed.error.issues[0]?.message ?? "Please check the highlighted fields.", zodFieldErrors(parsed.error));
  }

  try {
    const { expectedUpdatedAt, ...data } = parsed.data;
    const expected = expectedUpdatedAt ? new Date(expectedUpdatedAt) : undefined;
    const updated = await OrgService.updateOrganization(organizationId, data, expected);
    await AuditService.log({ organizationId, userId, action: "org.settings_update", entityType: "organization", entityId: organizationId });
    revalidatePath("/settings");
    return ok(updated);
  } catch (e) {
    return actionFail(e);
  }
}

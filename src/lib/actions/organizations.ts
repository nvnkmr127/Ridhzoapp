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
  // Morning team summary email to admins: 1 on, 0 off.
  dailySummary: z.coerce.number().int().min(0).max(1).optional(),
  // Business days (0=Sun…6=Sat) + hours (end exclusive, > start). Drives summary days and alert timing.
  workDays: z.array(z.number().int().min(0).max(6)).max(7).transform((d) => [...new Set(d)].sort()).optional(),
  workStartHour: z.coerce.number().int().min(0).max(23).optional(),
  workEndHour: z.coerce.number().int().min(1).max(24).optional(),
  // "name" is always required; keep only known fields and force-include name.
  requiredLeadFields: z
    .array(z.enum(LEAD_FIELDS))
    .default(["name"])
    .transform((arr) => Array.from(new Set(["name", ...arr]))),
  leadFieldConfig: z
    .record(
      z.enum(["budget", "company", "location", "industry", "companySize", "websiteUrl"]),
      z.enum(["mandatory", "optional", "hidden"]),
    )
    .optional(),
  // ISO timestamp the form loaded the org with — enables optimistic concurrency (see service).
  expectedUpdatedAt: z.string().optional().or(z.literal("")),
}).refine((d) => d.workStartHour == null || d.workEndHour == null || d.workStartHour < d.workEndHour, {
  message: "Closing time must be after opening time.",
  path: ["workEndHour"],
});

export async function getOrganizationAction() {
  const { organizationId } = await requireOrg();
  return OrgService.getOrganization(organizationId);
}

export async function getLeadFieldConfigAction() {
  const { organizationId } = await requireOrg();
  const org = await OrgService.getOrganization(organizationId);
  const { resolveLeadFieldConfig } = await import("@/lib/leads/fieldConfig");
  return resolveLeadFieldConfig(org?.leadFieldConfig);
}

// Fields recorded as {old, new} in the audit entry — low-cardinality/operational, safe to show
// in full. Everything else that changed is named in `changedFields` with no value (free text like
// aiContext, or PII like phone/address that doesn't need to be replayed into the audit trail).
const SETTINGS_VALUE_FIELDS = [
  "timezone", "locale", "currency", "dateFormat", "slaHours", "whatsappMode",
  "requiredLeadFields", "leadFieldConfig", "sequenceWindowStart", "sequenceWindowEnd", "dailySummary",
  "workDays", "workStartHour", "workEndHour",
] as const;

export async function updateOrganizationAction(input: z.input<typeof updateOrgSchema>) {
  const { organizationId, userId } = await requirePermission("settings.manage");
  const parsed = updateOrgSchema.safeParse(input);
  if (!parsed.success) {
    return fail("VALIDATION", parsed.error.issues[0]?.message ?? "Please check the highlighted fields.", zodFieldErrors(parsed.error));
  }

  try {
    const { expectedUpdatedAt, ...data } = parsed.data;
    const expected = expectedUpdatedAt ? new Date(expectedUpdatedAt) : undefined;
    const before = await OrgService.getOrganization(organizationId);
    const updated = await OrgService.updateOrganization(organizationId, data, expected);
    const { forgetOrgDialCode } = await import("@/lib/leads/orgDialCode");
    forgetOrgDialCode(organizationId);

    const changedFields: string[] = [];
    const values: Record<string, { old: unknown; new: unknown }> = {};
    for (const key of Object.keys(data) as (keyof typeof data)[]) {
      const oldVal = (before as Record<string, unknown> | null)?.[key as string];
      const newVal = (data as Record<string, unknown>)[key as string];
      if (JSON.stringify(oldVal) === JSON.stringify(newVal)) continue;
      changedFields.push(key as string);
      if ((SETTINGS_VALUE_FIELDS as readonly string[]).includes(key as string)) {
        values[key as string] = { old: oldVal, new: newVal };
      }
    }
    if (changedFields.length > 0) {
      await AuditService.log({ organizationId, userId, action: "org.settings_update", entityType: "organization", entityId: organizationId, metadata: { changedFields, values } });
    }
    revalidatePath("/settings");
    return ok(updated);
  } catch (e) {
    return actionFail(e);
  }
}

// One-click fix for workspaces still on the default UTC (set from the admin's browser timezone).
export async function setWorkspaceTimezoneAction(timeZone: string) {
  const { organizationId, userId } = await requirePermission("settings.manage");
  const tz = String(timeZone ?? "").trim();
  try {
    if (!tz || tz.length > 64) throw new Error("invalid");
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
  } catch {
    return fail("VALIDATION", "That timezone isn't recognised.");
  }
  try {
    const before = await OrgService.getOrganization(organizationId);
    await OrgService.updateOrganization(organizationId, { timezone: tz });
    await AuditService.log({
      organizationId, userId, action: "org.settings_update", entityType: "organization", entityId: organizationId,
      metadata: { changedFields: ["timezone"], values: { timezone: { old: before?.timezone ?? null, new: tz } } },
    });
    revalidatePath("/", "layout");
    return ok({ timezone: tz });
  } catch (e) {
    return actionFail(e);
  }
}

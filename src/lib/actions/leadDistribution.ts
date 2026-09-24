"use server";

import { requirePermission } from "@/lib/rbac";
import { LeadDistributionService, type DistributionRuleInput } from "@/domains/integrations/leadDistributionService";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ok, fail, actionFail } from "@/lib/actions/result";

const recipientSchema = z.object({
  channel: z.enum(["email", "in_app", "whatsapp"]),
  value: z.string().min(1),
});

const conditionSchema = z.object({
  field: z.string().min(1),
  operator: z.enum(["equals", "not_equals", "contains", "does_not_contain", "greater_than", "less_than"]),
  value: z.string(),
});

const ruleSchema = z.object({
  name: z.string().trim().max(120).nullable(),
  sourceId: z.guid().nullable(),
  conditions: z.object({
    type: z.enum(["AND", "OR"]),
    conditions: z.array(conditionSchema).max(10),
  }),
  recipients: z.array(recipientSchema).min(1, "Add at least one recipient").max(50),
  mode: z.enum(["all", "round_robin"]),
  skipSave: z.boolean(),
}).superRefine((val, ctx) => {
  // Validate each recipient value against its channel.
  val.recipients.forEach((r, i) => {
    if (r.channel === "email" && !z.string().email().safeParse(r.value).success) {
      ctx.addIssue({ code: "custom", message: `"${r.value}" isn't a valid email`, path: ["recipients", i, "value"] });
    }
    if (r.channel === "in_app" && !z.guid().safeParse(r.value).success) {
      ctx.addIssue({ code: "custom", message: "Pick a valid team member", path: ["recipients", i, "value"] });
    }
  });
});

export async function listDistributionRulesAction() {
  const { organizationId } = await requirePermission("api.manage");
  return LeadDistributionService.list(organizationId);
}

export async function createDistributionRuleAction(input: DistributionRuleInput) {
  const { organizationId } = await requirePermission("api.manage");
  const parsed = ruleSchema.safeParse(input);
  if (!parsed.success) return fail("VALIDATION", parsed.error.issues[0]?.message ?? "Please provide a valid rule.");
  try {
    const row = await LeadDistributionService.create(organizationId, parsed.data);
    revalidatePath("/settings/distribution");
    return ok(row);
  } catch (e) {
    return actionFail(e);
  }
}

export async function updateDistributionRuleAction(id: string, input: DistributionRuleInput) {
  const { organizationId } = await requirePermission("api.manage");
  const parsed = ruleSchema.safeParse(input);
  if (!parsed.success) return fail("VALIDATION", parsed.error.issues[0]?.message ?? "Please provide a valid rule.");
  try {
    const row = await LeadDistributionService.update(organizationId, id, parsed.data);
    if (!row) return fail("NOT_FOUND", "This rule no longer exists.");
    revalidatePath("/settings/distribution");
    return ok(row);
  } catch (e) {
    return actionFail(e);
  }
}

export async function toggleDistributionRuleAction(id: string, isActive: boolean) {
  const { organizationId } = await requirePermission("api.manage");
  try {
    const row = await LeadDistributionService.setActive(organizationId, id, isActive);
    if (!row) return fail("NOT_FOUND", "This rule no longer exists.");
    revalidatePath("/settings/distribution");
    return ok(row);
  } catch (e) {
    return actionFail(e);
  }
}

export async function deleteDistributionRuleAction(id: string) {
  const { organizationId } = await requirePermission("api.manage");
  try {
    await LeadDistributionService.remove(organizationId, id);
    revalidatePath("/settings/distribution");
    return ok({ deleted: true });
  } catch (e) {
    return actionFail(e);
  }
}

export async function testDistributionRuleAction(id: string) {
  const { organizationId } = await requirePermission("api.manage");
  try {
    const res = await LeadDistributionService.sendTest(organizationId, id);
    if (!res.ok) return fail("SERVER", res.message);
    return ok({ sent: res.sent, total: res.total });
  } catch (e) {
    return actionFail(e);
  }
}

export async function listDistributionDeliveriesAction(ruleId: string) {
  const { organizationId } = await requirePermission("api.manage");
  return LeadDistributionService.listDeliveries(organizationId, ruleId);
}

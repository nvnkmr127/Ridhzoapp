import "server-only";
import { CustomFieldService } from "@/domains/customFields/service";
import { CustomStatusSchemaService } from "@/domains/leads/customStatusSchemaService";
import { FollowUpService } from "@/domains/follow-ups/service";
import { LeadService } from "@/domains/leads/service";
import { markAiSuggestionDone, type RecapCache } from "@/lib/ai/leadAssist";
import { visiblePlan } from "@/lib/ai/leadPlan";

type Lead = NonNullable<Awaited<ReturnType<typeof LeadService.getLead>>>;

export type ApplyResult = { ok: true; applied: string } | { ok: false; code: "NOT_FOUND" | "VALIDATION"; message: string };

/**
 * Applies ONE AI suggestion the rep accepted — shared by the web action and the mobile API, which
 * each check lead access and edit permission first. The suggestion is looked up from what was saved
 * with the recap (never taken from the caller), and applied with the same validation as a manual edit:
 * the field's own type/options, the workspace's status list and won/lost bookkeeping, and a normal
 * follow-up.
 */
export async function applyAiSuggestion(input: {
  lead: Lead;
  organizationId: string;
  userId: string | null;
  isAdmin: boolean;
  id: string;
}): Promise<ApplyResult> {
  const { lead, organizationId, userId, isAdmin, id } = input;
  const cd = (lead.customData as Record<string, unknown> | null) ?? {};
  const saved = cd._aiRecap as RecapCache | undefined;
  const plan = visiblePlan(saved?.plan, saved?.dismissed);

  const field = plan.fields.find((f) => f.id === id);
  if (field) {
    const merged = { ...cd, [field.key]: field.value };
    let validated: Record<string, unknown>;
    try {
      validated = await CustomFieldService.validate(organizationId, merged, { isAdmin, existing: cd });
    } catch (e) {
      return { ok: false, code: "VALIDATION", message: (e as Error)?.message || "That value isn't valid for this field any more." };
    }
    // Same merge as a manual save: validated is authoritative for editable fields; every other stored
    // key (AI recap, scoring, attribution, admin-only fields for non-admins) is kept as is.
    const defs = await CustomFieldService.list(organizationId);
    const editable = new Set(defs.filter((d) => !d.disabled && (isAdmin || !d.adminOnly)).map((d) => d.key));
    if (!editable.has(field.key)) return { ok: false, code: "VALIDATION", message: "That field can't be edited any more." };
    const result: Record<string, unknown> = { ...validated };
    for (const [k, v] of Object.entries(cd)) if (!(k in result) && !editable.has(k)) result[k] = v;
    const updated = await LeadService.updateCustomData(lead.id, result, organizationId);
    if (!updated) return { ok: false, code: "NOT_FOUND", message: "This lead no longer exists or was moved." };
    await markAiSuggestionDone(lead.id, organizationId, id);
    return { ok: true, applied: `${field.label} set to ${field.display}` };
  }

  if (plan.status?.id === id) {
    const target = plan.status;
    const statuses = await CustomStatusSchemaService.getTenantStatusSchema(organizationId);
    if (!statuses.some((s) => s.key === target.key)) {
      return { ok: false, code: "VALIDATION", message: `The status "${target.label}" no longer exists.` };
    }
    const updated = await LeadService.changeStatus(lead.id, target.key, userId, organizationId, target.reason);
    if (!updated) return { ok: false, code: "NOT_FOUND", message: "This lead no longer exists or was moved." };
    await markAiSuggestionDone(lead.id, organizationId, id);
    return { ok: true, applied: `Status changed to ${target.label}` };
  }

  if (plan.next?.id === id) {
    const next = plan.next;
    const type = next.kind === "call" || next.kind === "whatsapp" || next.kind === "email" ? next.kind : "followup";
    // No time from the AI → tomorrow, same time.
    const dueAt = next.followUpAt ? new Date(next.followUpAt) : new Date(Date.now() + 86_400_000);
    await FollowUpService.createFollowUp({
      leadId: lead.id,
      type,
      title: next.title,
      description: next.reason || undefined,
      dueAt,
      userId: userId ?? lead.ownerId ?? null,
      organizationId,
    });
    await markAiSuggestionDone(lead.id, organizationId, id);
    return { ok: true, applied: `Follow-up added: ${next.title}` };
  }

  return { ok: false, code: "NOT_FOUND", message: "That suggestion is out of date — refresh the AI recap." };
}

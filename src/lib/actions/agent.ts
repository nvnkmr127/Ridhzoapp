"use server";

import { requireOrg, requirePermission } from "@/lib/rbac";
import { runLeadAgent, type AgentResult } from "@/lib/ai/agent";
import { capHistory } from "@/lib/ai/history";
import { PlanService } from "@/domains/billing/planService";
import { getActionableLead } from "@/lib/leads/access";
import { OrgService } from "@/domains/organizations/service";

// One turn of the CRM assistant. Tenant + identity come from the session (requireOrg), never the
// client — the agent's tools are bound to these server-side. History is the prior turns for context.
export async function runAgentAction(
  message: string,
  history: { role: "user" | "assistant"; content: string }[] = [],
  currentLeadId?: string,
): Promise<AgentResult> {
  const { organizationId, userId } = await requireOrg();
  const trimmed = message.trim();
  if (!trimmed) return { text: "Ask me something about your leads.", proposals: [], steps: 0, enabled: true };
  // Only accept a canonical uuid as lead context; anything else is ignored (org scope guards it too).
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const leadId = typeof currentLeadId === "string" && UUID.test(currentLeadId) ? currentLeadId : undefined;
  // Cap history to keep prompt size (and cost) bounded, but always keep the FIRST turn — early
  // constraints ("audience is investors", "keep it formal") set the tone for the whole thread and
  // would otherwise fall out of a plain tail window in a long conversation.
  const capped = capHistory(history, 20);
  if (!(await PlanService.consumeAiCredit(organizationId))) {
    return { text: "You've used all your AI credits for this month.", proposals: [], steps: 0, enabled: true, outOfCredits: true };
  }
  const res = await runLeadAgent({ organizationId, userId }, trimmed, capped, leadId);
  // No answer at all (AI off, or every model call failed): that turn doesn't cost a credit.
  if (res.failed || !res.enabled) await PlanService.refundAiCredit(organizationId).catch(() => {});
  return res;
}

/**
 * How a draft for this lead should actually leave, and with what. The org may be on personal
 * WhatsApp (open wa.me from the rep's own number, no Business API) rather than BSP, and the AI
 * doesn't know that — so the client asks before it offers to send, instead of silently using the
 * Business API and hitting a 24-hour-window error.
 */
export async function proposalSendContextAction(leadId: string): Promise<
  | { whatsappMode: "personal" | "bsp"; phone: string | null; leadName: string | null }
  | { error: string }
> {
  await requirePermission("leads.edit");
  const access = await getActionableLead(leadId);
  if (!access) return { error: "This lead no longer exists or isn't assigned to you." };
  const org = await OrgService.getOrganization(access.organizationId).catch(() => null);
  return {
    whatsappMode: org?.whatsappMode === "bsp" ? "bsp" : "personal",
    phone: access.lead.phone,
    leadName: access.lead.name,
  };
}

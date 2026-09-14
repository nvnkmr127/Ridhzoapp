"use server";

import { requireOrg } from "@/lib/rbac";
import { runLeadAgent, type AgentResult } from "@/lib/ai/agent";
import { capHistory } from "@/lib/ai/history";

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
  return runLeadAgent({ organizationId, userId }, trimmed, capped, leadId);
}

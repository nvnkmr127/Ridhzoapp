"use server";

import { z } from "zod";
import { requireOrg } from "@/lib/rbac";
import { generateText, aiEnabled } from "@/lib/ai/client";
import { businessPreamble } from "@/lib/ai/leadBrief";
import { getActionableLead } from "@/lib/leads/access";
import { draftReplyForLead, markAiSuggestionDone, recapForLead, type RecapCache, type RecapResult } from "@/lib/ai/leadAssist";
import { visiblePlan } from "@/lib/ai/leadPlan";
import { ok, fail, actionFail, type ActionResult } from "@/lib/actions/result";
import { changeLeadStatusAction, updateCustomDataAction } from "@/lib/actions/leads";
import { createFollowUp } from "@/lib/actions/follow-ups";
import { OrgService } from "@/domains/organizations/service";
import { PlanService } from "@/domains/billing/planService";

const draftSchema = z.object({
  leadId: z.guid(),
  channel: z.enum(["whatsapp", "email"]).default("whatsapp"),
  tone: z.enum(["friendly", "professional", "short"]).default("friendly"),
  // Free text so any language works ("Hindi", "Hinglish", "Tamil"…); "auto" = match the lead.
  language: z.string().trim().max(40).default("auto"),
});

export async function draftLeadReplyAction(
  data: unknown,
): Promise<{ draft: string; subject?: string; ai: boolean; outOfCredits?: boolean }> {
  const { leadId, channel, tone, language } = draftSchema.parse(data);
  const access = await getActionableLead(leadId);
  if (!access) throw new Error("Lead not found");
  return draftReplyForLead(access.lead, access.organizationId, { channel, tone, language });
}

// AI recap — a one-glance "where this lead stands", plus AI suggestions (custom fields, status, next
// step). Saved on the lead and reused until the lead changes, so opening the page again costs no AI call.
export async function summarizeLeadAction(data: unknown): Promise<RecapResult> {
  const { leadId, refresh } = z.object({ leadId: z.guid(), refresh: z.boolean().optional() }).parse(data);
  const access = await getActionableLead(leadId);
  if (!access) throw new Error("Lead not found");
  return recapForLead(access.lead, access.organizationId, refresh);
}

const suggestionSchema = z.object({ leadId: z.guid(), id: z.string().min(1).max(40) });

// Applies ONE AI suggestion the rep accepted. The suggestion is looked up server-side from what was
// saved with the recap (never taken from the client), and applied through the normal actions — so the
// same permissions, field validation and won/lost bookkeeping apply as if the rep did it by hand.
export async function applyAiSuggestionAction(data: unknown): Promise<ActionResult<{ applied: string }>> {
  try {
    const { leadId, id } = suggestionSchema.parse(data);
    const access = await getActionableLead(leadId);
    if (!access) return fail("NOT_FOUND", "This lead no longer exists or was moved.");
    const cd = (access.lead.customData as Record<string, unknown> | null) ?? {};
    const saved = cd._aiRecap as RecapCache | undefined;
    const plan = visiblePlan(saved?.plan, saved?.dismissed);

    const field = plan.fields.find((f) => f.id === id);
    if (field) {
      // Pass every stored value plus the new one: updateCustomDataAction treats missing editable
      // fields as cleared.
      const res = await updateCustomDataAction(leadId, { ...cd, [field.key]: field.value });
      if (!res.ok) return res;
      await markAiSuggestionDone(leadId, access.organizationId, id);
      return ok({ applied: `${field.label} set to ${field.display}` });
    }

    if (plan.status?.id === id) {
      const res = await changeLeadStatusAction(leadId, plan.status.key, plan.status.reason);
      if (!res.ok) return res;
      await markAiSuggestionDone(leadId, access.organizationId, id);
      return ok({ applied: `Status changed to ${plan.status.label}` });
    }

    if (plan.next?.id === id) {
      const next = plan.next;
      const type = next.kind === "call" || next.kind === "whatsapp" || next.kind === "email" ? next.kind : "followup";
      // No time from the AI → tomorrow, same time.
      const dueAt = next.followUpAt ?? new Date(Date.now() + 86_400_000).toISOString();
      const res = await createFollowUp({ leadId, type, title: next.title, description: next.reason || undefined, dueAt });
      if (!res.ok) return res;
      await markAiSuggestionDone(leadId, access.organizationId, id);
      return ok({ applied: `Follow-up added: ${next.title}` });
    }

    return fail("NOT_FOUND", "That suggestion is out of date — refresh the AI recap.");
  } catch (e) {
    return actionFail(e);
  }
}

export async function dismissAiSuggestionAction(data: unknown): Promise<ActionResult<{ dismissed: true }>> {
  try {
    const { leadId, id } = suggestionSchema.parse(data);
    const access = await getActionableLead(leadId);
    if (!access) return fail("NOT_FOUND", "This lead no longer exists or was moved.");
    await markAiSuggestionDone(leadId, access.organizationId, id);
    return ok({ dismissed: true });
  } catch (e) {
    return actionFail(e);
  }
}

const SEQ_SYSTEM = `You design short WhatsApp/email follow-up sequences for salespeople.
Return ONLY a JSON array (no prose) of 3-5 steps. Each step:
{"dayOffset": <int days from enrolment>, "channel": "whatsapp"|"email", "body": "<message under 60 words>"}
Start dayOffset at 0 (first message) and increase. Warm, human, specific, one clear next step each.`;

export type GeneratedSequenceStep = { dayOffset: number; channel: "whatsapp" | "email"; body: string };

function buildContextualSequence(goal: string): GeneratedSequenceStep[] {
  const g = goal.toLowerCase();

  if (g.includes("demo") || g.includes("trial") || g.includes("software") || g.includes("product") || g.includes("app")) {
    return [
      { dayOffset: 0, channel: "whatsapp", body: "Hi {{first_name}}, thanks for checking us out! I'd love to walk you through a quick 10-minute demo to show how we can help. How does your schedule look this week?" },
      { dayOffset: 2, channel: "whatsapp", body: "Hi {{first_name}}, following up on the demo. Are there any specific features or questions you'd like us to focus on?" },
      { dayOffset: 5, channel: "email", body: "Hi {{first_name}},\n\nWanted to share a quick walkthrough video and summary of key capabilities. Feel free to pick a time on my calendar whenever you're ready: [Calendar Link]\n\nBest regards," },
      { dayOffset: 8, channel: "whatsapp", body: "Hi {{first_name}}, just checking in one last time. If you're still exploring options, let me know if I can help answer anything!" },
    ];
  }

  if (g.includes("call") || g.includes("meeting") || g.includes("consult") || g.includes("appointment") || g.includes("book")) {
    return [
      { dayOffset: 0, channel: "whatsapp", body: "Hi {{first_name}}, thanks for reaching out! I'd love to set up a short call to discuss your needs. Are you free tomorrow morning or afternoon?" },
      { dayOffset: 2, channel: "whatsapp", body: "Hi {{first_name}}, just checking if you had a chance to look over your availability for a quick call? Happy to work around your calendar." },
      { dayOffset: 5, channel: "email", body: "Hi {{first_name}},\n\nFollowing up on scheduling a time to speak. You can select a slot directly here: [Schedule Link]. Looking forward to connecting!\n\nBest regards," },
    ];
  }

  if (g.includes("quote") || g.includes("price") || g.includes("cost") || g.includes("proposal") || g.includes("estimate") || g.includes("pricing")) {
    return [
      { dayOffset: 0, channel: "whatsapp", body: "Hi {{first_name}}, thanks for requesting pricing details! I'm preparing a customized estimate for you. Are there any specific requirements or timelines to factor in?" },
      { dayOffset: 2, channel: "whatsapp", body: "Hi {{first_name}}, following up on your quotation. Did you get a chance to review the numbers, or would you like to discuss any adjustments?" },
      { dayOffset: 5, channel: "email", body: "Hi {{first_name}},\n\nChecking in on the proposal we shared. We can tailor the package to meet your exact budget. Let me know if you'd like to jump on a quick call to go over it.\n\nBest regards," },
    ];
  }

  if (g.includes("real estate") || g.includes("property") || g.includes("home") || g.includes("site visit") || g.includes("tour") || g.includes("flat") || g.includes("villa")) {
    return [
      { dayOffset: 0, channel: "whatsapp", body: "Hi {{first_name}}, thanks for your interest in our property! When would be a good day for an exclusive site visit or video walkthrough?" },
      { dayOffset: 2, channel: "whatsapp", body: "Hi {{first_name}}, sharing the brochure and floor plans with you. Would this weekend work for an in-person viewing?" },
      { dayOffset: 5, channel: "whatsapp", body: "Hi {{first_name}}, we have a few viewing slots open this Saturday. Let me know if you'd like me to reserve a spot for you!" },
    ];
  }

  const topic = goal
    .replace(/^(nurture|follow up|reach out|sell|send|help|close|convert|onboard|target)\s+/i, "")
    .trim() || "your inquiry";

  return [
    { dayOffset: 0, channel: "whatsapp", body: `Hi {{first_name}}, thanks for connecting with us regarding ${topic}! I'm here to answer any questions and guide you through the next steps.` },
    { dayOffset: 2, channel: "whatsapp", body: `Hi {{first_name}}, following up regarding ${topic}. Did you have a chance to look things over? Happy to jump on a quick chat whenever suits you.` },
    { dayOffset: 5, channel: "email", body: `Hi {{first_name}},\n\nWanted to circle back on ${topic}. Let me know if you have any questions or if you'd like to schedule a 10-minute call this week.\n\nBest regards,` },
    { dayOffset: 8, channel: "whatsapp", body: `Hi {{first_name}}, just checking in one final time regarding ${topic}. I'm here whenever you're ready to move forward!` },
  ];
}

// AI sequence generator — turns a plain-English goal into ready-to-edit sequence steps.
export async function generateSequenceAction(goal: string): Promise<{ steps: GeneratedSequenceStep[]; ai: boolean; outOfCredits?: boolean }> {
  const { organizationId } = await requireOrg();
  const clean = String(goal || "").slice(0, 500).trim();
  const contextual = buildContextualSequence(clean);

  if (!clean || !aiEnabled()) {
    return { steps: contextual, ai: false };
  }
  if (!(await PlanService.useAiCredit(organizationId))) return { steps: contextual, ai: false, outOfCredits: true };

  try {
    const org = await OrgService.getOrganization(organizationId);
    const raw = await generateText(`${businessPreamble(org)}\n\n${SEQ_SYSTEM}`, `Goal: ${clean}\nAudience: sales leads.`, 800);
    if (!raw) {
      await PlanService.refundAiCredit(organizationId);
      return { steps: contextual, ai: false };
    }

    const jsonStart = raw.indexOf("[");
    const jsonEnd = raw.lastIndexOf("]");
    if (jsonStart === -1 || jsonEnd === -1) return { steps: contextual, ai: false };

    const parsed = JSON.parse(raw.slice(jsonStart, jsonEnd + 1));
    const steps: GeneratedSequenceStep[] = (Array.isArray(parsed) ? parsed : [])
      .map((s: any): GeneratedSequenceStep => ({
        dayOffset: Math.max(0, Math.floor(Number(s.dayOffset) || 0)),
        channel: s.channel === "email" ? "email" : "whatsapp",
        body: String(s.body || "").slice(0, 500),
      }))
      .filter((s) => s.body.length > 0);
    return steps.length ? { steps, ai: true } : { steps: contextual, ai: false };
  } catch {
    return { steps: contextual, ai: false };
  }
}

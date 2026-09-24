"use server";

import { z } from "zod";
import { requireOrg } from "@/lib/rbac";
import { generateText, aiEnabled } from "@/lib/ai/client";
import { buildLeadContext, businessPreamble, hasAiWorthyContext, UNTRUSTED_NOTE } from "@/lib/ai/leadBrief";
import { loadLeadAiContext } from "@/lib/ai/leadContext";
import { getActionableLead } from "@/lib/leads/access";
import { db } from "@/db";
import { leads } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { OrgService } from "@/domains/organizations/service";

const TONES = {
  friendly: "warm and friendly, like a helpful person — not salesy",
  professional: "polite and professional",
  short: "very brief — one or two short sentences",
} as const;

const draftSchema = z.object({
  leadId: z.guid(),
  channel: z.enum(["whatsapp", "email"]).default("whatsapp"),
  tone: z.enum(["friendly", "professional", "short"]).default("friendly"),
  // Free text so any language works ("Hindi", "Hinglish", "Tamil"…); "auto" = match the lead.
  language: z.string().trim().max(40).default("auto"),
});

function draftSystem(channel: "whatsapp" | "email", tone: keyof typeof TONES, language: string) {
  const lang =
    language && language.toLowerCase() !== "auto"
      ? `Write in ${language}.`
      : "Write in the language the lead used in their messages or form answers; default to English.";
  const shape =
    channel === "email"
      ? 'Return a short email as: first line "Subject: <subject>", then a blank line, then the body (under 120 words).'
      : "Return ONLY the WhatsApp message text (under 60 words) — no preamble, no quotes.";
  return (
    `You are helping a salesperson write the next ${channel === "email" ? "email" : "WhatsApp message"} to a lead. ` +
    `Tone: ${TONES[tone]}. ${lang} Be specific to what the lead asked for (their form answers and messages) ` +
    "and to where the conversation is; don't repeat what was already sent. End with one clear next step. " +
    "No emojis unless natural. Use ONLY facts from the context — never invent prices, offers, dates or details. " +
    `${shape}\n${UNTRUSTED_NOTE}`
  );
}

export async function draftLeadReplyAction(
  data: unknown,
): Promise<{ draft: string; subject?: string; ai: boolean }> {
  const { leadId, channel, tone, language } = draftSchema.parse(data);
  const access = await getActionableLead(leadId);
  if (!access) throw new Error("Lead not found");
  const { lead, organizationId } = access;

  const firstName = (lead.name ?? "there").split(" ")[0];
  const fallback =
    channel === "email"
      ? { subject: "Following up", draft: `Hi ${firstName},\n\nJust following up — do you have any questions I can help with? Happy to set up a quick call whenever suits you.\n\nBest regards,` }
      : { draft: `Hi ${firstName}, just following up — do you have any questions I can help with? Happy to jump on a quick call whenever suits you.` };

  // Graceful fallback when AI isn't configured — still useful, just not generated.
  if (!aiEnabled()) return { ...fallback, ai: false };

  const [{ activities, extras }, org] = await Promise.all([
    loadLeadAiContext(lead, organizationId),
    OrgService.getOrganization(organizationId),
  ]);
  const prompt = `${buildLeadContext(lead, activities, extras)}\n\nWrite the next ${channel === "email" ? "email" : "WhatsApp message"} to send this lead.`;
  const raw = await generateText(`${businessPreamble(org)}\n\n${draftSystem(channel, tone, language)}`, prompt);
  if (!raw) return { ...fallback, ai: false };

  if (channel === "email") {
    const m = raw.match(/^\s*Subject:\s*(.+)\n+([\s\S]*)$/i);
    return m ? { subject: m[1].trim(), draft: m[2].trim(), ai: true } : { subject: fallback.subject, draft: raw, ai: true };
  }
  return { draft: raw, ai: true };
}

const RECAP_SYSTEM = `You summarize a sales lead for a busy salesperson.
Return ONE or TWO short sentences: what the lead wants (from their form answers/messages), where things stand, and the single most useful next step.
No preamble, no bullet points, no quotes. Plain, specific, factual. ${UNTRUSTED_NOTE}`;

type RecapCache = { text: string; at: string; sig: string };

// AI recap — a one-glance "where this lead stands". Saved on the lead and reused until the lead
// changes (new activity/message/status/stage/answers), so opening the page again costs no AI call.
export async function summarizeLeadAction(
  data: unknown,
): Promise<{ summary: string; ai: boolean; generatedAt?: string; cached?: boolean }> {
  const { leadId, refresh } = z.object({ leadId: z.guid(), refresh: z.boolean().optional() }).parse(data);
  const access = await getActionableLead(leadId);
  if (!access) throw new Error("Lead not found");
  const { lead, organizationId } = access;

  const { activities, extras } = await loadLeadAiContext(lead, organizationId);
  const sig = [activities.length, extras.messages?.length ?? 0, lead.status, lead.stageId ?? "", extras.answers?.length ?? 0, lead.nextFollowUpAt?.toISOString() ?? ""].join("|");

  const cached = (lead.customData as { _aiRecap?: RecapCache } | null)?._aiRecap;
  if (!refresh && cached?.sig === sig) return { summary: cached.text, ai: true, generatedAt: cached.at, cached: true };

  // Brand-new leads with form answers are exactly when a recap helps most — only skip the AI when
  // there's genuinely nothing to read.
  if (!aiEnabled() || !hasAiWorthyContext(activities, extras)) {
    const last = activities[0];
    return {
      summary: last
        ? `Last touch: ${last.type}${last.content ? ` — ${last.content}` : ""}. Status is ${extras.statusLabel ?? lead.status}.`
        : `New lead with no activity yet — reach out to make first contact.`,
      ai: false,
    };
  }

  const org = await OrgService.getOrganization(organizationId);
  const summary = await generateText(`${businessPreamble(org)}\n\n${RECAP_SYSTEM}`, buildLeadContext(lead, activities, extras), 200);
  if (!summary) return { summary: `Status is ${extras.statusLabel ?? lead.status}. Review recent activity and follow up.`, ai: false };

  const at = new Date().toISOString();
  // jsonb_set so this can't clobber a concurrent customData write (e.g. score recalculation).
  await db
    .update(leads)
    .set({ customData: sql`jsonb_set(coalesce(${leads.customData}, '{}'::jsonb), '{_aiRecap}', ${JSON.stringify({ text: summary, at, sig })}::jsonb)` })
    .where(and(eq(leads.id, leadId), eq(leads.organizationId, organizationId)));
  return { summary, ai: true, generatedAt: at };
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
export async function generateSequenceAction(goal: string): Promise<{ steps: GeneratedSequenceStep[]; ai: boolean }> {
  await requireOrg();
  const clean = String(goal || "").slice(0, 500).trim();
  const contextual = buildContextualSequence(clean);

  if (!clean || !aiEnabled()) {
    return { steps: contextual, ai: false };
  }

  try {
    const { organizationId } = await requireOrg();
    const org = await OrgService.getOrganization(organizationId);
    const raw = await generateText(`${businessPreamble(org)}\n\n${SEQ_SYSTEM}`, `Goal: ${clean}\nAudience: sales leads.`, 800);
    if (!raw) return { steps: contextual, ai: false };

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

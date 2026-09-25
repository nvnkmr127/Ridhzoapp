import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { leads } from "@/db/schema";
import { generateText, aiEnabled } from "@/lib/ai/client";
import { buildLeadContext, businessPreamble, hasAiWorthyContext, UNTRUSTED_NOTE } from "@/lib/ai/leadBrief";
import { loadLeadAiContext } from "@/lib/ai/leadContext";
import { OrgService } from "@/domains/organizations/service";
import { PlanService } from "@/domains/billing/planService";
import type { LeadService } from "@/domains/leads/service";

// AI reply drafts and lead recaps. Shared by the web server actions and the mobile API; callers check
// lead access first and pass the lead in.

type Lead = NonNullable<Awaited<ReturnType<typeof LeadService.getLead>>>;

export const TONES = {
  friendly: "warm and friendly, like a helpful person — not salesy",
  professional: "polite and professional",
  short: "very brief — one or two short sentences",
} as const;

export type Tone = keyof typeof TONES;

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

export async function draftReplyForLead(
  lead: Lead,
  organizationId: string,
  { channel, tone, language }: { channel: "whatsapp" | "email"; tone: Tone; language: string },
): Promise<{ draft: string; subject?: string; ai: boolean; outOfCredits?: boolean }> {
  const firstName = (lead.name ?? "there").split(" ")[0];
  const fallback =
    channel === "email"
      ? { subject: "Following up", draft: `Hi ${firstName},\n\nJust following up — do you have any questions I can help with? Happy to set up a quick call whenever suits you.\n\nBest regards,` }
      : { draft: `Hi ${firstName}, just following up — do you have any questions I can help with? Happy to jump on a quick call whenever suits you.` };

  // Graceful fallback when AI isn't configured — still useful, just not generated.
  if (!aiEnabled()) return { ...fallback, ai: false };
  if (!(await PlanService.useAiCredit(organizationId))) return { ...fallback, ai: false, outOfCredits: true };

  const [{ activities, extras }, org] = await Promise.all([
    loadLeadAiContext(lead, organizationId),
    OrgService.getOrganization(organizationId),
  ]);
  const prompt = `${buildLeadContext(lead, activities, extras)}\n\nWrite the next ${channel === "email" ? "email" : "WhatsApp message"} to send this lead.`;
  const raw = await generateText(`${businessPreamble(org)}\n\n${draftSystem(channel, tone, language)}`, prompt);
  if (!raw) {
    await PlanService.refundAiCredit(organizationId);
    return { ...fallback, ai: false };
  }

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

// A one-glance "where this lead stands". Saved on the lead and reused until the lead changes (new
// activity/message/status/stage/answers), so opening it again costs no AI call.
export async function recapForLead(
  lead: Lead,
  organizationId: string,
  refresh = false,
): Promise<{ summary: string; ai: boolean; generatedAt?: string; cached?: boolean; outOfCredits?: boolean }> {
  const leadId = lead.id;
  const { activities, extras } = await loadLeadAiContext(lead, organizationId);
  const sig = [activities.length, extras.messages?.length ?? 0, lead.status, lead.stageId ?? "", extras.answers?.length ?? 0, lead.nextFollowUpAt?.toISOString() ?? ""].join("|");

  const cached = (lead.customData as { _aiRecap?: RecapCache } | null)?._aiRecap;
  if (!refresh && cached?.sig === sig) return { summary: cached.text, ai: true, generatedAt: cached.at, cached: true };

  // Brand-new leads with form answers are exactly when a recap helps most — only skip the AI when
  // there's genuinely nothing to read.
  const outOfCredits = aiEnabled() && hasAiWorthyContext(activities, extras) && !(await PlanService.useAiCredit(organizationId));
  if (!aiEnabled() || !hasAiWorthyContext(activities, extras) || outOfCredits) {
    const last = activities[0];
    return {
      outOfCredits,
      summary: last
        ? `Last touch: ${last.type}${last.content ? ` — ${last.content.trim().replace(/[.\s]+$/, "")}` : ""}. Status is ${extras.statusLabel ?? lead.status}.`
        : `New lead with no activity yet — reach out to make first contact.`,
      ai: false,
    };
  }

  const org = await OrgService.getOrganization(organizationId);
  const summary = await generateText(`${businessPreamble(org)}\n\n${RECAP_SYSTEM}`, buildLeadContext(lead, activities, extras), 200);
  if (!summary) {
    await PlanService.refundAiCredit(organizationId);
    return { summary: `Status is ${extras.statusLabel ?? lead.status}. Review recent activity and follow up.`, ai: false };
  }

  const at = new Date().toISOString();
  // jsonb_set so this can't clobber a concurrent customData write (e.g. score recalculation).
  await db
    .update(leads)
    .set({ customData: sql`jsonb_set(coalesce(${leads.customData}, '{}'::jsonb), '{_aiRecap}', ${JSON.stringify({ text: summary, at, sig })}::jsonb)` })
    .where(and(eq(leads.id, leadId), eq(leads.organizationId, organizationId)));
  return { summary, ai: true, generatedAt: at };
}

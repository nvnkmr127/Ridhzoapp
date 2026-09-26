import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { leads } from "@/db/schema";
import { generateText, aiEnabled } from "@/lib/ai/client";
import { hasAiWorthyContext, leadSystemPrompt } from "@/lib/ai/leadBrief";
import { leadAiContext } from "@/lib/ai/leadContext";
import { OrgService } from "@/domains/organizations/service";
import { PlanService } from "@/domains/billing/planService";
import { CustomFieldService } from "@/domains/customFields/service";
import { briefFormatInstructions, parseLeadBrief, visiblePlan, type LeadPlan, type PlanInput } from "@/lib/ai/leadPlan";
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
    shape
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

  const [{ text: context }, org] = await Promise.all([
    leadAiContext(lead, organizationId),
    OrgService.getOrganization(organizationId),
  ]);
  const prompt = `${context}\n\nWrite the next ${channel === "email" ? "email" : "WhatsApp message"} to send this lead.`;
  const raw = await generateText(leadSystemPrompt(org, draftSystem(channel, tone, language)), prompt);
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

const RECAP_SYSTEM = `You brief a busy salesperson on one lead and propose concrete updates for them to approve.
Recap: plain, specific, factual — what the lead wants (from their answers, notes and messages), where things stand right now given the latest activity, and the single most useful next step.
Suggestions are only proposals the rep accepts or dismisses, so only make ones the context clearly supports.`;

export type RecapCache = { text: string; at: string; sig: string; plan?: LeadPlan; dismissed?: string[] };

export type RecapResult = {
  summary: string;
  ai: boolean;
  generatedAt?: string;
  cached?: boolean;
  outOfCredits?: boolean;
  /** AI suggestions not yet applied or dismissed (custom fields, status, next step). */
  plan?: LeadPlan;
};

// A one-glance "where this lead stands" plus AI suggestions (fields found in the conversation, a
// status change, the next step), from ONE AI call. Saved on the lead and reused until anything in its
// AI context changes (the context signature — notes, calls, messages, follow-ups, meetings, status,
// owner, fields…), so opening it again costs no AI call but it's never stale.
export async function recapForLead(lead: Lead, organizationId: string, refresh = false): Promise<RecapResult> {
  const leadId = lead.id;
  const { activities, extras, text: context, signature: sig, fieldDefs, statuses } = await leadAiContext(lead, organizationId);

  const cached = (lead.customData as { _aiRecap?: RecapCache } | null)?._aiRecap;
  if (!refresh && cached?.sig === sig) {
    return { summary: cached.text, ai: true, generatedAt: cached.at, cached: true, plan: visiblePlan(cached.plan, cached.dismissed) };
  }

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

  const defs = fieldDefs as unknown as Parameters<typeof CustomFieldService.validateWith>[0];
  const planInput: PlanInput = {
    fields: fieldDefs.map((d) => ({ key: d.key, label: d.label, type: d.type, options: Array.isArray(d.options) ? d.options : [] })),
    current: (lead.customData as Record<string, unknown> | null) ?? {},
    // The field's own validation (types, options) as a non-admin — so a suggestion is always one the
    // rep's accept can actually save.
    coerce: (key, value) => {
      try {
        return CustomFieldService.validateWith(defs, { [key]: value }, { lenient: true, isAdmin: false })[key];
      } catch {
        return undefined;
      }
    },
    statuses: statuses.map((st) => ({ key: st.key, label: st.label })),
    currentStatus: lead.status,
    now: extras.now ?? new Date(),
  };

  const org = await OrgService.getOrganization(organizationId);
  const system = leadSystemPrompt(org, `${RECAP_SYSTEM}\n\n${briefFormatInstructions(planInput, extras.timezone ?? "UTC")}`);
  const raw = await generateText(system, context, 900);
  if (!raw) {
    await PlanService.refundAiCredit(organizationId);
    return { summary: `Status is ${extras.statusLabel ?? lead.status}. Review recent activity and follow up.`, ai: false };
  }
  const { recap: summary, plan } = parseLeadBrief(raw, planInput);

  const at = new Date().toISOString();
  // Keep what the rep already applied/dismissed, so the same suggestion doesn't come back.
  const dismissed = (cached?.dismissed ?? []).slice(-100);
  const saved: RecapCache = { text: summary, at, sig, plan, dismissed };
  // jsonb_set so this can't clobber a concurrent customData write (e.g. score recalculation).
  await db
    .update(leads)
    .set({ customData: sql`jsonb_set(coalesce(${leads.customData}, '{}'::jsonb), '{_aiRecap}', ${JSON.stringify(saved)}::jsonb)` })
    .where(and(eq(leads.id, leadId), eq(leads.organizationId, organizationId)));
  return { summary, ai: true, generatedAt: at, plan: visiblePlan(plan, dismissed) };
}

/** Records a suggestion as applied or dismissed, so it stops showing (and isn't proposed again). */
export async function markAiSuggestionDone(leadId: string, organizationId: string, id: string): Promise<void> {
  await db
    .update(leads)
    .set({
      customData: sql`case when (${leads.customData} -> '_aiRecap') is not null then jsonb_set(${leads.customData}, '{_aiRecap,dismissed}', coalesce(${leads.customData}->'_aiRecap'->'dismissed', '[]'::jsonb) || to_jsonb(${id}::text)) else ${leads.customData} end`,
    })
    .where(and(eq(leads.id, leadId), eq(leads.organizationId, organizationId)));
}

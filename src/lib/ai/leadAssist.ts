import { createHash } from "crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { leads } from "@/db/schema";
import { generateText, aiEnabled } from "@/lib/ai/client";
import { hasAiWorthyContext, leadSystemPrompt } from "@/lib/ai/leadBrief";
import { leadAiContext } from "@/lib/ai/leadContext";
import { loadAiBusiness } from "@/domains/organizations/aiBusiness";
import { PlanService } from "@/domains/billing/planService";
import { CustomFieldService } from "@/domains/customFields/service";
import { BROKEN_RECAP, briefFormatInstructions, parseLeadBrief, visiblePlan, type LeadPlan, type PlanInput } from "@/lib/ai/leadPlan";
import type { LeadService } from "@/domains/leads/service";

// AI reply drafts and lead recaps. Shared by the web server actions and the mobile API; callers check
// lead access first and pass the lead in.

type Lead = NonNullable<Awaited<ReturnType<typeof LeadService.getLead>>>;

export const TONES = {
  // "auto" = no per-draft override: the business profile's own tone (if set) applies.
  auto: "in the business's usual voice — warm and natural if none is given",
  friendly: "warm and friendly, like a helpful person — not salesy",
  professional: "polite and professional",
  short: "very brief — one or two short sentences",
} as const;

export type Tone = keyof typeof TONES;

function draftSystem(channel: "whatsapp" | "email", tone: keyof typeof TONES, language: string) {
  const lang =
    language && language.toLowerCase() !== "auto"
      ? `Write in ${language}.`
      : "Write in the language the lead used in their messages or form answers; otherwise the business's default reply language if one is given, else English.";
  const shape =
    channel === "email"
      ? 'Return a short email as: first line "Subject: <subject>", then a blank line, then the body (under 120 words).'
      : "Return ONLY the WhatsApp message text (under 60 words) — no preamble, no quotes.";
  const wrap = " Do not explain or think out loud: wrap the final message in <message></message> tags and write nothing outside them.";
  return (
    `You are helping a salesperson write the next ${channel === "email" ? "email" : "WhatsApp message"} to a lead. ` +
    `Tone: ${TONES[tone]}. ${lang} If the lead's latest message is unanswered, reply to it directly first (answer their question, acknowledge what they said) before anything else. Be specific to what the lead asked for (their form answers and messages) ` +
    "and to where the conversation is; don't repeat what was already sent. End with one clear next step. " +
    "Follow the business's emoji and sign-off preferences if given; otherwise no emojis unless natural. Use ONLY facts from the context — never invent prices, offers, dates or details. " +
    shape +
    wrap
  );
}

// Models often wrap the message in quotes/code fences or add "Here's a draft:" — none of that should reach the send box.
export function cleanDraft(raw: string): string {
  // Some models think out loud in the reply. The message is inside <message> (an unclosed one at the
  // end counts, for a reply cut off by the token limit); reasoning tags are dropped.
  const noThink = raw.replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, "");
  const tagged = noThink.match(/<message>([\s\S]*?)(?:<\/message>|$)/gi)?.pop()?.replace(/^<message>|<\/message>$/gi, "");
  let t = (tagged ?? noThink).replace(/^```\w*\s*|\s*```$/g, "").trim();
  t = t.replace(/^(?:here(?:'s| is)[^\n]*:|sure[^\n]*:)\s*\n+/i, "").trim();
  const q = t.match(/^["“]([\s\S]*)["”]$/);
  return (q ? q[1] : t).trim();
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
  if (!(await PlanService.consumeAiCredit(organizationId))) return { ...fallback, ai: false, outOfCredits: true };

  const { text: context } = await leadAiContext(lead, organizationId);
  const org = await loadAiBusiness(organizationId, { sourceId: lead.sourceId, query: context });
  const prompt = `${context}\n\nWrite the next ${channel === "email" ? "email" : "WhatsApp message"} to send this lead.`;
  const raw = await generateText(leadSystemPrompt(org, draftSystem(channel, tone, language)), prompt);
  if (!raw) {
    await PlanService.refundAiCredit(organizationId);
    return { ...fallback, ai: false };
  }

  const cleaned = cleanDraft(raw);
  // Untagged reasoning ("Let me analyze…", "Wait, …") or an essay is not a message to send: better the
  // plain starter than a wall of analysis in the send box.
  if (!/<message>/i.test(raw) && (cleaned.split(/\s+/).length > (channel === "email" ? 220 : 110) || /^\s*(let me|wait,|okay,|first,? i)/im.test(cleaned))) {
    await PlanService.refundAiCredit(organizationId);
    return { ...fallback, ai: false };
  }
  if (channel === "email") {
    const m = cleaned.match(/^\s*Subject:\s*(.+)\n+([\s\S]*)$/i);
    return m ? { subject: m[1].trim(), draft: m[2].trim(), ai: true } : { subject: fallback.subject, draft: cleaned, ai: true };
  }
  return { draft: cleaned, ai: true };
}

const RECAP_SYSTEM = `You brief a busy salesperson on one lead and propose concrete updates for them to approve.
Recap: plain, specific, factual — what the lead wants (from their answers, notes and messages), where things stand right now given the latest activity, and the single most useful next step.
Suggestions are only proposals the rep accepts or dismisses, so only make ones the context clearly supports.`;

// Plain recap with no AI: the newest activity (a note counts) and the status.
function lastTouchSummary(activities: { type: string; content: string | null; by?: string | null }[], status: string): string {
  // System notes ("Lead was assigned to…", "Lead came in from…") have no author; a person's note or call does.
  const last = activities.find((a) => a.by);
  return last
    ? `Last touch: ${last.type}${last.content ? ` — ${last.content.trim().replace(/\s+/g, " ").slice(0, 200).replace(/[.\s]+$/, "")}` : ""}. Status is ${status}.`
    : `New lead with no activity from your team yet — reach out to make first contact.`;
}

export type RecapCache = { text: string; at: string; sig: string; bsig?: string; plan?: LeadPlan; dismissed?: string[] };

export type RecapResult = {
  summary: string;
  ai: boolean;
  generatedAt?: string;
  cached?: boolean;
  /** cachedOnly: the saved recap predates the lead's latest changes (refresh to update). */
  stale?: boolean;
  /** cachedOnly: no recap saved yet — generating one costs a credit, so the caller asks first. */
  pending?: boolean;
  outOfCredits?: boolean;
  /** AI suggestions not yet applied or dismissed (custom fields, status, next step). */
  plan?: LeadPlan;
};

// A one-glance "where this lead stands" plus AI suggestions (fields found in the conversation, a
// status change, the next step), from ONE AI call. Saved on the lead and reused until anything in its
// AI context changes (the context signature — notes, calls, messages, follow-ups, meetings, status,
// owner, fields…), so opening it again costs no AI call but it's never stale.
// cachedOnly (the mobile app on opening a lead): never spend a credit — return the saved recap even if
// it's out of date (stale, without its suggestions), or `pending` when there is none yet.
export const RECAP_TTL_MS = 3 * 60 * 60 * 1000; // 3 hours

export async function recapForLead(lead: Lead, organizationId: string, refresh = false, opts: { cachedOnly?: boolean } = {}): Promise<RecapResult> {
  const leadId = lead.id;
  const [{ activities, extras, text: context, signature: leadSig, fieldDefs, statuses }, org] = await Promise.all([
    leadAiContext(lead, organizationId),
    loadAiBusiness(organizationId, { sourceId: lead.sourceId }),
  ]);
  // The recap is grounded in the business context too — editing it (what you sell, rules, currency,
  // the source note) must not leave recaps written under the old one. Reference docs are per-request
  // snippets, so they stay out of the signature.
  const bsig = createHash("sha1")
    .update(JSON.stringify([org.name, org.industry, org.city, org.currency, org.phone, org.aiContext, org.aiProfile, org.sourceContext]))
    .digest("hex")
    .slice(0, 12);
  const sig = `${leadSig}:${bsig}`;

  const cached = (lead.customData as { _aiRecap?: RecapCache } | null)?._aiRecap;
  const isFresh = cached?.at && Date.now() - new Date(cached.at).getTime() < RECAP_TTL_MS;
  if (!refresh && cached?.sig === sig && isFresh) {
    return { summary: cached.text, ai: true, generatedAt: cached.at, cached: true, plan: visiblePlan(cached.plan, cached.dismissed) };
  }
  if (!refresh && opts.cachedOnly && aiEnabled() && hasAiWorthyContext(activities, extras)) {
    // Suggestions from an out-of-date recap may no longer fit, so they're left out until it's refreshed.
    return cached
      ? { summary: cached.text, ai: true, generatedAt: cached.at, cached: true, stale: true }
      : { summary: "", ai: false, pending: true };
  }

  // Brand-new leads with form answers are exactly when a recap helps most — only skip the AI when
  // there's genuinely nothing to read.
  const outOfCredits = aiEnabled() && hasAiWorthyContext(activities, extras) && !(await PlanService.consumeAiCredit(organizationId));
  if (!aiEnabled() || !hasAiWorthyContext(activities, extras) || outOfCredits) {
    return { outOfCredits, summary: lastTouchSummary(activities, extras.statusLabel ?? lead.status), ai: false };
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

  const orgWithKnowledge = await loadAiBusiness(organizationId, { sourceId: lead.sourceId, query: context });
  const system = leadSystemPrompt(orgWithKnowledge, `${RECAP_SYSTEM}\n\n${briefFormatInstructions(planInput, extras.timezone ?? "UTC")}`);
  // This model tends to write a long analysis before (or instead of) the JSON, so it gets room to finish,
  // and one strict retry when the first reply has no usable JSON. Same credit — it's one recap.
  let raw = await generateText(system, context, 3000);
  if (raw && parseLeadBrief(raw, planInput).recap === BROKEN_RECAP) {
    raw = (await generateText(`${system}\n\nReply with the JSON object ONLY. The first character of your reply must be "{". No analysis, no preface.`, context, 3000)) ?? raw;
  }
  if (!raw) {
    await PlanService.refundAiCredit(organizationId);
    return { summary: `Status is ${extras.statusLabel ?? lead.status}. Review recent activity and follow up.`, ai: false };
  }
  const { recap: summary, plan } = parseLeadBrief(raw, planInput);
  if (summary === BROKEN_RECAP) {
    // Cut off or malformed: saving this would pin the error message as the recap until the lead changes.
    await PlanService.refundAiCredit(organizationId);
    return { summary: lastTouchSummary(activities, extras.statusLabel ?? lead.status), ai: false };
  }

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

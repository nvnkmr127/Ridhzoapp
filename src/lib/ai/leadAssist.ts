import { createHash } from "crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { leads } from "@/db/schema";
import { generateText, generateObject, aiEnabled, AI_TEMPERATURE } from "@/lib/ai/client";
import { hasAiWorthyContext, leadSystemPrompt } from "@/lib/ai/leadBrief";
import { leadAiContext } from "@/lib/ai/leadContext";
import { loadAiBusiness } from "@/domains/organizations/aiBusiness";
import { PlanService } from "@/domains/billing/planService";
import { CustomFieldService } from "@/domains/customFields/service";
import { BROKEN_RECAP, briefFormatInstructions, leadBriefSchema, parseLeadBrief, planFromObject, visiblePlan, type LeadPlan, type PlanCapabilities, type PlanInput } from "@/lib/ai/leadPlan";
import { RECAP_TTL_MS } from "@/lib/ai/recapCache";
import { NextBestActionService } from "@/domains/leads/nextBestActionService";
import { SequenceService } from "@/domains/leads/sequenceService";
import type { NextActionKind } from "@/domains/leads/nextAction";
import type { LeadExtras } from "@/lib/ai/leadBrief";
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
  const raw = await generateText(leadSystemPrompt(org, draftSystem(channel, tone, language)), prompt, 1000, AI_TEMPERATURE.write);
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
//
// RECAP_TTL_MS lives in ./recapCache, not here: this file is server-only and the browser's recap
// panel needs the same number.
export { RECAP_TTL_MS };

/** Minutes within which "you just spoke to them" makes another message a nuisance rather than service. */
const RECENT_CONTACT_MINUTES = 120;

/**
 * Why reaching out right now would be the wrong move, phrased for the rep to read — or null.
 *
 * Deterministic, and derived *before* the model is asked, because the model is shown these same
 * facts as prose and reliably talks past them. "No contact logged in two days, call them now" is
 * the canonical failure: it's advice that costs a rep a relationship with someone they just reached.
 * A future follow-up or a contact minutes ago outranks any judgement the model makes about urgency.
 */
function outreachHold(lead: Lead, now: Date, rule?: { kind: NextActionKind; reason: string } | null): string | null {
  const followUp = lead.nextFollowUpAt ? new Date(lead.nextFollowUpAt) : null;
  if (followUp && followUp.getTime() > now.getTime()) return `A follow-up is already booked for ${followUp.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}.`;
  const last = lead.lastContactedAt ? new Date(lead.lastContactedAt) : null;
  if (last) {
    const mins = Math.round((now.getTime() - last.getTime()) / 60_000);
    if (mins >= 0 && mins < RECENT_CONTACT_MINUTES) return mins < 60 ? `You contacted them ${mins} minute${mins === 1 ? "" : "s"} ago.` : `You contacted them ${Math.round(mins / 60)} hour${mins < 120 ? "" : "s"} ago.`;
  }
  // The rule engine's own "leave them alone" verdict — including a resolved (won/lost) lead.
  if (rule && (rule.kind === "wait" || rule.kind === "do_nothing" || rule.kind === "follow_up")) return rule.reason;
  return null;
}

/**
 * What this lead actually supports right now, so the model is only ever offered executable actions
 * and the validator has something concrete to re-check against. Read from data already loaded.
 */
function capabilitiesFor(lead: Lead, extras: LeadExtras, hasEnrollableSequence: boolean, now: Date): PlanCapabilities {
  const meetings = extras.meetings ?? [];
  return {
    phone: !!lead.phone,
    email: !!lead.email,
    inSequence: (extras.sequences ?? []).some((s) => s.status === "active"),
    hasEnrollableSequence,
    shareableContent: (extras.contentOpens ?? []).length > 0,
    upcomingMeeting: meetings.some((m) => m.status === "scheduled" && new Date(m.startAt).getTime() > now.getTime()),
    // A meeting whose time has passed with no outcome recorded is exactly what needs logging.
    unloggedMeeting: meetings.some((m) => new Date(m.startAt).getTime() + m.durationMinutes * 60_000 < now.getTime() && !m.outcome),
    hasOwner: !!lead.ownerId,
  };
}

/** The earliest meeting still ahead of us — the input shape `NextBestActionService` expects. */
function upcomingMeetingFor(extras: LeadExtras, now: Date) {
  // `meetings` is newest first, so the last scheduled-and-future one is the earliest upcoming.
  const m = (extras.meetings ?? []).filter((x) => x.status === "scheduled" && new Date(x.startAt).getTime() > now.getTime()).at(-1);
  return m ? { startAt: m.startAt, durationMinutes: m.durationMinutes, label: m.title } : null;
}

/**
 * The deterministic rules' answer for this lead. Computed here rather than only on the lead page so
 * that background recaps are vetted by exactly the same rules a rep sees — otherwise prewarmed
 * suggestions (and the alerts they'll later trigger) would be judged by a weaker standard.
 */
function ruleNextFor(lead: Lead, extras: LeadExtras, now: Date) {
  const recent = [...(extras.contentOpens ?? [])].filter((c) => c.viewCount > 0).sort((a, b) => new Date(b.lastViewedAt ?? 0).getTime() - new Date(a.lastViewedAt ?? 0).getTime())[0];
  return NextBestActionService.getRecommendation({
    status: lead.status,
    statusCategory: extras.statusCategory,
    lastContactedAt: lead.lastContactedAt,
    nextFollowUpAt: lead.nextFollowUpAt,
    score: lead.score ?? 0,
    phone: lead.phone,
    email: lead.email,
    recentContentOpen: recent ? { title: recent.title, count: recent.viewCount, lastViewedAt: recent.lastViewedAt } : null,
    unansweredStreak: extras.unansweredStreak,
    meeting: upcomingMeetingFor(extras, now),
    bestContactWindow: extras.bestContactTime,
  }).nextAction;
}

export async function recapForLead(lead: Lead, organizationId: string, refresh = false, opts: { cachedOnly?: boolean; billable?: boolean; ruleNext?: { kind: NextActionKind; reason: string } | null } = {}): Promise<RecapResult> {
  const leadId = lead.id;
  const [{ activities, extras, text: context, signature: leadSig, fieldDefs, statuses }, org, enrollableSequences] = await Promise.all([
    leadAiContext(lead, organizationId),
    loadAiBusiness(organizationId, { sourceId: lead.sourceId }),
    // Only so the AI can be told a sequence exists to enroll into. Cheap, and it stops the model
    // offering "put them on a sequence" to a workspace that has none.
    SequenceService.list(organizationId).then((rows) => rows.filter((s) => s.isActive && s.stepCount > 0)).catch(() => []),
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
  // billable:false is the background prewarm — warming a cache the rep hasn't asked for is our cost,
  // not theirs, so it never draws on the workspace's monthly AI credits (which exist to pay for work
  // someone actually requested).
  const billable = opts.billable !== false;
  const outOfCredits =
    billable && aiEnabled() && hasAiWorthyContext(activities, extras) && !(await PlanService.consumeAiCredit(organizationId));
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
    capabilities: capabilitiesFor(lead, extras, enrollableSequences.length > 0, extras.now ?? new Date()),
    holdOutreach: outreachHold(lead, extras.now ?? new Date(), opts.ruleNext ?? ruleNextFor(lead, extras, extras.now ?? new Date())),
  };

  const orgWithKnowledge = await loadAiBusiness(organizationId, { sourceId: lead.sourceId, query: context });
  const system = leadSystemPrompt(orgWithKnowledge, `${RECAP_SYSTEM}\n\n${briefFormatInstructions(planInput, extras.timezone ?? "UTC")}`);

  // Primary path: generation is constrained by the schema, so there is no JSON to extract and no
  // "cut off before the JSON" failure mode — the two things that used to cost a 3000-token retry.
  // Everything still goes through validatePlan afterwards; a schema can't know which fields this
  // tenant defined, so it replaces the parsing, not the checking.
  const brief = await generateObject({
    schema: leadBriefSchema,
    schemaName: "lead_brief",
    schemaDescription: "A short recap of where this lead stands, any field values found in their messages with the quote for each, an optional status change, and one concrete next step.",
    system,
    prompt: context,
    maxTokens: 3000,
  });
  let parsed: { recap: string; plan: LeadPlan } | null = brief ? planFromObject(brief, planInput) : null;

  if (!parsed) {
    // The structured call failed (model can't satisfy the schema, or timed out). Fall back to asking
    // for JSON in prose, with one strict retry — a weaker model may manage that when it can't manage
    // the schema. Same credit: it is still one recap.
    let raw = await generateText(system, context, 3000, AI_TEMPERATURE.extract);
    if (raw && parseLeadBrief(raw, planInput).recap === BROKEN_RECAP) {
      raw = (await generateText(`${system}\n\nReply with the JSON object ONLY. The first character of your reply must be "{". No analysis, no preface.`, context, 3000, AI_TEMPERATURE.extract)) ?? raw;
    }
    if (raw) parsed = parseLeadBrief(raw, planInput);
  }

  if (!parsed) {
    if (billable) await PlanService.refundAiCredit(organizationId);
    return { summary: `Status is ${extras.statusLabel ?? lead.status}. Review recent activity and follow up.`, ai: false };
  }
  const { recap: summary, plan } = parsed;
  if (summary === BROKEN_RECAP) {
    // Cut off or malformed: saving this would pin the error message as the recap until the lead changes.
    if (billable) await PlanService.refundAiCredit(organizationId);
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

import "server-only";
import { createHash } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { followUps, leadPipelineStages, leadStatusHistory, users, whatsappMessages } from "@/db/schema";
import { TagService } from "@/domains/tags/service";
import { SequenceService } from "@/domains/leads/sequenceService";
import { ActivityService } from "@/domains/activities/service";
import { ContentSharingService } from "@/domains/leads/contentSharingService";
import { CustomFieldService } from "@/domains/customFields/service";
import { CustomStatusSchemaService } from "@/domains/leads/customStatusSchemaService";
import { LeadSourceService } from "@/domains/leads/sourceService";
import { ScoringService } from "@/domains/leads/scoringService";
import { MeetingService } from "@/domains/meetings/service";
import { bestContactWindow } from "@/domains/leads/bestContactTime";
import { getOrgFormat } from "@/lib/format.server";
import { meetingWhere, modeLabel } from "@/domains/meetings/format";
import { formAnswers } from "@/lib/leads/formAnswers";
import { buildLeadContext, type ActivityLike, type LeadExtras, type LeadLike } from "@/lib/ai/leadBrief";

// ─── The one lead-context strategy for every AI feature ────────────────────────────────────────
//
// Every AI feature that reasons about a lead loads its context HERE (loadLeadAiContext), renders it
// with buildLeadContext (lib/ai/leadBrief) and builds its system prompt with leadSystemPrompt, which
// adds the tenant's business and the shared LEAD_CONTEXT_RULES (newest wins, respect current
// status, use the team's notes). Nothing is cached: each call reads the latest rows, so a note or
// status change made a second ago is in the next answer. New lead data belongs in this loader, so
// every feature picks it up at once instead of drifting apart.

/** Every data source the loader reads, and where it comes from. */
export const LEAD_AI_SOURCES = {
  business: "Workspace name, industry, website, city, phone and the owner's own \"about the business\" text (organizations) — via leadSystemPrompt",
  profile: "Name, channels available (not raw phone/email), company, priority, created date (leads)",
  status: "Status by its custom label and category, the workspace's full status list in order, pipeline stage, lost reason, expected value (leads, custom_status_configs, pipeline stages)",
  statusHistory: "Status changes over time with custom labels and who made them (lead_status_history)",
  source: "Lead source and ad/UTM campaign (lead_sources, customData attribution)",
  score: "Engagement score and the factors behind it (leads.score, customData._scoreFactors)",
  owner: "Assigned sales rep (users)",
  tags: "Tags on the lead (lead_tags)",
  customFields: "Every active custom field the workspace defined — label, type, section, options, required — with the lead's value or 'not filled'; plus form answers that aren't defined fields (custom_field_defs + customData). Admin-only fields are left out: AI output is shown to reps.",
  notes: "Team notes, newest first, with who wrote them (activities type=note)",
  activity: "Full activity history — calls, emails, status changes, automations — newest first, with who logged it (activities)",
  calls: "Call totals over all time, answered / incoming / talk time, unanswered streak, best time to reach (activities)",
  messages: "WhatsApp conversation both ways, last 20 messages (whatsapp_messages)",
  meetings: "Upcoming and past meetings with location and outcome (meetings)",
  followUps: "Pending and completed follow-up tasks (follow_ups)",
  sequences: "Automated sequences the lead is enrolled in (sequence_enrollments)",
  content: "Shared content and how often the lead opened it (shared_links)",
  enrichment: "Data-provider enrichment, labelled as observed (customData._enrichment)",
  nextAction: "The rule-based Next Best Action, so AI advice lines up with the card on the profile",
} as const;

export type LeadAiSource = keyof typeof LEAD_AI_SOURCES;
const ALL_SOURCES = Object.keys(LEAD_AI_SOURCES) as LeadAiSource[];

/**
 * Which sources each lead AI feature uses. All of them get the full record — the classifier too, so
 * a bare "yes" or "ok" is read in light of the conversation and the lead's status rather than alone.
 */
export const LEAD_AI_FEATURES: Record<string, { what: string; sources: readonly LeadAiSource[] }> = {
  recap: { what: "AI recap under Next Best Action (web + mobile)", sources: ALL_SOURCES },
  draftReply: { what: "Write WhatsApp/email with AI (web + mobile)", sources: ALL_SOURCES },
  assistant: { what: "AI assistant — the lead being viewed, and any lead it looks up", sources: ALL_SOURCES },
  replyIntent: { what: "Inbound WhatsApp reply intent/sentiment tagging", sources: ALL_SOURCES },
};

type LoadableLead = LeadLike & {
  id: string;
  stageId?: string | null;
  sourceId?: string | null;
  ownerId?: string | null;
  expectedValue?: string | null;
  lostReason?: string | null;
};

const MESSAGE_LIMIT = 20;

// A custom field's stored value as text for the prompt; null = not filled.
function fieldValue(raw: unknown, type: string): string | null {
  if (raw == null || raw === "") return null;
  if (Array.isArray(raw)) return raw.length ? raw.map(String).join(", ") : null;
  if (type === "checkbox") return raw === true || raw === "true" || raw === 1 || raw === "1" ? "yes" : "no";
  if ((type === "date" || type === "datetime") && !Number.isNaN(Date.parse(String(raw)))) {
    const iso = new Date(String(raw)).toISOString();
    return type === "date" ? iso.slice(0, 10) : iso.slice(0, 16).replace("T", " ") + " UTC";
  }
  const s = typeof raw === "object" ? JSON.stringify(raw) : String(raw).trim();
  return s || null;
}

/**
 * Gathers everything the AI should know about a lead — see LEAD_AI_SOURCES — from the latest data,
 * so a recap, draft, assistant answer or reply classification is grounded in the whole record.
 */
export async function loadLeadAiContext(lead: LoadableLead, organizationId: string) {
  const cd = (lead.customData as Record<string, unknown> | null) ?? {};

  const [activityRows, messages, shares, statuses, defs, stage, source, meetingRows, owner, tagRows, followUpRows, sequenceRows, statusRows] = await Promise.all([
    ActivityService.getLeadActivities(lead.id),
    db
      .select({ direction: whatsappMessages.direction, body: whatsappMessages.body, createdAt: whatsappMessages.createdAt })
      .from(whatsappMessages)
      .where(eq(whatsappMessages.leadId, lead.id))
      .orderBy(desc(whatsappMessages.createdAt))
      .limit(MESSAGE_LIMIT),
    ContentSharingService.listForLead(lead.id).catch(() => []),
    CustomStatusSchemaService.getTenantStatusSchema(organizationId).catch(() => []),
    CustomFieldService.listCached(organizationId).catch(() => []),
    lead.stageId
      ? db
          .select({ name: leadPipelineStages.name })
          .from(leadPipelineStages)
          .where(and(eq(leadPipelineStages.id, lead.stageId), eq(leadPipelineStages.organizationId, organizationId)))
          .limit(1)
          .then((r) => r[0]?.name ?? null)
      : Promise.resolve(null),
    lead.sourceId ? LeadSourceService.getSource(lead.sourceId).catch(() => null) : Promise.resolve(null),
    MeetingService.listForLead(lead.id, organizationId).catch(() => []),
    lead.ownerId
      ? db
          .select({ firstName: users.firstName, lastName: users.lastName, email: users.email })
          .from(users)
          .where(and(eq(users.id, lead.ownerId), eq(users.organizationId, organizationId)))
          .limit(1)
          .then((r) => (r[0] ? [r[0].firstName, r[0].lastName].filter(Boolean).join(" ") || r[0].email : null))
          .catch(() => null)
      : Promise.resolve(null),
    TagService.getForLead(lead.id).catch(() => []),
    db
      .select({
        title: followUps.title,
        type: followUps.type,
        status: followUps.status,
        dueAt: followUps.dueAt,
        completedAt: followUps.completedAt,
        description: followUps.description,
      })
      .from(followUps)
      .where(eq(followUps.leadId, lead.id))
      .orderBy(desc(followUps.dueAt))
      .limit(15)
      .catch(() => []),
    SequenceService.listForLead(lead.id).catch(() => []),
    db
      .select({
        oldStatus: leadStatusHistory.oldStatus,
        newStatus: leadStatusHistory.newStatus,
        createdAt: leadStatusHistory.createdAt,
        firstName: users.firstName,
        lastName: users.lastName,
      })
      .from(leadStatusHistory)
      .leftJoin(users, eq(leadStatusHistory.changedById, users.id))
      .where(eq(leadStatusHistory.leadId, lead.id))
      .orderBy(desc(leadStatusHistory.createdAt))
      .limit(10)
      .catch(() => []),
  ]);

  // Who logged each entry, and when it actually happened (phone calls sync in after the fact).
  const activities: (ActivityLike & (typeof activityRows)[number])[] = activityRows.map((a) => ({
    ...a,
    by: a.userId ? a.userName || null : null,
  }));
  const callStats = ScoringService.callStats(activities);
  const scoreFactors = (cd._scoreFactors as { factors?: { label: string; points: number }[] } | undefined)?.factors;

  const status = statuses.find((s) => s.key === lead.status);
  const statusLabel = (key: string | null) => (key ? statuses.find((s) => s.key === key)?.label ?? key : null);

  // Custom fields: every active definition, filled or not, so the AI knows what the business tracks
  // and what's still missing. Admin-only fields stay out — recaps and drafts are shown to reps.
  const fieldDefs = defs as {
    key: string; label: string; type: string; options: string[] | null; required: boolean;
    disabled: boolean; adminOnly: boolean; section: string | null;
  }[];
  const hiddenKeys = new Set(fieldDefs.filter((d) => d.adminOnly || d.disabled).map((d) => d.key));
  const shownDefs = fieldDefs.filter((d) => !hiddenKeys.has(d.key));
  const definedKeys = new Set(fieldDefs.map((d) => d.key));
  const customFields = shownDefs.map((d) => ({
    label: d.label,
    type: d.type,
    section: d.section || null,
    value: fieldValue(cd[d.key], d.type),
    required: d.required,
    options: Array.isArray(d.options) ? d.options : [],
  }));
  // Anything else the lead gave (form answers without a field definition), minus hidden fields.
  const otherAnswers = formAnswers(cd).filter((a) => !definedKeys.has(a.key));
  const campaign = [cd.meta_campaign_name, cd.utm_campaign, cd.campaign].find((v) => typeof v === "string" && v) as string | undefined;

  const tz = (await getOrgFormat(organizationId).catch(() => null))?.timezone ?? "UTC";
  const window = bestContactWindow(
    [
      ...messages.filter((m) => m.direction === "inbound" && m.createdAt).map((m) => new Date(m.createdAt!)),
      ...activities.filter((a) => a.type === "call" && /Called — Answered/.test(a.content ?? "")).map((a) => new Date(a.createdAt)),
    ],
    tz,
  );

  const extras: LeadExtras = {
    now: new Date(),
    timezone: tz,
    ownerName: owner,
    tags: tagRows.map((t) => t.name),
    followUps: followUpRows,
    calls: {
      total: activities.filter((a) => a.type === "call").length,
      answered: callStats.answeredCalls,
      incoming: callStats.incomingCalls,
      talkTimeSec: callStats.talkTimeSec,
    },
    sequences: sequenceRows.map((q) => ({ name: q.name, status: q.status, currentStep: q.currentStep, nextRunAt: q.nextRunAt })),
    scoreFactors: Array.isArray(scoreFactors) ? scoreFactors : undefined,
    expectedValue: lead.expectedValue ?? (typeof cd.expectedValue === "string" || typeof cd.expectedValue === "number" ? String(cd.expectedValue) : null),
    bestContactTime: window ? `${window.label.toLowerCase()}${window.days ? ` on ${window.days}` : ""}` : null,
    statusLabel: status?.label,
    statusCategory: status?.category,
    stageName: stage,
    lostReason: lead.lostReason ?? null,
    source: source && source.organizationId === organizationId ? source.name : typeof cd.leadSource === "string" ? cd.leadSource : null,
    campaign: campaign ?? null,
    answers: otherAnswers,
    customFields,
    statusOptions: [...statuses].sort((a, b) => a.orderIndex - b.orderIndex).map((st) => ({ key: st.key, label: st.label, category: st.category })),
    statusHistory: statusRows.map((h) => ({
      from: statusLabel(h.oldStatus),
      to: statusLabel(h.newStatus) ?? h.newStatus,
      at: h.createdAt,
      by: [h.firstName, h.lastName].filter(Boolean).join(" ") || null,
    })),
    messages: [...messages].reverse(),
    contentOpens: shares.map((s) => ({ title: s.title, viewCount: s.viewCount, lastViewedAt: s.lastViewedAt })),
    unansweredStreak: callStats.unansweredStreak,
    meetings: meetingRows.map((m) => ({
      mode: m.mode,
      title: modeLabel(m.mode),
      startAt: m.startAt,
      durationMinutes: m.durationMinutes,
      status: m.status,
      where: meetingWhere(m),
      outcome: m.outcome,
    })),
  };

  return { activities, extras };
}

/**
 * The lead's context rendered for a prompt, plus a signature of the underlying facts (not of "now",
 * so it only changes when the lead does). Features that cache AI output — the recap — reuse it until
 * the signature moves, so any new note, call, message, follow-up, tag or field change refreshes it.
 */
export async function leadAiContext(lead: LoadableLead, organizationId: string) {
  const { activities, extras } = await loadLeadAiContext(lead, organizationId);
  const text = buildLeadContext(lead, activities, extras);
  const facts = { ...extras, now: undefined };
  const signature = createHash("sha1")
    .update(
      JSON.stringify({
        lead: [lead.name, lead.status, lead.stageId, lead.ownerId, lead.score, lead.priority, lead.company, !!lead.phone, !!lead.email, lead.lastContactedAt, lead.nextFollowUpAt],
        activities: activities.map((a) => [a.type, a.content, a.occurredAt ?? a.createdAt]),
        facts,
      }),
    )
    .digest("hex")
    .slice(0, 16);
  return { activities, extras, text, signature };
}

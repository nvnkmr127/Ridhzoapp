import "server-only";
import { and, desc, eq, isNull, ne, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { leadAttachments, leadPipelineStages, leads } from "@/db/schema";
import { ActivityService } from "@/domains/activities/service";
import { bestContactWindow } from "@/domains/leads/bestContactTime";
import { ContentSharingService } from "@/domains/leads/contentSharingService";
import { CustomStatusSchemaService } from "@/domains/leads/customStatusSchemaService";
import { LeadSourceService } from "@/domains/leads/sourceService";
import { NextBestActionService } from "@/domains/leads/nextBestActionService";
import { ReengagementCadenceService } from "@/domains/leads/reengagementCadenceService";
import { ScoringService } from "@/domains/leads/scoringService";
import { SequenceService } from "@/domains/leads/sequenceService";
import { MeetingService } from "@/domains/meetings/service";
import { modeLabel } from "@/domains/meetings/format";
import { OrgService } from "@/domains/organizations/service";
import { CustomFieldService } from "@/domains/customFields/service";
import { WhatsAppService } from "@/lib/messaging/whatsapp/service";
import { formAnswers } from "@/lib/leads/formAnswers";
import { normalizePhone } from "@/lib/leads/normalize";
import { orgDialCode } from "@/lib/leads/orgDialCode";
import type { LeadService } from "@/domains/leads/service";

// Everything the web lead profile shows beyond the core record — next best action, score, answers,
// source/attribution, WhatsApp thread, sequences, files, shared content — computed the same way,
// for the mobile app (GET /api/v1/leads/:id/profile).

type Lead = NonNullable<Awaited<ReturnType<typeof LeadService.getLead>>>;

export const SOURCE_TYPE_LABELS: Record<string, string> = {
  facebook_lead_ads: "Facebook Lead Ads",
  google_lead_ads: "Google Lead Ads",
  generic_webhook: "Website Webhook",
  webform: "Web Form",
  web_form: "Web Form",
  linkedin_lead_gen: "LinkedIn Lead Gen",
  whatsapp_inbound: "WhatsApp Inbound",
};

// Attribution keys a source may drop into customData (Facebook, Google/UTM, web forms).
export const ATTRIBUTION_LABELS: Record<string, string> = {
  meta_campaign_name: "Campaign",
  meta_adset_name: "Ad set",
  meta_ad_name: "Ad",
  utm_campaign: "Campaign",
  utm_source: "UTM source",
  utm_medium: "UTM medium",
  utm_term: "Keyword",
  utm_content: "Ad content",
  gclid: "Google click ID",
  campaign: "Campaign",
  ad_group: "Ad group",
  adgroup: "Ad group",
  keyword: "Keyword",
  page_url: "Page",
  referrer: "Referrer",
};

const RECENT_OPEN_MS = 3 * 24 * 60 * 60 * 1000;

export async function buildLeadProfile(lead: Lead, ctx: { userId: string | null; organizationId: string; isAdmin: boolean }) {
  const { organizationId, isAdmin, userId } = ctx;
  const id = lead.id;
  const cd = (lead.customData as Record<string, unknown> | null) ?? {};

  const dup = [
    lead.email?.trim() ? sql`lower(${leads.email}) = ${lead.email.trim().toLowerCase()}` : null,
    lead.phone?.trim() ? eq(leads.phone, lead.phone.trim()) : null,
  ].filter(Boolean) as ReturnType<typeof eq>[];

  const [activities, waMessages, attachments, shares, org, availableSequences, enrolled, stages, duplicates, source, meetings, defs, statusCategory, reengagement] =
    await Promise.all([
      ActivityService.getLeadActivities(id),
      WhatsAppService.listForLead(id).catch(() => []),
      db
        .select()
        .from(leadAttachments)
        .where(and(eq(leadAttachments.leadId, id), eq(leadAttachments.organizationId, organizationId)))
        .orderBy(desc(leadAttachments.createdAt))
        .catch(() => []),
      ContentSharingService.listForLead(id).catch(() => []),
      OrgService.getOrganization(organizationId).catch(() => null),
      SequenceService.list(organizationId).catch(() => []),
      SequenceService.listForLead(id).catch(() => []),
      db
        .select({ id: leadPipelineStages.id, name: leadPipelineStages.name })
        .from(leadPipelineStages)
        .where(eq(leadPipelineStages.organizationId, organizationId))
        .catch(() => []),
      dup.length
        ? db
            .select({ id: leads.id })
            .from(leads)
            .where(
              and(
                eq(leads.organizationId, organizationId),
                ne(leads.id, id),
                isNull(leads.deletedAt),
                or(...dup),
                // Only duplicates this user can open.
                isAdmin || !userId ? undefined : eq(leads.ownerId, userId),
              ),
            )
            .catch(() => [])
        : Promise.resolve([]),
      lead.sourceId ? LeadSourceService.getSource(lead.sourceId).catch(() => null) : Promise.resolve(null),
      MeetingService.listForLead(id, organizationId).catch(() => []),
      CustomFieldService.list(organizationId).catch(() => []),
      CustomStatusSchemaService.getStatusCategory(organizationId, lead.status).catch(() => undefined),
      ReengagementCadenceService.getLeadReengagementCadence(id, organizationId).catch(() => null),
    ]);

  // Source + attribution
  const ownSource = source && source.organizationId === organizationId ? source : null;
  const attribution: { label: string; value: string }[] = [];
  const seen = new Set<string>();
  for (const [key, label] of Object.entries(ATTRIBUTION_LABELS)) {
    const v = cd[key];
    if (typeof v === "string" && v && !seen.has(label)) {
      attribution.push({ label, value: v });
      seen.add(label);
    }
  }
  if (cd.facebook_form_id) {
    const formNames = (ownSource?.config as { formFilterNames?: Record<string, string> } | undefined)?.formFilterNames;
    attribution.push({ label: "Form", value: formNames?.[String(cd.facebook_form_id)] || String(cd.facebook_form_id) });
  }

  // Engagement stats
  const callStats = ScoringService.callStats(activities);
  const inbound = waMessages.filter((m) => m.direction === "inbound");
  const contactWindow = bestContactWindow(
    // When the lead actually talked: replies, and calls that connected (picked "Answered", or the phone
    // logged talk time — incl. calls they made), at the time the call happened, not when it was logged.
    [
      ...inbound.map((m) => new Date(m.createdAt)),
      ...activities
        .filter((a) => a.type === "call" && ((a.durationSec ?? 0) > 0 || /^(Called|Incoming call) — Answered/.test(a.content ?? "")))
        .map((a) => new Date(a.occurredAt)),
    ],
    org?.timezone || "UTC",
  );
  // Non-admins never see admin-only field values (same as the web lead page).
  const visible = isAdmin ? cd : Object.fromEntries(Object.entries(cd).filter(([k]) => !defs.some((d) => d.adminOnly && d.key === k)));
  const answers = formAnswers(visible, Object.fromEntries(defs.map((d) => [d.key, d.label])));
  const recentOpen = shares
    .filter((s) => s.viewCount > 0 && s.lastViewedAt && Date.now() - new Date(s.lastViewedAt).getTime() <= RECENT_OPEN_MS)
    .sort((a, b) => new Date(b.lastViewedAt!).getTime() - new Date(a.lastViewedAt!).getTime())[0];
  const scheduled = meetings.filter((m) => m.status === "scheduled").at(-1);

  const nba = NextBestActionService.getRecommendation({
    status: lead.status,
    score: lead.score ?? 0,
    phone: lead.phone,
    email: lead.email,
    lastContactedAt: lead.lastContactedAt,
    nextFollowUpAt: lead.nextFollowUpAt,
    recentContentOpen: recentOpen ? { title: recentOpen.title, count: recentOpen.viewCount } : null,
    statusCategory,
    unansweredStreak: callStats.unansweredStreak,
    meeting: scheduled ? { startAt: scheduled.startAt, durationMinutes: scheduled.durationMinutes, label: modeLabel(scheduled.mode) } : null,
  });

  const score = ScoringService.breakdown({
    status: lead.status,
    statusCategory,
    phone: lead.phone,
    email: lead.email,
    company: lead.company,
    lastContactedAt: lead.lastContactedAt,
    nextFollowUpAt: lead.nextFollowUpAt,
    hasInboundMsg: inbound.length > 0,
    contentViews: shares.reduce((n, s) => n + s.viewCount, 0),
    hasFormAnswers: answers.length > 0,
    ...callStats,
  });

  return {
    // Dialable number for Call/WhatsApp: older leads saved without a country code get the workspace's.
    dialPhone: normalizePhone(lead.phone, await orgDialCode(organizationId)) ?? lead.phone ?? null,
    displayId: lead.displayId ?? null,
    createdAt: lead.createdAt,
    statusCategory: statusCategory ?? null,
    stage: stages.find((s) => s.id === lead.stageId) ?? null,
    stages,
    expectedValue: lead.expectedValue ?? null,
    currency: org?.currency ?? "INR",
    duplicates: duplicates.length,
    stats: {
      calls: activities.filter((a) => a.type === "call").length,
      answeredCalls: callStats.answeredCalls,
      messagesSent: waMessages.length - inbound.length,
      replies: inbound.length,
    },
    nextBestAction: { action: nba.action, label: nba.label, reason: nba.reason, priority: nba.priority },
    bestTime: contactWindow ? { label: contactWindow.label, days: contactWindow.days ?? null, count: contactWindow.count, total: contactWindow.total } : null,
    buyingSignal: recentOpen ? { title: recentOpen.title, views: recentOpen.viewCount } : null,
    score: { value: score.score, factors: score.factors },
    answers: answers.map((a) => ({ key: a.key, label: a.label, value: a.value })),
    source: {
      name: ownSource?.name || (typeof cd.leadSource === "string" ? cd.leadSource : null) || "Manual entry",
      type: ownSource?.type ? SOURCE_TYPE_LABELS[ownSource.type] ?? ownSource.type.replace(/_/g, " ") : null,
      attribution,
    },
    whatsapp: {
      mode: org?.whatsappMode === "bsp" ? ("bsp" as const) : ("personal" as const),
      messages: waMessages.map((m) => ({ id: m.id, direction: m.direction, body: m.body, status: m.status, createdAt: m.createdAt })),
    },
    sequences: {
      available: availableSequences.filter((s) => s.isActive).map((s) => ({ id: s.id, name: s.name, stepCount: s.stepCount })),
      enrolled: enrolled.map((e) => ({ enrollmentId: e.enrollmentId, sequenceId: e.sequenceId, name: e.name, status: e.status, currentStep: e.currentStep, nextRunAt: e.nextRunAt })),
    },
    attachments: attachments.map((a) => ({ id: a.id, fileName: a.fileName, fileType: a.fileType, fileSize: a.fileSize, createdAt: a.createdAt })),
    shares: shares.map((s) => ({ id: s.id, title: s.title, slug: s.slug, viewCount: s.viewCount, lastViewedAt: s.lastViewedAt })),
    reengagement:
      reengagement && reengagement.daysInactive >= 14 && reengagement.recommendedCadence.length
        ? {
            daysInactive: reengagement.daysInactive,
            steps: reengagement.recommendedCadence.map((s) => ({ dayOffset: s.dayOffset, channel: s.channel, title: s.actionTitle })),
          }
        : null,
  };
}

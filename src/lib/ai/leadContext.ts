import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { leadPipelineStages, whatsappMessages } from "@/db/schema";
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
import type { LeadExtras, LeadLike } from "@/lib/ai/leadBrief";

type LoadableLead = LeadLike & {
  id: string;
  stageId?: string | null;
  sourceId?: string | null;
  expectedValue?: string | null;
  lostReason?: string | null;
};

/**
 * Gathers everything the AI assists should know about a lead — form answers, the WhatsApp
 * conversation both ways, stage/value, source & campaign, content opens, call history — so a
 * recap or draft is grounded in what the lead actually asked for, not just their name.
 */
export async function loadLeadAiContext(lead: LoadableLead, organizationId: string) {
  const cd = (lead.customData as Record<string, unknown> | null) ?? {};

  const [activities, messages, shares, statuses, defs, stage, source, meetingRows] = await Promise.all([
    ActivityService.getLeadActivities(lead.id),
    db
      .select({ direction: whatsappMessages.direction, body: whatsappMessages.body, createdAt: whatsappMessages.createdAt })
      .from(whatsappMessages)
      .where(eq(whatsappMessages.leadId, lead.id))
      .orderBy(desc(whatsappMessages.createdAt))
      .limit(8),
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
  ]);

  const status = statuses.find((s) => s.key === lead.status);
  const labels = Object.fromEntries((defs as { key: string; label: string }[]).map((d) => [d.key, d.label]));
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
    bestContactTime: window ? `${window.label.toLowerCase()}${window.days ? ` on ${window.days}` : ""}` : null,
    statusLabel: status?.label,
    statusCategory: status?.category,
    stageName: stage,
    lostReason: lead.lostReason ?? null,
    source: source && source.organizationId === organizationId ? source.name : typeof cd.leadSource === "string" ? cd.leadSource : null,
    campaign: campaign ?? null,
    answers: formAnswers(cd, labels),
    messages: [...messages].reverse(),
    contentOpens: shares.map((s) => ({ title: s.title, viewCount: s.viewCount })),
    unansweredStreak: ScoringService.callStats(activities).unansweredStreak,
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

import { Phone, Mail, Sparkles, Flame, Radio, Braces, ClipboardList, Clock, ListChecks } from "lucide-react";
import { formatInr } from "@/lib/leads/budget";
import { bestContactWindow } from "@/domains/leads/bestContactTime";
import { getOrgFormat } from "@/lib/format.server";
import { CustomStatusSchemaService } from "@/domains/leads/customStatusSchemaService";
import { ScoringService } from "@/domains/leads/scoringService";
import { formAnswers } from "@/lib/leads/formAnswers";
import { CONFIGURABLE_LEAD_FIELDS, getLeadFieldValue, resolveLeadFieldConfig } from "@/lib/leads/fieldConfig";
import { normalizePhone } from "@/lib/leads/normalize";
import { orgDialCode } from "@/lib/leads/orgDialCode";
import { NbaActions } from "@/components/leads/NbaActions";
import { LeadWorkspaceTabs } from "@/components/leads/LeadWorkspaceTabs";
import { LogReplyBox } from "@/components/leads/LogReplyBox";
import { LeadService } from "@/domains/leads/service";
import { LeadSourceService } from "@/domains/leads/sourceService";
import { NextBestActionService } from "@/domains/leads/nextBestActionService";
import { ShareContentCard } from "@/components/leads/ShareContentCard";
import { ReengagementPlanCard } from "@/components/leads/ReengagementPlanCard";
import { ContentSharingService } from "@/domains/leads/contentSharingService";
import { OrgService } from "@/domains/organizations/service";
import { LiveNextBestAction } from "@/components/leads/LiveNextBestAction";
import { leadLiveFingerprint } from "@/lib/leads/liveFingerprint";
import { requireOrg, hasPermission } from "@/lib/rbac";
import { CustomFieldService } from "@/domains/customFields/service";
import { ActivityService, LEAD_ACTIVITY_PAGE } from "@/domains/activities/service";
import { notFound } from "next/navigation";
import { LeadNoAccess } from "@/components/leads/LeadNoAccess";
import { Badge } from "@/components/ui/badge";
import { ActivityTimeline } from "@/components/leads/ActivityTimeline";
import { LeadBackButton, LeadPager } from "@/components/leads/LeadNav";
import { LeadNotesTab } from "@/components/leads/LeadNotesTab";
import { WhatsAppSendBox } from "@/components/leads/WhatsAppSendBox";
import { EmailSendBox } from "@/components/leads/EmailSendBox";
import { WhatsAppThread } from "@/components/leads/WhatsAppThread";
import { WhatsAppService } from "@/lib/messaging/whatsapp/service";
import { LeadStatusControl } from "@/components/leads/LeadStatusControl";
import { LeadAssignControl } from "@/components/leads/LeadAssignControl";
import { LeadTags } from "@/components/leads/LeadTags";
import { LeadCustomFields } from "@/components/leads/LeadCustomFields";
import { TagService } from "@/domains/tags/service";
import { LeadDuplicateBanner } from "@/components/leads/LeadDuplicateBanner";
import { dedupConditions } from "@/lib/leads/dedupKeys";
import { LeadStageAndValueControl } from "@/components/leads/LeadStageAndValueControl";
import { LeadSequencesCard } from "@/components/leads/LeadSequencesCard";
import { LeadAiRecap } from "@/components/leads/LeadAiRecap";
import type { RecapCache } from "@/lib/ai/leadAssist";
import { visiblePlan } from "@/lib/ai/leadPlan";
import { PreCallBrief } from "@/components/leads/PreCallBrief";
import { preCallBrief } from "@/lib/leads/preCallBrief";
import { LeadInsightsCard } from "@/components/leads/LeadInsightsCard";
import { SectionCard } from "@/components/leads/SectionCard";
import { SequenceService } from "@/domains/leads/sequenceService";
import { LeadHeaderQuickActions } from "@/components/leads/LeadHeaderQuickActions";
import { LeadRemindersTab } from "@/components/leads/LeadRemindersTab";
import { LeadAttachmentsTab } from "@/components/leads/LeadAttachmentsTab";
import { LeadMeetingsTab } from "@/components/meetings/LeadMeetingsTab";
import { MeetingScheduler } from "@/components/meetings/MeetingScheduler";
import { MeetingService } from "@/domains/meetings/service";
import { worksOnLead } from "@/lib/leads/access";
import { modeLabel } from "@/domains/meetings/format";
import { GoogleCalendarService } from "@/domains/integrations/googleCalendarService";
import { isConfigured as googleConfigured } from "@/lib/integrations/google";
import { LocalTime } from "@/components/LocalTime";
import { ATTRIBUTION_LABELS, SOURCE_TYPE_LABELS } from "@/lib/leads/profile";
import { db } from "@/db";
import { leads, leadAttachments, followUps, leadPipelineStages, users, activities as activitiesTable, whatsappMessages } from "@/db/schema";
import { eq, and, ne, isNull, or, desc, sql } from "drizzle-orm";

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  if (!isUuid) {
    notFound();
  }

  const { userId, organizationId } = await requireOrg();

  // 1. The lead, plus the viewer/workspace lookups that don't depend on it — one round trip.
  // Roles without leads.edit may read a lead but not change it (the server enforces it; this hides what would fail).
  const canEdit = await hasPermission("leads.edit");
  const [lead, isFieldAdmin, allCustomDefs, orgFmt, dialCode] = await Promise.all([
    LeadService.getLead(id, organizationId),
    hasPermission("settings.manage"),
    CustomFieldService.listCached(organizationId),
    getOrgFormat(organizationId),
    orgDialCode(organizationId),
  ]);
  if (!lead) {
    notFound();
  }
  // Owner, admins, and anyone working on it — a meeting or follow-up assigned to them (lib/leads/access).
  if (!isFieldAdmin && lead.ownerId !== userId && !(await worksOnLead(id, userId))) {
    return <LeadNoAccess />;
  }

  // Fetch the org's custom-field defs once (cached) — used both to strip admin-only values for
  // non-admins and to hand the detail component its defs on the server, so the custom fields render
  // on first paint instead of after a client round-trip.
  if (!isFieldAdmin && lead.customData && typeof lead.customData === "object") {
    const cd = { ...(lead.customData as Record<string, unknown>) };
    for (const f of allCustomDefs) if (f.adminOnly) delete cd[f.key];
    (lead as { customData: unknown }).customData = cd;
  }
  // Match what listCustomFieldsAction returns for this viewer (admin-only hidden from non-admins).
  const visibleCustomDefs = (isFieldAdmin ? allCustomDefs : allCustomDefs.filter((f) => !f.adminOnly)) as any;

  // Same-person rule as every other duplicate check (lib/leads/dedupKeys).
  const dupConditions = dedupConditions(lead);

  const liveFingerprintP = leadLiveFingerprint(id, organizationId).catch(() => null);

  // 2. Fan out independent child reads directly without redundant auth/middleware wrappers.
  const [
    activities,
    noteActivities,
    counts,
    statusCategory,
    waMessages,
    leadTags,
    attachments,
    reminders,
    shares,
    org,
    availableSequences,
    enrolledSequences,
    stagesList,
    duplicateRows,
    source,
    usersList,
    leadMeetings,
    meetingLocations,
    calendarConnected,
  ] = await Promise.all([
    // Newest page only; the timeline pages further back on demand ("Load older").
    ActivityService.getLeadActivities(id, LEAD_ACTIVITY_PAGE),
    ActivityService.getLeadActivities(id, 200, undefined, ["note"]),
    // True totals for tab labels and call stats — the lists above and below are capped.
    db.execute(sql`select
        (select count(*)::int from ${activitiesTable} a where a.lead_id = ${id}) as acts,
        (select count(*)::int from ${activitiesTable} a where a.lead_id = ${id} and a.type = 'note') as notes,
        (select count(*)::int from ${activitiesTable} a where a.lead_id = ${id} and a.type = 'call') as calls,
        (select count(*)::int from ${activitiesTable} a where a.lead_id = ${id} and a.type = 'call'
           and (coalesce(a.duration_sec, 0) > 0 or a.content ~ '^(Called|Incoming call) — Answered')) as answered,
        (select count(*)::int from ${whatsappMessages} w where w.lead_id = ${id}) as wa,
        (select count(*)::int from ${whatsappMessages} w where w.lead_id = ${id} and w.direction = 'inbound') as wa_in`)
      .then((r) => (r as unknown as { acts: number; notes: number; calls: number; answered: number; wa: number; wa_in: number }[])[0])
      .catch(() => null),
    CustomStatusSchemaService.getStatusCategory(organizationId, lead.status).catch(() => undefined),
    WhatsAppService.listForLead(id, 200),
    TagService.getForLead(id),
    db
      .select()
      .from(leadAttachments)
      .where(and(eq(leadAttachments.leadId, id), eq(leadAttachments.organizationId, organizationId)))
      .orderBy(desc(leadAttachments.createdAt))
      .limit(200)
      .catch(() => []),
    db
      .select()
      .from(followUps)
      .where(eq(followUps.leadId, id))
      .orderBy(desc(followUps.dueAt))
      .limit(200)
      .catch(() => []),
    ContentSharingService.listForLead(id).catch(() => []),
    OrgService.getOrganization(organizationId).catch(() => null),
    SequenceService.list(organizationId).catch(() => []),
    SequenceService.listForLead(id).catch(() => []),
    db.select({ id: leadPipelineStages.id, name: leadPipelineStages.name })
      .from(leadPipelineStages)
      .where(eq(leadPipelineStages.organizationId, organizationId))
      .catch(() => []),
    dupConditions.length > 0
      ? db
          .select({ id: leads.id })
          .from(leads)
          .where(
            and(
              eq(leads.organizationId, organizationId),
              ne(leads.id, id),
              isNull(leads.deletedAt),
              or(...dupConditions),
              // Only count duplicates this user can open — otherwise "Review" leads to an empty list.
              isFieldAdmin ? undefined : eq(leads.ownerId, userId),
            ),
          )
          .catch(() => [])
      : Promise.resolve([]),
    lead.sourceId ? LeadSourceService.getSource(lead.sourceId).catch(() => null) : Promise.resolve(null),
    db
      .select({ id: users.id, firstName: users.firstName, lastName: users.lastName, email: users.email })
      .from(users)
      .where(and(eq(users.organizationId, organizationId), eq(users.isActive, true), isNull(users.deletedAt)))
      .then((rows) => rows.map((u) => ({ id: u.id, name: [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email || "Unnamed" })))
      .catch(() => []),
    MeetingService.listForLead(id, organizationId).catch(() => []),
    MeetingService.listLocations(organizationId).catch(() => []),
    googleConfigured() ? GoogleCalendarService.isConnected(userId).catch(() => false) : Promise.resolve(false),
  ]);


  const dupCount = duplicateRows.length;

  // Lead source + ad attribution (Facebook/Meta leads carry campaign/ad in customData).
  const cd = (lead.customData as Record<string, any>) ?? {};
  const sourceName =
    (source && source.organizationId === organizationId ? source.name : null) ||
    (typeof cd.leadSource === "string" ? cd.leadSource : null) ||
    "Manual entry";
  // Friendly label for the source's channel/type.
  const sourceType = source?.type
    ? SOURCE_TYPE_LABELS[source.type] ?? source.type.replace(/_/g, " ")
    : null;

  // Generic attribution: render any of these keys that a source dropped into customData. Covers
  // Facebook (meta_*), Google/UTM tracking, and web forms — new sources display for free just by
  // writing these keys. Only present values show.
  const attribution: Array<[string, string]> = [];
  const seenLabels = new Set<string>();
  for (const [key, label] of Object.entries(ATTRIBUTION_LABELS)) {
    const v = cd[key];
    if (typeof v === "string" && v && !seenLabels.has(label)) {
      attribution.push([label, v]);
      seenLabels.add(label);
    }
  }
  // Facebook form: resolve the id to a name via the source's saved map; fall back to the raw id.
  const formNames = (source?.config as any)?.formFilterNames as Record<string, string> | undefined;
  if (cd.facebook_form_id) {
    attribution.push(["Form", formNames?.[String(cd.facebook_form_id)] || String(cd.facebook_form_id)]);
  }
  const whatsappMode: "personal" | "bsp" = org?.whatsappMode === "bsp" ? "bsp" : "personal";

  // The workspace's default lead fields (Settings → Lead fields & requirements): shown unless hidden;
  // a mandatory one that's still empty is shown as missing so the rep fills it in.
  const leadFieldConfig = resolveLeadFieldConfig(org?.leadFieldConfig);
  const leadFields = CONFIGURABLE_LEAD_FIELDS.filter((f) => leadFieldConfig[f.key] !== "hidden")
    .map((f) => ({ ...f, value: getLeadFieldValue(lead as unknown as Record<string, unknown>, f.key), mandatory: leadFieldConfig[f.key] === "mandatory" }))
    .filter((f) => f.value || f.mandatory);

  // Dialable number for Call/WhatsApp links. Older leads may be saved without a country code
  // ("9876543210"), which WhatsApp can't open — complete them with the workspace's default.
  const dialPhone = normalizePhone(lead.phone, dialCode) ?? null;
  const stageName = stagesList.find((st) => st.id === lead.stageId)?.name ?? null;
  // Streak/talk-time from the recent page; the answered total from SQL (the page is capped).
  const callStats = { ...ScoringService.callStats(activities), ...(counts ? { answeredCalls: counts.answered } : {}) };
  // When this lead replies / picks up — shown as a "best time to reach them" hint.
  const contactWindow = bestContactWindow(
    [
      ...waMessages.filter((msg) => msg.direction === "inbound").map((msg) => new Date(msg.createdAt)),
      ...activities.filter((a) => a.type === "call" && /Called — Answered/.test(a.content ?? "")).map((a) => new Date(a.createdAt)),
    ],
    orgFmt.timezone,
  );
  const callCount = counts?.calls ?? activities.filter((a) => a.type === "call").length;
  const inboundCount = counts?.wa_in ?? waMessages.filter((msg) => msg.direction === "inbound").length;
  const waTotal = counts?.wa ?? waMessages.length;
  const outboundCount = waTotal - inboundCount;
  // The lead's own budget words ("₹40–75 lakhs") beat our number; the number reads in lakhs/crores.
  const budgetText = (typeof cd.budget === "string" && cd.budget.replace(/_/g, " ").trim()) || formatInr(lead.expectedValue);
  const userNames = Object.fromEntries(usersList.map((u) => [u.id, u.name]));
  const ownerName = usersList.find((u) => u.id === lead.ownerId)?.name ?? null;
  const answers = formAnswers(cd, Object.fromEntries(allCustomDefs.map((d) => [d.key, d.label])));
  const savedRecap = (cd._aiRecap as RecapCache | undefined) ?? null;

  // A content open in the last 3 days is a hot buying signal — surface it to the coach.
  const RECENT_OPEN_MS = 3 * 24 * 60 * 60 * 1000;
  const recentOpen = shares
    .filter((s) => s.viewCount > 0 && s.lastViewedAt && Date.now() - new Date(s.lastViewedAt).getTime() <= RECENT_OPEN_MS)
    .sort((a, b) => new Date(b.lastViewedAt!).getTime() - new Date(a.lastViewedAt!).getTime())[0];

  // Earliest still-scheduled meeting (listForLead is newest first).
  // A "scheduled" meeting whose time has passed was never closed out — it isn't upcoming.
  const scheduledMeeting = leadMeetings.filter((mt) => mt.status === "scheduled" && new Date(mt.startAt).getTime() >= Date.now()).at(-1);
  const nextMeeting = scheduledMeeting
    ? { startAt: scheduledMeeting.startAt, durationMinutes: scheduledMeeting.durationMinutes, label: modeLabel(scheduledMeeting.mode) }
    : null;

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
    meeting: nextMeeting,
  });
  // "Brief me": last conversation, what's still unknown, what to do next — from what's already loaded.
  const aiNext = savedRecap?.plan?.next && !savedRecap.dismissed?.includes(savedRecap.plan.next.id) ? savedRecap.plan.next : null;
  const brief = preCallBrief({
    activities,
    messages: waMessages,
    missing: [
      ...leadFields.filter((f) => !f.value).map((f) => f.label),
      ...(visibleCustomDefs as { key: string; label: string; required?: boolean }[])
        .filter((d) => d.required && (cd[d.key] == null || cd[d.key] === ""))
        .map((d) => d.label),
    ],
    next: aiNext ? { title: aiNext.title, reason: aiNext.reason } : { title: nba.label, reason: nba.reason },
    upcomingMeeting: nextMeeting ? `${nextMeeting.label} · ${new Date(nextMeeting.startAt).toLocaleString("en-IN", { timeZone: orgFmt.timezone, dateStyle: "medium", timeStyle: "short" })}` : null,
    now: new Date(),
  });
  // Change token the live NBA card polls against. Started before the profile reads so it's never
  // newer than what this render shows (at worst a change lands in between and costs one extra refresh).
  const liveFingerprint = await liveFingerprintP;
  const nbaAccent =
    nba.priority === "high"
      ? "border-red-500/40 bg-red-500/5"
      : nba.priority === "medium"
        ? "border-orange-500/40 bg-orange-500/5"
        : "border-border bg-card";

  const notesCount = counts?.notes ?? noteActivities.length;
  const initials =
    lead.name
      ?.split(" ")
      .map((w) => w[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?";

  // Layout: two columns on desktop (sticky details left, conversation right). On phones the column
  // wrappers become `display: contents`, so every card is a direct item of one stack and `order-*`
  // puts what a rep needs first — next action, then the conversation — above the reference cards.
  // `empty:hidden` drops wrappers of cards that render nothing, so they don't leave double gaps.
  const m = (order: string) => `${order} lg:order-none empty:hidden`;

  return (
    <div className="flex-1 space-y-5 p-3 pt-3 pb-28 sm:space-y-6 sm:p-8 sm:pt-6 sm:pb-24">
      {!canEdit && (
        <div role="note" className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          Your role can view this lead but not change it.
        </div>
      )}
      <LeadDuplicateBanner count={dupCount} searchQuery={lead.email || lead.phone || undefined} />

      {/* Buying signal — a recent content open is a hot moment to reach out. */}
      {recentOpen && (
        <div className="flex items-start gap-2.5 rounded-2xl border border-orange-500/40 bg-orange-500/5 px-4 py-3 text-sm">
          <Flame className="mt-0.5 h-4 w-4 shrink-0 text-orange-500" />
          <span>
            <span className="font-semibold">Buying signal:</span> {lead.name?.split(" ")[0] || "This lead"} opened{" "}
            <span className="font-medium">&ldquo;{recentOpen.title}&rdquo;</span> {recentOpen.viewCount}× recently — reach out now while you&apos;re top of mind.
          </span>
        </div>
      )}

      {(statusCategory === "lost" || statusCategory === "unqualified") && lead.lostReason && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 px-4 py-2.5 text-sm">
          <span className="font-medium capitalize">{lead.status}</span>
          <span className="text-muted-foreground"> — reason: {lead.lostReason}</span>
        </div>
      )}

      {/* Header: who, status, how to reach them, and the actions — all above the fold on a phone. */}
      <div className="space-y-4 border-b pb-5">
        <div className="flex items-start gap-3 justify-between">
          <div className="flex items-start gap-3 flex-1">
            <LeadBackButton leadId={lead.id} />
            <div className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border bg-secondary text-sm font-semibold text-secondary-foreground sm:flex">
              {initials}
            </div>
            <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <h2 className="break-words text-xl font-bold tracking-tight sm:text-2xl">{lead.name}</h2>
              {canEdit ? (
                <LeadStatusControl leadId={lead.id} status={lead.status} hasFollowUp={!!lead.nextFollowUpAt} className="h-8 w-auto min-w-[130px] text-xs" />
              ) : (
                <Badge variant="secondary" className="capitalize">{lead.status.replace(/_/g, " ")}</Badge>
              )}
              <PreCallBrief brief={brief} />
              <LeadInsightsCard variant="chip"
              score={lead.score}
              customData={lead.customData}
              leadInfo={{
                status: lead.status,
                phone: lead.phone,
                email: lead.email,
                company: lead.company,
                lastContactedAt: lead.lastContactedAt,
                nextFollowUpAt: lead.nextFollowUpAt,
                statusCategory,
                hasInboundMsg: inboundCount > 0,
                contentViews: shares.reduce((n, sh) => n + sh.viewCount, 0),
                hasFormAnswers: answers.length > 0,
                ...callStats,
              }}
              />
              {stageName && (
                <span className="text-xs text-muted-foreground lg:hidden" title="Pipeline stage — change it in Lead Management">
                  Stage: <span className="font-medium text-foreground">{stageName}</span>
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              {lead.phone && (
                <span className="flex items-center gap-1.5 tabular-nums">
                  <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                  {lead.phone}
                </span>
              )}
              {lead.email && (
                <span className="flex min-w-0 items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="break-all">{lead.email}</span>
                </span>
              )}
              {!lead.phone && !lead.email && <span className="text-muted-foreground">No phone or email yet — use Edit to add one.</span>}
            </div>
            {/* At a glance: what they want, what they can spend, who has them and when we last spoke. */}
            <dl className="flex flex-wrap gap-x-5 gap-y-1.5 pt-1 text-xs">
              {[
                ["Budget", budgetText],
                ["Requirement", typeof cd.requirement === "string" ? cd.requirement : null],
              ]
                .filter(([, v]) => v)
                .map(([k, v]) => (
                  <div key={k} className="min-w-0 max-w-full">
                    <dt className="inline text-muted-foreground">{k}: </dt>
                    <dd className="inline font-medium">{v}</dd>
                  </div>
                ))}
              <div className="lg:hidden">
                <dt className="inline text-muted-foreground">Owner: </dt>
                <dd className={`inline font-medium ${ownerName ? "" : "text-amber-600 dark:text-amber-500"}`}>{ownerName ?? "Unassigned"}</dd>
              </div>
              <div>
                <dt className="inline text-muted-foreground">Last contact: </dt>
                <dd className="inline font-medium">
                  {lead.lastContactedAt ? <LocalTime iso={lead.lastContactedAt} mode="relative" /> : <span className="text-amber-600 dark:text-amber-500">never</span>}
                </dd>
              </div>
            </dl>
            {(callCount > 0 || waTotal > 0) && (
              <p className="text-xs text-muted-foreground">
                {[
                  callCount > 0 && `${callCount} call${callCount === 1 ? "" : "s"}${callStats.answeredCalls ? ` · ${callStats.answeredCalls} answered` : ""}`,
                  outboundCount > 0 && `${outboundCount} message${outboundCount === 1 ? "" : "s"} sent`,
                  inboundCount > 0 && `${inboundCount} repl${inboundCount === 1 ? "y" : "ies"}`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
                {lead.lastContactedAt && (
                  <>
                    {" · last contact "}
                    <LocalTime iso={lead.lastContactedAt} mode="shortDate" />
                  </>
                )}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              {(lead.crn || lead.displayId != null) && (
                <>
                  <span className="font-medium tabular-nums text-foreground">{lead.crn ?? `Lead #${lead.displayId}`}</span>
                  {" · "}
                </>
              )}
              Created{" "}
              {lead.createdAt ? <LocalTime iso={lead.createdAt} mode="date" fallback="recently" /> : "recently"}
            </p>
          </div>
          </div>
          <LeadPager leadId={lead.id} />
        </div>

        {/* Desktop: ownership, pipeline stage and tags as one labelled row (phones get them in Lead Management). */}
        <div className="hidden gap-4 rounded-xl border bg-muted/20 p-3 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.4fr)]">
          <div className="min-w-0 space-y-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Owner</p>
            {canEdit ? (
              <LeadAssignControl leadId={lead.id} ownerId={lead.ownerId} initialUsers={usersList} currentUserId={userId} canSeeAllLeads={isFieldAdmin} />
            ) : (
              <p className="text-sm">{usersList.find((u) => u.id === lead.ownerId)?.name ?? "Unassigned"}</p>
            )}
          </div>
          <div className="min-w-0 space-y-1.5">
            <p
              className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
              title="Where the deal is on your pipeline board. Status (next to the name) says if the lead is open, won or lost."
            >
              Pipeline stage
            </p>
            {canEdit ? (
              <LeadStageAndValueControl leadId={lead.id} stageId={lead.stageId} stages={stagesList} compact />
            ) : (
              <p className="text-sm">{stagesList.find((st: { id: string; name: string }) => st.id === lead.stageId)?.name ?? "—"}</p>
            )}
          </div>
          <div className="min-w-0 space-y-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Tags</p>
            {canEdit ? (
              <LeadTags leadId={lead.id} initialTags={leadTags} />
            ) : (
              <div className="flex flex-wrap gap-1">{leadTags.length ? leadTags.map((t: { id: string; name: string }) => <Badge key={t.id} variant="secondary" className="font-normal">{t.name}</Badge>) : <span className="text-sm text-muted-foreground">—</span>}</div>
            )}
          </div>
        </div>

        {canEdit && <LeadHeaderQuickActions lead={{ ...lead, phone: dialPhone ?? null }} />}
        {canEdit && <MeetingScheduler
          lead={{ id: lead.id, name: lead.name, phone: dialPhone ?? null, email: lead.email }}
          users={usersList}
          locations={meetingLocations.map((l) => ({ id: l.id, name: l.name, address: l.address }))}
          canAutoMeet={calendarConnected}
          canManageLocations={isFieldAdmin}
          defaultAssigneeId={usersList.some((u) => u.id === lead.ownerId) ? lead.ownerId! : userId}
        />}
      </div>

      <div className="grid grid-cols-1 gap-5 sm:gap-6 lg:grid-cols-3">
        {/* Left column (desktop): coaching + lead details */}
        <div className="contents lg:col-span-1 lg:block lg:space-y-6">
          <div className={m("order-1")}>
            <LiveNextBestAction leadId={lead.id} fingerprint={liveFingerprint}>
              <SectionCard icon={Sparkles} title="Next Best Action" className={nbaAccent}>
              <div className="space-y-2">
                <p className="text-base font-semibold leading-snug">{nba.label}</p>
                <p className="text-sm text-muted-foreground">{nba.reason}</p>
                {contactWindow && nba.action !== "wait" && (
                  <p className="text-xs text-muted-foreground">
                    <Clock className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />
                    Best time to reach them: <span className="font-medium text-foreground">{contactWindow.label.toLowerCase()}</span>
                    {contactWindow.days ? ` on ${contactWindow.days}` : ""} · from {contactWindow.count} of {contactWindow.total} replies/answered calls
                  </p>
                )}
                {canEdit && <NbaActions action={nba.action} hasPhone={!!lead.phone} hasEmail={!!lead.email} />}
                <LeadAiRecap
                  leadId={lead.id}
                  initial={savedRecap?.text ? { text: savedRecap.text, at: savedRecap.at, plan: visiblePlan(savedRecap.plan, savedRecap.dismissed) } : null}
                  autoRun={answers.length > 0 && activities.length === 0}
                  changeKey={liveFingerprint}
                />
              </div>
            </SectionCard>
            </LiveNextBestAction>
          </div>

          {answers.length > 0 && (
            <div className={m("order-2")}>
              <SectionCard icon={ClipboardList} title="Lead's answers" description="What they told you in the form">
                <dl className="space-y-2.5 text-sm">
                  {answers.map((a) => (
                    <div key={a.key}>
                      <dt className="text-xs text-muted-foreground">{a.label}</dt>
                      <dd className="whitespace-pre-wrap break-words font-medium">{a.value}</dd>
                    </div>
                  ))}
                </dl>
              </SectionCard>
            </div>
          )}

          <div className={m("order-7")}>
            {canEdit && <ShareContentCard leadId={lead.id} leadPhone={dialPhone} initialShares={shares} />}
          </div>

          <div className={m("order-8")}>
            {canEdit && <ReengagementPlanCard leadId={lead.id} organizationId={organizationId} />}
          </div>
        </div>

        {/* Right column (desktop): conversation & history */}
        <div className="contents lg:col-span-2 lg:block lg:space-y-6">
          <div className={m("order-3")}>
            <LeadWorkspaceTabs
              defaultValue="activity"
              tabs={[
                {
                  value: "activity",
                  label: `Activity (${counts?.acts ?? activities.length})`,
                  content: <ActivityTimeline activities={activities} leadId={lead.id} crn={lead.crn} hasMore={activities.length === LEAD_ACTIVITY_PAGE} />,
                },
                {
                  value: "whatsapp",
                  label: `WhatsApp (${waTotal})`,
                  content: (
                    <>
                      <WhatsAppThread messages={waMessages} userNames={userNames} />
                      {canEdit && whatsappMode === "personal" && dialPhone && <LogReplyBox leadId={lead.id} />}
                      {canEdit && <WhatsAppSendBox
                        leadId={lead.id}
                        hasPhone={!!lead.phone}
                        mode={whatsappMode}
                        phone={dialPhone}
                        leadName={lead.name}
                        company={lead.company}
                      />}
                    </>
                  ),
                },
                { value: "notes", label: `Notes (${notesCount})`, content: <LeadNotesTab leadId={lead.id} initialNotes={noteActivities} readOnly={!canEdit} /> },
                {
                  value: "meetings",
                  label: `Meetings (${leadMeetings.filter((mt) => mt.status === "scheduled").length})`,
                  content: (
                    <LeadMeetingsTab
                      lead={{ id: lead.id, name: lead.name, phone: dialPhone ?? null }}
                      meetings={leadMeetings}
                      userNames={userNames}
                    />
                  ),
                },
                {
                  value: "reminders",
                  label: `Follow-ups (${reminders.length})`,
                  content: <LeadRemindersTab leadId={lead.id} initialReminders={reminders} userNames={userNames} leadName={lead.name} leadPhone={dialPhone} readOnly={!canEdit} />,
                },
                { value: "attachments", label: `Files (${attachments.length})`, content: <LeadAttachmentsTab leadId={lead.id} initialAttachments={attachments} userNames={userNames} readOnly={!canEdit} /> },
                { value: "emails", label: "Email", content: <EmailSendBox leadId={lead.id} email={lead.email} history={activities.filter((a) => a.type === "email")} readOnly={!canEdit} /> },
              ]}
            />
          </div>

          <div className={m("order-5")}>
            {canEdit && <LeadSequencesCard leadId={lead.id} availableSequences={availableSequences} initialEnrolled={enrolledSequences} whatsappMode={whatsappMode} />}
          </div>

          {/* Reference cards sit under the conversation on desktop, so the left column stays short
              (coaching + score) and the two columns end near each other. */}
          <div className="contents lg:mt-6 lg:grid lg:grid-cols-2 lg:items-start lg:gap-6">
          {leadFields.length > 0 && (
            <div className={m("order-9")}>
              <SectionCard icon={ListChecks} title="Lead details">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  {leadFields.map((f) => (
                    <div key={f.key} className="min-w-0">
                      <span className="block text-xs text-muted-foreground">{f.label}</span>
                      {!f.value ? (
                        <p className="font-medium text-amber-700 dark:text-amber-400">Not filled — required</p>
                      ) : f.type === "url" && /^https?:\/\//i.test(f.value) ? (
                        <a href={f.value} target="_blank" rel="noopener noreferrer nofollow" className="break-all font-medium underline underline-offset-2">{f.value}</a>
                      ) : (
                        <p className="break-words font-medium">{f.value}</p>
                      )}
                    </div>
                  ))}
                </div>
              </SectionCard>
            </div>
          )}

          <div className={m("order-9")}>
            <SectionCard icon={Radio} title="Lead Source">
              <div className="space-y-3 text-sm">
                <div>
                  <span className="block text-xs text-muted-foreground">Source</span>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{sourceName}</p>
                    {sourceType && (
                      <Badge variant="secondary" className="text-xs font-normal capitalize">
                        {sourceType}
                      </Badge>
                    )}
                  </div>
                </div>
                {attribution.map(([label, value]) => (
                  <div key={label}>
                    <span className="block text-xs text-muted-foreground">{label}</span>
                    <p className="break-words font-medium">{value}</p>
                  </div>
                ))}
              </div>
            </SectionCard>
          </div>

          {/* Hidden for reps when the workspace has no extra fields — they can't set them up anyway. */}
          {(visibleCustomDefs.length > 0 || isFieldAdmin) && (
            <div className={`${m("order-10")} lg:col-span-2`}>
              <SectionCard icon={Braces} title="More details">
                {(() => {
                  const activeCustomDefs = visibleCustomDefs.filter(
                    (f: any) => leadFieldConfig[f.key as keyof typeof leadFieldConfig] !== "hidden"
                  );
                  return (
                    <LeadCustomFields
                      leadId={lead.id}
                      initialData={(lead.customData as Record<string, unknown>) ?? {}}
                      initialDefs={activeCustomDefs}
                    />
                  );
                })()}
              </SectionCard>
            </div>
          )}
          </div>
        </div>
      </div>
    </div>
  );
}

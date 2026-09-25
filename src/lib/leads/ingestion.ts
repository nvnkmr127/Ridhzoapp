import { db } from "@/db";
import { orgDialCode } from "@/lib/leads/orgDialCode";
import { leads, leadIngestionLogs, leadStatusHistory } from "@/db/schema";
import { NormalizedLeadPayload } from "../integrations/types";
import { eq, or, and, isNull, sql } from "drizzle-orm";
import { eventBus } from "@/lib/events/emitter";
import { LeadSourceService } from "@/domains/leads/sourceService";
import { normalizeEmail, normalizePhone } from "@/lib/leads/normalize";
import { findMissingRequiredFields } from "@/lib/leads/requiredFields";
import { organizations } from "@/db/schema";
import { PlanService } from "@/domains/billing/planService";

// Attribution keys are FIRST-TOUCH: once a lead is created with the ad/campaign/leadgen that
// originated it, a later re-submission must not overwrite them with a newer ad's values, or the
// originating attribution (and the leadgen id Meta's Conversion Leads postback keys on) is lost.
// A lead turned away at the plan cap is invisible to the owner unless we say so — and it's the most
// honest upgrade prompt there is. ponytail: per-process hourly throttle (a burst of ad leads = one
// alert); move to a DB-backed throttle if workers scale out.
const blockedAlertAt = new Map<string, number>();
async function alertLeadBlocked(organizationId: string, leadName?: string | null) {
  const last = blockedAlertAt.get(organizationId) ?? 0;
  if (Date.now() - last < 60 * 60 * 1000) return;
  blockedAlertAt.set(organizationId, Date.now());
  try {
    const { NotificationService } = await import("@/domains/notifications/service");
    await NotificationService.notifyOrgAdmins(organizationId, {
      type: "lead_limit_blocked",
      title: "A new lead couldn't be saved",
      body: `${leadName || "A new lead"} arrived, but your plan's lead limit is full. Upgrade in Settings → Plan & billing to keep receiving leads.`,
    });
  } catch (e) {
    console.error("[ingestion] lead-blocked alert failed (non-fatal)", e);
  }
}

export const FIRST_TOUCH_KEYS = [
  "leadSource",
  "facebook_lead_id",
  "facebook_form_id",
  "facebook_page_id",
  "meta_ad_id",
  "meta_ad_name",
  "meta_adset_id",
  "meta_adset_name",
  "meta_campaign_id",
  "meta_campaign_name",
];

/** Merge an incoming lead's customData onto an existing lead's: new values win for normal fields,
 *  but first-touch attribution the existing lead already carries is preserved. Pure — unit tested. */
export function mergeCustomData(
  existingData: Record<string, any>,
  incomingData: Record<string, any> | undefined,
  sourceId: string,
): Record<string, any> {
  const merged: Record<string, any> = { ...existingData, ...(incomingData ?? {}), _lastIngestionSource: sourceId };
  for (const k of FIRST_TOUCH_KEYS) {
    if (existingData[k] !== undefined) merged[k] = existingData[k];
  }
  return merged;
}

export class IngestionService {
  /**
   * Processes a normalized lead payload.
   * Handles deduplication and insertion scoped strictly per organization.
   */
  static async processLead(payload: NormalizedLeadPayload): Promise<{ status: string; leadId: string }> {
    // Canonicalize contact keys so dedup matches across channels/formats (see normalize.ts).
    const email = normalizeEmail(payload.email);
    let phone = normalizePhone(payload.phone);

    if (!email && !phone) {
      await this.logIngestion(null, payload.sourceId, payload, "failed", "Email or phone is required for deduplication.");
      throw new Error("Email or phone is required");
    }

    // 1. Resolve Organization ID
    let organizationId = payload.organizationId;
    if (!organizationId && payload.sourceId) {
      const source = await LeadSourceService.getSource(payload.sourceId);
      if (source?.organizationId) {
        organizationId = source.organizationId;
      }
    }

    if (!organizationId) {
      await this.logIngestion(null, payload.sourceId, payload, "failed", "Valid Lead Source with Organization is required.");
      throw new Error("Valid Lead Source with Organization is required");
    }
    // Now that we know the workspace, complete national numbers with its country code.
    phone = normalizePhone(payload.phone, await orgDialCode(organizationId)) ?? phone;

    // Coerce/validate any custom-field values against the org's field defs, so an inbound lead
    // (Facebook, web form, API) stores typed values (number, date, option-checked) under the field's
    // key — same rules as manual create — instead of raw strings. Lenient: a bad value is left as-is
    // rather than dropping the lead, and non-def keys (attribution, raw payload) pass through
    // untouched. Runs once here so every ingestion path (new insert AND dedup merge) gets it.
    if (payload.customData && Object.keys(payload.customData).length > 0) {
      try {
        const { CustomFieldService } = await import("@/domains/customFields/service");
        const defs = await CustomFieldService.list(organizationId);
        if (defs.length > 0) {
          const cleaned = CustomFieldService.validateWith(defs, payload.customData, { isAdmin: true, lenient: true });
          payload.customData = { ...payload.customData, ...cleaned };
        }
      } catch (e) {
        console.error("[ingestion] custom-field validation failed (keeping raw values)", e);
      }
    }

    // Match phones on digits only (so "+15550101234" / "15550101234" / "+1 555 010 1234" dedup) and
    // NEVER dedup against a soft-deleted lead — otherwise a re-inquiry would be merged into a lead
    // sitting in the recycle bin and silently lost. Mirrors LeadService.createLead's dedup.
    const phoneDigits = phone ? phone.replace(/\D/g, "") : "";
    const searchConditions = [];
    if (email) searchConditions.push(eq(leads.email, email));
    if (phoneDigits) searchConditions.push(sql`regexp_replace(${leads.phone}, '\\D', '', 'g') = ${phoneDigits}`);
    const dedupWhere = and(eq(leads.organizationId, organizationId), isNull(leads.deletedAt), or(...searchConditions));

    // 2. Organization-Scoped Deduplication (active leads only)
    const [existingLead] = await db.select().from(leads).where(dedupWhere).limit(1);
    if (existingLead) {
      return this.applyDedup(existingLead, payload, organizationId);
    }

    // Required fields apply to leads your team types in. An inbound lead (ad form, web form, API)
    // missing one is still SAVED — the customer can't be asked again, and dropping a paid ad lead
    // over a blank "company" loses the sale. It's flagged instead (note + "missing-info" tag).
    const [orgRow] = await db
      .select({ requiredLeadFields: organizations.requiredLeadFields })
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);
    const missing = findMissingRequiredFields(orgRow?.requiredLeadFields, {
      email,
      phone,
      company: payload.company,
    });

    // 3. Check plan lead limit and insert with organizationId.
    try {
      await PlanService.assertCanAddLead(organizationId);
    } catch (e: any) {
      const reason = e?.message || "Lead capacity limit reached for your plan.";
      await this.logIngestion(null, payload.sourceId, payload, "failed", reason);
      await alertLeadBlocked(organizationId, payload.name);
      throw e;
    }

    // New leads only (not dedup merges): empty custom fields take their configured defaults.
    // Best-effort, like the validation above — a lookup failure must never drop an inbound lead.
    try {
      const { CustomFieldService } = await import("@/domains/customFields/service");
      payload.customData = CustomFieldService.withDefaults(await CustomFieldService.listCached(organizationId), payload.customData);
    } catch (e) {
      console.error("[ingestion] custom-field defaults skipped", e);
    }

    let newLead;
    try {
      [newLead] = await db.insert(leads).values({
        organizationId,
        name: payload.name,
        email,
        phone,
        company: payload.company,
        sourceId: payload.sourceId,
        expectedValue: payload.expectedValue != null ? String(payload.expectedValue) : undefined,
        customData: payload.customData,
      }).returning();
    } catch (e: any) {
      if (e?.code === "23505") {
        const [raced] = await db.select().from(leads).where(dedupWhere).limit(1);
        if (raced) return this.applyDedup(raced, payload, organizationId);
      }
      throw e;
    }

    await this.logIngestion(newLead.id, payload.sourceId, payload, "success", null);

    if (missing.length) {
      try {
        const { ActivityService } = await import("@/domains/activities/service");
        const { TagService } = await import("@/domains/tags/service");
        await ActivityService.addActivity({ leadId: newLead.id, type: "note", content: `Lead came in without: ${missing.join(", ")}. Ask for it on your first call or message.` });
        await TagService.addToLead(newLead.id, "missing-info", organizationId);
      } catch (e) {
        console.error("[ingestion] missing-field flag failed (non-fatal)", e);
      }
    }

    // Seed the status timeline with the opening state (system-created → no user), so inbound leads
    // are measured in stage-duration analytics the same as manually-created ones.
    await db.insert(leadStatusHistory).values({ leadId: newLead.id, oldStatus: null, newStatus: newLead.status, changedById: null });

    eventBus.emit('lead.created', {
      leadId: newLead.id,
      sourceId: payload.sourceId
    });

    // 4. Assignment Rules Engine
    const { AssignmentService } = await import("@/domains/leads/assignmentService");
    if (payload.ownerId) {
      await AssignmentService.assignLead({
        leadId: newLead.id,
        ownerId: payload.ownerId,
        assignedById: "system",
        organizationId,
      });
    } else {
      // A stale rule (e.g. its person was deactivated) must not fail ingestion: the lead then lands
      // unassigned, and the unassigned-lead alert below tells the admins.
      await AssignmentService.executeAutomaticAssignment(newLead.id, payload.sourceId, organizationId)
        .catch((e) => console.warn("[ingestion] automatic assignment skipped", newLead.id, (e as Error)?.message));
    }

    // Notify on receipt. If the lead got an owner, the lead.assigned handler already pinged them —
    // so here we only alert the account's admins when the lead landed UNASSIGNED (needs triage).
    // That keeps every lead surfaced without blasting every admin on every assigned lead.
    // Best-effort: a notification failure must never fail (and re-trigger) lead ingestion.
    try {
      const [assigned] = await db.select({ ownerId: leads.ownerId }).from(leads).where(eq(leads.id, newLead.id)).limit(1);
      if (!assigned?.ownerId) {
        const { NotificationService } = await import("@/domains/notifications/service");
        await NotificationService.notifyOrgAdmins(organizationId, {
          type: "lead_received",
          title: `New lead needs assignment: ${payload.name || "Unknown"}`,
          body: phone || email || undefined,
          leadId: newLead.id,
        });
      }
    } catch (e) {
      console.error("[ingestion] lead-received notification failed (non-fatal)", e);
    }

    return { status: "success", leadId: newLead.id };
  }

  /** Merges an incoming payload into an already-existing lead (dedup): updates custom data and
   *  timestamp, fills Opportunity Size only if unset, preserves existing owner and first-touch
   *  attribution. Shared by the normal dedup hit and the concurrent-insert (23505) fallback. */
  private static async applyDedup(
    existingLead: typeof leads.$inferSelect,
    payload: NormalizedLeadPayload,
    organizationId: string,
  ): Promise<{ status: string; leadId: string }> {
    const existingData = (existingLead.customData as Record<string, any>) ?? {};
    const mergedData = mergeCustomData(existingData, payload.customData, payload.sourceId);

    // Only fill Opportunity Size if it isn't already set — never overwrite a value a rep entered.
    const setExpectedValue =
      existingLead.expectedValue == null && payload.expectedValue != null
        ? { expectedValue: String(payload.expectedValue) }
        : {};
    const [updatedLead] = await db.update(leads)
      .set({ customData: mergedData, ...setExpectedValue, updatedAt: new Date() })
      .where(and(eq(leads.id, existingLead.id), eq(leads.organizationId, organizationId)))
      .returning();

    await this.logIngestion(updatedLead.id, payload.sourceId, payload, "deduplicated", null);

    eventBus.emit('lead.updated', {
      leadId: updatedLead.id,
      sourceId: payload.sourceId,
      changes: payload.customData,
    });

    return { status: "deduplicated", leadId: updatedLead.id };
  }

  static async logIngestion(leadId: string | null, sourceId: string, payload: any, status: string, error: string | null) {
    await db.insert(leadIngestionLogs).values({
      leadId,
      sourceId,
      originalPayload: payload,
      status,
      error,
    });
  }
}

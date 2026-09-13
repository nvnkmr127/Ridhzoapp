import { db } from "@/db";
import { leads, leadIngestionLogs } from "@/db/schema";
import { NormalizedLeadPayload } from "../integrations/types";
import { eq, or, and } from "drizzle-orm";
import { eventBus } from "@/lib/events/emitter";
import { LeadSourceService } from "@/domains/leads/sourceService";
import { normalizeEmail, normalizePhone } from "@/lib/leads/normalize";

export class IngestionService {
  /**
   * Processes a normalized lead payload.
   * Handles deduplication and insertion scoped strictly per organization.
   */
  static async processLead(payload: NormalizedLeadPayload): Promise<{ status: string; leadId: string }> {
    // Canonicalize contact keys so dedup matches across channels/formats (see normalize.ts).
    const email = normalizeEmail(payload.email);
    const phone = normalizePhone(payload.phone);

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

    const searchConditions = [];
    if (email) searchConditions.push(eq(leads.email, email));
    if (phone) searchConditions.push(eq(leads.phone, phone));

    // 2. Organization-Scoped Deduplication
    const [existingLead] = await db
      .select()
      .from(leads)
      .where(and(eq(leads.organizationId, organizationId), or(...searchConditions)))
      .limit(1);

    if (existingLead) {
      // Basic Deduplication: We update the existing lead's custom data and updated_at
      // Only fill Opportunity Size if it isn't already set — never overwrite a value a rep entered.
      const setExpectedValue =
        existingLead.expectedValue == null && payload.expectedValue != null
          ? { expectedValue: String(payload.expectedValue) }
          : {};
      const [updatedLead] = await db.update(leads)
        .set({
          customData: { ...(existingLead.customData as Record<string, any>), ...payload.customData, _lastIngestionSource: payload.sourceId },
          ...setExpectedValue,
          updatedAt: new Date(),
        })
        .where(and(eq(leads.id, existingLead.id), eq(leads.organizationId, organizationId)))
        .returning();

      await this.logIngestion(updatedLead.id, payload.sourceId, payload, "deduplicated", null);
      
      eventBus.emit('lead.updated', { 
        leadId: updatedLead.id, 
        sourceId: payload.sourceId,
        changes: payload.customData 
      });

      return { status: "deduplicated", leadId: updatedLead.id };
    }

    // 3. Creation with organizationId
    const [newLead] = await db.insert(leads).values({
      organizationId,
      name: payload.name,
      email,
      phone,
      company: payload.company,
      sourceId: payload.sourceId,
      expectedValue: payload.expectedValue != null ? String(payload.expectedValue) : undefined,
      customData: payload.customData,
    }).returning();

    await this.logIngestion(newLead.id, payload.sourceId, payload, "success", null);
    
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
      await AssignmentService.executeAutomaticAssignment(newLead.id, payload.sourceId, organizationId);
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

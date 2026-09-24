import { db } from "@/db";
import { zonedParts, zonedTimeToUtc } from "@/lib/tz";
import { leads } from "@/db/schema";
import { and, eq } from "drizzle-orm";

export interface CadenceStep {
  stepNumber: number;
  channel: "whatsapp" | "call" | "email" | "offer";
  dayOffset: number;
  actionTitle: string;
  templateSuggestion: string;
  scheduledDate: Date;
}

export interface ReengagementCadence {
  leadId: string;
  leadName: string;
  daysInactive: number;
  recommendedCadence: CadenceStep[];
}

export class ReengagementCadenceService {
  /**
   * Generates a 4-step multi-channel re-engagement drip cadence schedule for inactive leads.
   */
  static async getLeadReengagementCadence(
    leadId: string,
    organizationId: string
  ): Promise<ReengagementCadence> {
    const [lead] = await db
      .select({
        id: leads.id,
        name: leads.name,
        lastContactedAt: leads.lastContactedAt,
        createdAt: leads.createdAt,
      })
      .from(leads)
      .where(and(eq(leads.id, leadId), eq(leads.organizationId, organizationId)))
      .limit(1);

    if (!lead) throw new Error(`Lead ${leadId} not found in this organization`);

    const now = Date.now();
    const refTime = lead.lastContactedAt
      ? new Date(lead.lastContactedAt).getTime()
      : new Date(lead.createdAt).getTime();

    const daysInactive = Math.max(0, Math.floor((now - refTime) / (1000 * 60 * 60 * 24)));

    // 10:00 AM in the WORKSPACE's timezone (the server runs in UTC — 10 AM UTC is 3:30 PM in India).
    const { getOrgFormat } = await import("@/lib/format.server");
    const tz = (await getOrgFormat(organizationId).catch(() => null))?.timezone ?? "UTC";
    const today = zonedParts(new Date(), tz);
    const createStepDate = (offsetDays: number) => zonedTimeToUtc(today.year, today.month, today.day + offsetDays, 10, 0, tz);

    const recommendedCadence: CadenceStep[] = [
      {
        stepNumber: 1,
        channel: "whatsapp",
        dayOffset: 1,
        actionTitle: "Step 1: Friendly Check-in Template",
        templateSuggestion: `Hi ${lead.name}, checking in to see if you have any questions regarding our earlier conversation!`,
        scheduledDate: createStepDate(1),
      },
      {
        stepNumber: 2,
        channel: "call",
        dayOffset: 3,
        actionTitle: "Step 2: Direct Discovery Call",
        templateSuggestion: "Follow-up phone call to review project requirements and clear any blockers.",
        scheduledDate: createStepDate(3),
      },
      {
        stepNumber: 3,
        channel: "email",
        dayOffset: 7,
        actionTitle: "Step 3: Value Add & Case Study",
        templateSuggestion: "Send relevant case study or demo video demonstrating product value.",
        scheduledDate: createStepDate(7),
      },
      {
        stepNumber: 4,
        channel: "offer",
        dayOffset: 14,
        actionTitle: "Step 4: Final Breakup / Special Offer",
        templateSuggestion: "Limited-time promotion or polite breakup message to determine ongoing interest.",
        scheduledDate: createStepDate(14),
      },
    ];

    return {
      leadId: lead.id,
      leadName: lead.name,
      daysInactive,
      recommendedCadence,
    };
  }
}

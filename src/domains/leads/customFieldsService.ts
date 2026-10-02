import { db } from "@/db";
import { leads } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { ActivityService } from "@/domains/activities/service";

export type CustomFieldValue = string | number | boolean | string[] | null;

export class CustomFieldsService {
  /**
   * Sanitizes custom field keys and values into valid JSONB storage format.
   */
  static sanitizeCustomData(input: Record<string, any>): Record<string, CustomFieldValue> {
    const sanitized: Record<string, CustomFieldValue> = {};
    for (const [key, value] of Object.entries(input)) {
      const cleanKey = key.trim().replace(/[^\w.-]/g, "_");
      if (!cleanKey) continue;

      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        sanitized[cleanKey] = value;
      } else if (Array.isArray(value)) {
        sanitized[cleanKey] = value.map((v) => String(v));
      } else if (value === null || value === undefined) {
        sanitized[cleanKey] = null;
      } else {
        sanitized[cleanKey] = String(value);
      }
    }
    return sanitized;
  }

  /**
   * Updates lead custom attributes in JSONB custom_data column, preserving existing fields.
   */
  static async updateLeadCustomFields(
    leadId: string,
    organizationId: string,
    newCustomData: Record<string, any>,
    actorUserId?: string
  ): Promise<Record<string, CustomFieldValue>> {
    const [lead] = await db
      .select({ id: leads.id, customData: leads.customData })
      .from(leads)
      .where(and(eq(leads.id, leadId), eq(leads.organizationId, organizationId)))
      .limit(1);

    if (!lead) throw new Error(`Lead ${leadId} not found in this organization`);

    const existing = (lead.customData as Record<string, CustomFieldValue>) || {};
    const sanitized = this.sanitizeCustomData(newCustomData);
    const merged = { ...existing, ...sanitized };

    await db
      .update(leads)
      .set({ customData: merged, updatedAt: new Date() })
      .where(and(eq(leads.id, leadId), eq(leads.organizationId, organizationId)));

    const updatedKeys = Object.keys(sanitized).join(", ");
    await ActivityService.addActivity({
      leadId,
      userId: actorUserId,
      type: "note",
      content: `Updated custom fields: ${updatedKeys || "none"}`,
    });

    return merged;
  }
}

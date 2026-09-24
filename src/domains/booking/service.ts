import { db } from "@/db";
import { organizations, leads } from "@/db/schema";
import { and, eq, or } from "drizzle-orm";
import { LeadService } from "@/domains/leads/service";
import { MeetingService } from "@/domains/meetings/service";

export class BookingService {
  // Public info for the booking page — just the org name, resolved by slug.
  static async getOrgBySlug(slug: string) {
    const [org] = await db.select({ id: organizations.id, name: organizations.name, addressLine1: organizations.addressLine1, city: organizations.city }).from(organizations).where(eq(organizations.slug, slug)).limit(1);
    return org ?? null;
  }

  // A prospect requests a meeting. Creates the lead (or reuses an existing match) and books a meeting
  // with the lead's owner — on their calendar (with a Meet link when online and Google is connected).
  static async request(slug: string, input: { name: string; email?: string; phone?: string; when: Date; message?: string; mode?: "online" | "in_person" }) {
    const org = await this.getOrgBySlug(slug);
    if (!org) throw new Error("Unknown booking link");

    // Reuse an existing lead with the same email/phone; otherwise create one.
    let leadId: string | null = null;
    let ownerId: string | null = null;
    if (input.email || input.phone) {
      const conds = [];
      if (input.email) conds.push(eq(leads.email, input.email));
      if (input.phone) conds.push(eq(leads.phone, input.phone));
      const [existing] = await db.select({ id: leads.id, ownerId: leads.ownerId }).from(leads)
        .where(and(eq(leads.organizationId, org.id), or(...conds))).limit(1);
      if (existing) { leadId = existing.id; ownerId = existing.ownerId; }
    }

    if (!leadId) {
      const lead = await LeadService.createLead(
        { name: input.name, email: input.email, phone: input.phone },
        null,
        org.id,
      );
      leadId = lead.id;
      ownerId = lead.ownerId;
    }

    const mode = input.mode ?? "online";
    await MeetingService.create(
      {
        leadId,
        mode,
        title: `Meeting with ${input.name}`,
        startAt: input.when,
        durationMinutes: 30,
        assigneeId: ownerId,
        address: mode === "in_person" ? [org.addressLine1, org.city].filter(Boolean).join(", ") || null : null,
        locationName: mode === "in_person" ? org.name : null,
        autoMeet: mode === "online",
        notes: input.message ? `Requested via booking page: "${input.message}"` : "Requested via booking page",
        // The prospect sees "request sent"; the rep confirms from the lead once they've checked the slot.
        notifyLead: false,
      },
      { userId: null, organizationId: org.id },
    );
    return { ok: true };
  }
}

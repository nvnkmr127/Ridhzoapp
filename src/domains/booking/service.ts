import { db } from "@/db";
import { organizations, leads, meetingLocations } from "@/db/schema";
import { and, asc, eq, isNull, or, sql } from "drizzle-orm";
import { LeadService } from "@/domains/leads/service";
import { MeetingService } from "@/domains/meetings/service";
import { isWorkDay, localDayHour, wallTimeToUtc } from "@/lib/workHours";

// Booking page slots: 30-minute meetings, bookable up to 14 days ahead, inside business hours.
export const BOOKING_SLOT_MINUTES = 30;
export const BOOKING_DAYS_AHEAD = 14;

export class BookingError extends Error {
  code = "VALIDATION" as const;
}

export class BookingService {
  // Public info for the booking page (name, address, phone, business hours), resolved by slug.
  static async getOrgBySlug(slug: string) {
    const [org] = await db
      .select({
        id: organizations.id,
        name: organizations.name,
        addressLine1: organizations.addressLine1,
        city: organizations.city,
        phone: organizations.phone,
        timezone: organizations.timezone,
        workDays: organizations.workDays,
        workStartHour: organizations.workStartHour,
        workEndHour: organizations.workEndHour,
      })
      .from(organizations)
      .where(eq(organizations.slug, slug))
      .limit(1);
    return org ?? null;
  }

  // First saved store/office (alphabetical) — where in-person bookings happen. Null = use the
  // business address from General settings.
  static async defaultLocation(organizationId: string) {
    const [loc] = await db.select().from(meetingLocations).where(eq(meetingLocations.organizationId, organizationId)).orderBy(asc(meetingLocations.name)).limit(1);
    return loc ?? null;
  }

  /** Pure: is this org-local slot one the business is open for (and not in the past)? */
  static isBookable(
    org: { timezone: string; workDays: number[] | null; workStartHour: number; workEndHour: number },
    at: Date,
    now = new Date(),
  ): boolean {
    if (at.getTime() < now.getTime() + 15 * 60_000) return false; // at least 15 min notice
    if (at.getTime() > now.getTime() + (BOOKING_DAYS_AHEAD + 1) * 86_400_000) return false;
    if (!isWorkDay(at, org.timezone, org.workDays)) return false;
    const { hour } = localDayHour(at, org.timezone);
    const minute = Number(new Intl.DateTimeFormat("en-US", { timeZone: org.timezone, minute: "2-digit" }).format(at));
    const start = hour * 60 + minute;
    return start >= org.workStartHour * 60 && start + BOOKING_SLOT_MINUTES <= org.workEndHour * 60;
  }

  // A prospect requests a meeting. Creates the lead (or reuses an existing match) and books a meeting
  // with the lead's owner — on their calendar (with a Meet link when online and Google is connected).
  // `date` + `time` are the business's local wall clock (the page shows times in its timezone).
  static async request(
    slug: string,
    input: { name: string; email?: string; phone?: string; date: string; time: string; message?: string; mode?: "online" | "in_person" },
  ) {
    const org = await this.getOrgBySlug(slug);
    if (!org) throw new BookingError("Unknown booking link");

    const [hh, mm] = input.time.split(":").map(Number);
    const when = wallTimeToUtc(input.date, hh, mm, org.timezone);
    if (!this.isBookable(org, when)) throw new BookingError("That time isn't available any more. Please pick another slot.");

    // Reuse an existing live lead with the same email or phone (digits only, so "+91 98765…" and
    // "98765…" match); never one sitting in the recycle bin.
    let leadId: string | null = null;
    let ownerId: string | null = null;
    const email = input.email?.trim().toLowerCase() || null;
    const digits = input.phone ? input.phone.replace(/\D/g, "").slice(-10) : "";
    if (email || digits.length >= 7) {
      const conds = [];
      if (email) conds.push(sql`lower(${leads.email}) = ${email}`);
      if (digits.length >= 7) conds.push(sql`right(regexp_replace(${leads.phone}, '\\D', '', 'g'), 10) = ${digits}`);
      const [existing] = await db.select({ id: leads.id, ownerId: leads.ownerId }).from(leads)
        .where(and(eq(leads.organizationId, org.id), isNull(leads.deletedAt), or(...conds))).limit(1);
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
    const location = mode === "in_person" ? await this.defaultLocation(org.id) : null;
    const { meeting } = await MeetingService.create(
      {
        leadId,
        mode,
        title: `Meeting with ${input.name}`,
        startAt: when,
        durationMinutes: BOOKING_SLOT_MINUTES,
        assigneeId: ownerId,
        ...(location
          ? { locationId: location.id }
          : {
              address: mode === "in_person" ? [org.addressLine1, org.city].filter(Boolean).join(", ") || null : null,
              locationName: mode === "in_person" ? org.name : null,
            }),
        autoMeet: mode === "online",
        notes: input.message ? `Requested via booking page: "${input.message}"` : "Requested via booking page",
        // The prospect sees "request sent"; the rep confirms from the lead once they've checked the slot.
        notifyLead: false,
      },
      { userId: null, organizationId: org.id },
    );

    // Nobody owns this lead → nobody was notified by MeetingService. Tell the admins so it isn't missed.
    if (!meeting.assigneeId) {
      const { NotificationService } = await import("@/domains/notifications/service");
      await NotificationService.notifyOrgAdmins(org.id, {
        type: "meeting_scheduled",
        title: "New booking request: {name}",
        titleVars: { name: input.name },
        body: `${input.date} ${input.time} (${mode === "online" ? "online" : "in person"}). Assign it and confirm with the customer.`,
        leadId,
      });
    }
    return { ok: true, when: when.toISOString() };
  }
}

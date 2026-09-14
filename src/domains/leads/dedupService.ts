import { db } from "@/db";
import {
  leads,
  organizations,
  activities,
  followUps,
  leadStatusHistory,
  leadTags,
  whatsappMessages,
  notifications,
} from "@/db/schema";
import { and, eq, ne, or, isNull, asc, sql } from "drizzle-orm";

// Child tables that carry a lead_id and should follow the surviving lead on merge.
const REASSIGN = [activities, followUps, leadStatusHistory, whatsappMessages, notifications] as const;

export class DedupService {
  // Groups of leads in the org that share a normalized email or phone. Cheap heuristic, good enough
  // for a review screen. ponytail: exact-match only; fuzzy/name matching if it proves necessary.
  static async findDuplicateGroups(organizationId: string) {
    const rows = await db
      .select({ id: leads.id, name: leads.name, email: leads.email, phone: leads.phone, createdAt: leads.createdAt })
      .from(leads)
      .where(eq(leads.organizationId, organizationId));

    const byKey = new Map<string, typeof rows>();
    for (const r of rows) {
      for (const key of [r.email && `e:${r.email.toLowerCase()}`, r.phone && `p:${r.phone.replace(/\D/g, "")}`]) {
        if (!key) continue;
        const g = byKey.get(key) ?? [];
        g.push(r);
        byKey.set(key, g);
      }
    }
    // Dedupe leads that matched on both email and phone into one group per set of ids.
    const seen = new Set<string>();
    const groups: { key: string; leads: typeof rows }[] = [];
    for (const [key, g] of byKey) {
      if (g.length < 2) continue;
      const sig = g.map((l) => l.id).sort().join(",");
      if (seen.has(sig)) continue;
      seen.add(sig);
      groups.push({ key, leads: g });
    }
    return groups;
  }

  // Auto-merge a just-created lead into a pre-existing one with the same email/phone, when the org
  // has it enabled. The older lead stays primary (keeps its id, owner, history); the arrival's fresh
  // fields backfill any blanks and its customData is merged in, then it's merged away. Returns true
  // if a merge happened, so the caller can skip the normal new-lead fan-out for a returning lead.
  static async autoMergeOnCreate(leadId: string): Promise<boolean> {
    const [incoming] = await db.select().from(leads).where(eq(leads.id, leadId)).limit(1);
    if (!incoming || incoming.deletedAt) return false;

    const [org] = await db
      .select({ on: organizations.autoMergeDuplicates })
      .from(organizations)
      .where(eq(organizations.id, incoming.organizationId));
    if (!org?.on) return false;

    const email = incoming.email?.trim() || null;
    const phone = incoming.phone?.trim() || null;
    if (!email && !phone) return false; // nothing to match on

    const keys = [];
    if (email) keys.push(eq(leads.email, email));
    if (phone) keys.push(eq(leads.phone, phone));

    // Oldest live lead of this org (not the arrival) sharing a key = the record to keep.
    const [primary] = await db
      .select()
      .from(leads)
      .where(and(eq(leads.organizationId, incoming.organizationId), ne(leads.id, incoming.id), isNull(leads.deletedAt), or(...keys)))
      .orderBy(asc(leads.createdAt))
      .limit(1);
    if (!primary) return false;

    // Update primary's contact fields with the arrival's newest non-empty values (a returning lead
    // may have a new phone/company), and merge customData with the arrival's fresh keys taking
    // precedence. Never overwrite a value with a blank. Track what changed for the audit note.
    const backfill: Record<string, unknown> = {};
    const changed: string[] = [];
    for (const f of ["email", "phone", "company", "name"] as const) {
      const next = (incoming[f] as string | null)?.trim?.() || incoming[f];
      if (next && next !== primary[f]) {
        backfill[f] = incoming[f];
        if (primary[f]) changed.push(f); // only note true overwrites, not blank backfills
      }
    }
    backfill.customData = { ...(primary.customData as any), ...(incoming.customData as any) };
    if (Object.keys(backfill).length > 0) {
      await db.update(leads).set(backfill).where(eq(leads.id, primary.id));
    }

    await this.merge(incoming.organizationId, primary.id, incoming.id);

    const { ActivityService } = await import("@/domains/activities/service");
    const note = changed.length
      ? `Auto-merged a duplicate lead (${email || phone}) on arrival; updated ${changed.join(", ")} with the newer details.`
      : `Auto-merged a duplicate lead (${email || phone}) on arrival.`;
    await ActivityService.addActivity({ leadId: primary.id, type: "note", content: note }).catch(() => {});
    return true;
  }

  // Merge `duplicateId` into `primaryId`: move child rows, then delete the duplicate. Org-scoped.
  static async merge(organizationId: string, primaryId: string, duplicateId: string) {
    if (primaryId === duplicateId) throw new Error("Cannot merge a lead into itself");
    const owned = await db
      .select({ id: leads.id })
      .from(leads)
      .where(and(eq(leads.organizationId, organizationId), sql`${leads.id} in (${primaryId}, ${duplicateId})`));
    if (owned.length !== 2) throw new Error("Both leads must belong to your organization");

    await db.transaction(async (tx) => {
      for (const table of REASSIGN) {
        await tx.update(table).set({ leadId: primaryId }).where(eq(table.leadId, duplicateId));
      }
      // Tags: (lead_id, tag_id) is a pseudo-PK, so drop the duplicate's links already on the primary first.
      const primaryTags = await tx.select({ tagId: leadTags.tagId }).from(leadTags).where(eq(leadTags.leadId, primaryId));
      const have = new Set(primaryTags.map((t) => t.tagId));
      const dupTags = await tx.select({ tagId: leadTags.tagId }).from(leadTags).where(eq(leadTags.leadId, duplicateId));
      for (const t of dupTags) {
        if (have.has(t.tagId)) {
          await tx.delete(leadTags).where(and(eq(leadTags.leadId, duplicateId), eq(leadTags.tagId, t.tagId)));
        }
      }
      await tx.update(leadTags).set({ leadId: primaryId }).where(eq(leadTags.leadId, duplicateId));

      await tx.delete(leads).where(and(eq(leads.id, duplicateId), eq(leads.organizationId, organizationId), ne(leads.id, primaryId)));
    });
  }
}

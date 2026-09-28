import { db } from "@/db";
import {
  leads,
  organizations,
  activities,
  followUps,
  meetings,
  leadStatusHistory,
  leadTags,
  whatsappMessages,
  notifications,
  leadAttachments,
  sharedLinks,
  sequenceEnrollments,
} from "@/db/schema";
import { and, eq, ne, or, isNull, asc, sql } from "drizzle-orm";

// Child tables with a plain lead_id (no per-lead unique) that should follow the surviving lead.
const REASSIGN = [activities, followUps, meetings, leadStatusHistory, whatsappMessages, notifications, leadAttachments, sharedLinks] as const;

export class DedupService {
  // Groups of leads in the org that share a normalized email or phone. Cheap heuristic, good enough
  // for a review screen. ponytail: exact-match only; fuzzy/name matching if it proves necessary.
  static async findDuplicateGroups(organizationId: string, opts: { enforceOwnerId?: string; maxGroups?: number } = {}) {
    // Matching happens in Postgres: only rows whose key is shared come back (was: every lead of the
    // tenant, recycle bin included, loaded into Node). Recycled leads are excluded; reps without
    // admin rights only see duplicates among their own leads.
    const owner = opts.enforceOwnerId ? sql`and owner_id = ${opts.enforceOwnerId}` : sql``;
    const live = sql`organization_id = ${organizationId} and deleted_at is null ${owner}`;
    const res = await db.execute(sql`
      with keyed as (
        select id, 'e:' || lower(email) as k from ${leads} where ${live} and coalesce(email, '') <> ''
        union all
        select id, 'p:' || regexp_replace(phone, '[^0-9]', '', 'g') from ${leads}
          where ${live} and regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g') <> ''
      ),
      dup as (select k from keyed group by k having count(*) > 1 order by k limit ${opts.maxGroups ?? 200})
      select keyed.k, l.id, l.name, l.email, l.phone, l.created_at
      from keyed join dup on dup.k = keyed.k join ${leads} l on l.id = keyed.id
      order by keyed.k, l.created_at, l.id`);
    const rows = res as unknown as { k: string; id: string; name: string; email: string | null; phone: string | null; created_at: Date | string }[];

    type Row = { id: string; name: string; email: string | null; phone: string | null; createdAt: Date };
    const byKey = new Map<string, Row[]>();
    for (const r of rows) {
      const g = byKey.get(r.k) ?? [];
      g.push({ id: r.id, name: r.name, email: r.email, phone: r.phone, createdAt: new Date(r.created_at) });
      byKey.set(r.k, g);
    }
    // Dedupe leads that matched on both email and phone into one group per set of ids.
    const seen = new Set<string>();
    const groups: { key: string; leads: Row[] }[] = [];
    for (const [key, g] of byKey) {
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

    // Snapshot the arrival's identifying fields before merge() hard-deletes it — this is the last
    // point the merged lead's own identity is readable anywhere.
    const mergedSnapshot = { name: incoming.name, email: incoming.email, phone: incoming.phone };
    await this.merge(incoming.organizationId, primary.id, incoming.id);

    const { AuditService } = await import("@/domains/audit/service");
    await AuditService.log({
      organizationId: incoming.organizationId,
      action: "lead.auto_merge",
      entityType: "lead",
      entityId: primary.id,
      metadata: { mergedLead: mergedSnapshot, matchedOn: email ? "email" : "phone", changed },
    });

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
      .where(and(eq(leads.organizationId, organizationId), isNull(leads.deletedAt), sql`${leads.id} in (${primaryId}, ${duplicateId})`));
    if (owned.length !== 2) throw new Error("Both leads must belong to your organization and not be in the recycle bin");

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

      // Sequence enrollments: move the duplicate's onto the primary, but drop a duplicate's ACTIVE
      // enrollment when the primary is already active in that same sequence (avoid two live drips).
      const primaryActive = await tx
        .select({ sequenceId: sequenceEnrollments.sequenceId })
        .from(sequenceEnrollments)
        .where(and(eq(sequenceEnrollments.leadId, primaryId), eq(sequenceEnrollments.status, "active")));
      const activeSeq = new Set(primaryActive.map((s) => s.sequenceId));
      const dupEnr = await tx
        .select({ id: sequenceEnrollments.id, sequenceId: sequenceEnrollments.sequenceId, status: sequenceEnrollments.status })
        .from(sequenceEnrollments)
        .where(eq(sequenceEnrollments.leadId, duplicateId));
      for (const e of dupEnr) {
        if (e.status === "active" && activeSeq.has(e.sequenceId)) {
          await tx.delete(sequenceEnrollments).where(eq(sequenceEnrollments.id, e.id));
        }
      }
      await tx.update(sequenceEnrollments).set({ leadId: primaryId }).where(eq(sequenceEnrollments.leadId, duplicateId));

      await tx.delete(leads).where(and(eq(leads.id, duplicateId), eq(leads.organizationId, organizationId), ne(leads.id, primaryId)));
    });
  }
}

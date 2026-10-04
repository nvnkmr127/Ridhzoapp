import { db } from "@/db";
import { escapeLike } from "@/lib/utils";
import { orgDialCode } from "@/lib/leads/orgDialCode";
import { leads, leadPipelineStages, leadStatusHistory, leadTags, tags, activities, followUps, reminders, leadAttachments, notifications, whatsappMessages, customStatusConfigs } from "@/db/schema";
import { DEFAULT_SYSTEM_STATUSES } from "./customStatusSchemaService";
import {
  eq,
  ilike,
  and,
  or,
  desc,
  asc,
  sql,
  ne,
  isNull,
  isNotNull,
  inArray,
  lt,
  lte,
  gt,
  gte,
  exists,
  count,
  getTableColumns,
} from "drizzle-orm";
import { eventBus } from "@/lib/events/emitter";
import { ActivityService } from "@/domains/activities/service";
import { FilterGroup, FilterRule } from "@/domains/savedViews/service";
import { normalizeEmail, normalizePhone } from "@/lib/leads/normalize";
import { PlanService } from "@/domains/billing/planService";
import { assertRequiredLeadFields } from "@/lib/leads/requiredFields";
import { dedupConditions, sameLead } from "@/lib/leads/dedupKeys";
import { SmartSegmentationService, type SmartSegmentKey } from "./smartSegmentationService";

export type ListLeadsOptions = {
  organizationId: string;
  search?: string;
  status?: string;
  ownerId?: string;
  teamId?: string;
  sourceId?: string;
  stageId?: string;
  filters?: FilterGroup | FilterRule[];
  sortField?: string;
  sortOrder?: "asc" | "desc";
  page?: number;
  limit?: number;
  currentUserId?: string;
  enforceOwnerId?: string;
  /** Restrict to these lead ids (e.g. exporting the rows a user ticked). */
  ids?: string[];
  /** A smart-segment chip's list (same SQL condition as the chip's count). */
  segment?: SmartSegmentKey;
  /** Hide junk and every lost-category status (built-in or custom) — the list's default view. */
  hideJunkLost?: boolean;
  /** Page-size ceiling. Defaults to 100 so a URL/client can't ask for the whole tenant; export raises it. */
  maxLimit?: number;
};

// Digits-only phone, the exact expression the trigram index in migration 0081 is built on — keep
// them identical or Postgres falls back to scanning the tenant.
// Notes the app writes itself (ingestion, edits, enrichment) — not a rep's context, so the list's
// "latest note" preview skips them.
const SYSTEM_NOTE_RE = "^(Lead (was created|came in from|came in without|details were updated|flagged as stale|enriched from)|Updated custom fields)";

export const phoneDigitsSql = sql`regexp_replace(${leads.phone}, '[^0-9]', '', 'g')`;

/**
 * One search condition for every lead search box (leads list, command palette, mobile API): name /
 * email / company contain the term, or the phone's digits contain the term's digits — so
 * "98765 43210" matches "+919876543210" everywhere.
 */
export function leadSearchCondition(raw: string) {
  const term = raw.trim();
  const like = `%${escapeLike(term)}%`;
  const digits = term.replace(/[^0-9]/g, "");
  const conds = [ilike(leads.name, like), ilike(leads.email, like), ilike(leads.company, like)];
  // Reference numbers: "CRN-2609-0042" (or a fragment of it) and "#1042" / "1042" for the Lead #.
  if (/^crn-?[0-9-]*$/i.test(term) || /^[0-9]{4}-[0-9]+$/.test(term)) conds.push(ilike(leads.crn, `%${escapeLike(term)}%`));
  const num = /^#?(\d{1,9})$/.exec(term);
  if (num) conds.push(eq(leads.displayId, Number(num[1])));
  conds.push(digits.length >= 3 ? sql`${phoneDigitsSql} ILIKE ${"%" + digits + "%"}` : ilike(leads.phone, like));
  return or(...conds)!;
}

export class LeadService {
  static async createLead(
    data: { name: string; email?: string; phone?: string; company?: string; ownerId?: string; teamId?: string; customData?: Record<string, unknown> },
    createdById: string | null,
    organizationId: string,
    opts: { inbound?: boolean } = {},
  ): Promise<typeof leads.$inferSelect> {
    await PlanService.assertCanAddLead(organizationId);
    // Enforce the org's required-field configuration at the ONE spot every team create path (manual
    // UI, REST API / phone app) funnels through — so the setting can't be UI-only. Inbound leads (a
    // public booking) skip it: the person booking was never asked for Budget etc., and losing the
    // booking over it is worse than a blank field — same rule as ad/web-form ingestion.
    if (!opts.inbound) await assertRequiredLeadFields(organizationId, data);
    // Dedup within THIS org only — same email/phone in another tenant is a different lead.
    // Canonicalize first so "+1 555-0101" and "+15550101" are stored and compared identically;
    // otherwise formatting differences slip past both the app check and the DB unique index.
    const cleanEmail = normalizeEmail(data.email);
    const cleanPhone = normalizePhone(data.phone, await orgDialCode(organizationId));
    // Same-person rule shared by every duplicate check (lib/leads/dedupKeys): email ignoring case,
    // phone on its last 10 digits — the DB unique index only catches exact strings.
    const orConds = dedupConditions({ email: cleanEmail, phone: cleanPhone });
    if (orConds.length) {
      const existing = await db
        .select({ id: leads.id, name: leads.name, email: leads.email, phone: leads.phone, deletedAt: leads.deletedAt })
        .from(leads)
        .where(and(eq(leads.organizationId, organizationId), or(...orConds)));

      const active = existing.filter((r) => !r.deletedAt);
      const inRecycleBin = existing.filter((r) => r.deletedAt);
      const incoming = { email: cleanEmail, phone: cleanPhone };

      const dupActiveEmail = active.find((r) => sameLead(incoming, r).email);
      const dupActivePhone = active.find((r) => sameLead(incoming, r).phone);

      if (dupActiveEmail && dupActivePhone) {
        const err = new Error(`A lead with this email and phone already exists ("${dupActivePhone.name}")`);
        (err as any).fieldErrors = {
          email: `Already used by active lead "${dupActiveEmail.name}".`,
          phone: `Already used by active lead "${dupActivePhone.name}".`,
        };
        throw err;
      }
      if (dupActiveEmail) {
        const err = new Error(`Duplicate email: already used by lead "${dupActiveEmail.name}"`);
        (err as any).fieldErrors = {
          email: `Already used by active lead "${dupActiveEmail.name}".`,
        };
        throw err;
      }
      if (dupActivePhone) {
        const err = new Error(`Duplicate phone number: already used by lead "${dupActivePhone.name}"`);
        (err as any).fieldErrors = {
          phone: `Already used by active lead "${dupActivePhone.name}".`,
        };
        throw err;
      }

      // If soft-deleted leads in the recycle bin hold the email or phone, clear them so they never block new leads
      if (inRecycleBin.length > 0) {
        for (const trashed of inRecycleBin) {
          const updates: Record<string, unknown> = {};
          const match = sameLead(incoming, trashed);
          if (match.email) updates.email = null;
          if (match.phone) updates.phone = null;
          if (Object.keys(updates).length > 0) {
            await db.update(leads).set(updates).where(and(eq(leads.id, trashed.id), eq(leads.organizationId, organizationId)));
          }
        }
      }
    }

    let newLead;
    try {
      [newLead] = await PlanService.serialized(organizationId, "leads", async () => {
        await PlanService.assertCanAddLead(organizationId); // re-check under the lock (see serialized)
        return db.insert(leads).values({
        organizationId,
        name: data.name.trim(),
        email: cleanEmail || null,
        phone: cleanPhone || null,
        company: data.company?.trim() || null,
        ownerId: data.ownerId || createdById || null,
        teamId: data.teamId,
        customData: data.customData ?? {},
        status: "new",
      }).returning();
      });
    } catch (e: any) {
      // If constraint violation occurs due to a soft-deleted lead, clear it and retry once
      // Drizzle wraps the driver error ("Failed query: …"); the Postgres code lives on e.cause.
      const pg = e?.cause?.code ? e.cause : e;
      if (pg?.code === "23505") {
        const constraint = String(pg?.constraint_name || pg?.constraint || pg?.detail || pg?.message || "");
        if (constraint.includes("email")) {
          if (cleanEmail) {
            const [trashed] = await db
              .select({ id: leads.id })
              .from(leads)
              .where(and(eq(leads.organizationId, organizationId), isNotNull(leads.deletedAt), eq(leads.email, cleanEmail)))
              .limit(1);
            if (trashed) {
              await db.update(leads).set({ email: null }).where(and(eq(leads.id, trashed.id), eq(leads.organizationId, organizationId)));
              return this.createLead(data, createdById, organizationId);
            }
          }
          const err = new Error("Duplicate email: a lead with this email already exists");
          (err as any).fieldErrors = { email: "A lead with this email already exists." };
          throw err;
        }
        if (constraint.includes("phone")) {
          if (cleanPhone) {
            const [trashed] = await db
              .select({ id: leads.id })
              .from(leads)
              .where(and(eq(leads.organizationId, organizationId), isNotNull(leads.deletedAt), eq(leads.phone, cleanPhone)))
              .limit(1);
            if (trashed) {
              await db.update(leads).set({ phone: null }).where(and(eq(leads.id, trashed.id), eq(leads.organizationId, organizationId)));
              return this.createLead(data, createdById, organizationId);
            }
          }
          const err = new Error("Duplicate phone number: a lead with this phone number already exists");
          (err as any).fieldErrors = { phone: "A lead with this phone number already exists." };
          throw err;
        }
        throw new Error("Duplicate lead found with the same email or phone");
      }
      throw e;
    }

    // Seed the status timeline with the opening state so "time in first status" is measured (stage
    // duration analytics diff consecutive history rows; without this the initial dwell was invisible).
    await db.insert(leadStatusHistory).values({
      leadId: newLead.id,
      oldStatus: null,
      newStatus: newLead.status,
      changedById: createdById && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(createdById) ? createdById : null,
    });

    eventBus.emit('lead.created', { leadId: newLead.id, userId: createdById ?? undefined });
    if (newLead.ownerId && newLead.ownerId !== createdById) {
      eventBus.emit('lead.assigned', { leadId: newLead.id, ownerId: newLead.ownerId, assignedById: createdById ?? undefined });
    }
    return newLead;
  }

  // Compare-and-swap on the lead's version: bumps updatedAt only if it's still `seen` (ms precision,
  // like updateLead's check). false = someone wrote to the lead in between. Holding the new version
  // also makes a racing web save (EditLeadDialog sends expectedUpdatedAt) fail instead of winning.
  static async claimVersion(leadId: string, organizationId: string, seen: Date): Promise<boolean> {
    const seenIso = seen.toISOString().replace("Z", ""); // updated_at is naive UTC
    const [row] = await db
      .update(leads)
      .set({ updatedAt: new Date() })
      .where(and(eq(leads.id, leadId), eq(leads.organizationId, organizationId), sql`date_trunc('milliseconds', ${leads.updatedAt}) = ${seenIso}::timestamp`))
      .returning({ id: leads.id });
    return !!row;
  }

  static async updateLead(
    leadId: string,
    data: Partial<{ name: string; email: string; phone: string; company: string }>,
    updatedById: string,
    organizationId: string,
    expectedUpdatedAt?: Date,
  ) {
    try {
      // Canonicalize contact keys on edit too, so they match the dedup index and stored formats.
      const patch: Record<string, unknown> = { ...data, updatedAt: new Date() };
      if ("email" in data) patch.email = normalizeEmail(data.email) ?? null;
      if ("phone" in data) patch.phone = normalizePhone(data.phone, await orgDialCode(organizationId)) ?? null;
      // Same duplicate rule as create: the unique index only catches the exact same text, so
      // "9876543210" vs "+919876543210" would otherwise slip through on edit.
      const incoming = { email: "email" in data ? (patch.email as string | null) : null, phone: "phone" in data ? (patch.phone as string | null) : null };
      const dupConds = dedupConditions(incoming);
      if (dupConds.length) {
        const others = await db
          .select({ name: leads.name, email: leads.email, phone: leads.phone })
          .from(leads)
          .where(and(eq(leads.organizationId, organizationId), ne(leads.id, leadId), isNull(leads.deletedAt), or(...dupConds)))
          .limit(5);
        const byEmail = others.find((o) => sameLead(incoming, o).email);
        const byPhone = others.find((o) => sameLead(incoming, o).phone);
        if (byEmail || byPhone) {
          const err = new Error(`Already used by lead "${(byEmail ?? byPhone)!.name}"`);
          (err as any).code = "VALIDATION";
          (err as any).fieldErrors = {
            ...(byEmail ? { email: `Already used by active lead "${byEmail.name}".` } : {}),
            ...(byPhone ? { phone: `Already used by active lead "${byPhone.name}".` } : {}),
          };
          throw err;
        }
      }
      const conds = [eq(leads.id, leadId), eq(leads.organizationId, organizationId)];
      // Optimistic concurrency: only write if the row hasn't changed since the editor loaded it.
      // Truncate to milliseconds so Postgres' microsecond precision doesn't cause false conflicts
      // (every write sets updated_at from a JS Date, which is millisecond-precision).
      if (expectedUpdatedAt) {
        // Bind as a naive-UTC string (updated_at is `timestamp without time zone`, stored in UTC);
        // a raw Date can't be a parameter inside a sql template.
        const expIso = expectedUpdatedAt.toISOString().replace("Z", "");
        conds.push(sql`date_trunc('milliseconds', ${leads.updatedAt}) = ${expIso}::timestamp`);
      }
      const [updatedLead] = await db.update(leads)
        .set(patch)
        .where(and(...conds))
        .returning();
      if (!updatedLead && expectedUpdatedAt) {
        // Nothing updated: either the lead is gone or it was changed concurrently. Distinguish so the
        // UI can tell the user to reload rather than silently clobbering a colleague's edit.
        const [exists] = await db.select({ id: leads.id }).from(leads)
          .where(and(eq(leads.id, leadId), eq(leads.organizationId, organizationId))).limit(1);
        if (exists) {
          const err = new Error("This lead was changed by someone else. Reload and try again.");
          (err as any).code = "CONFLICT";
          throw err;
        }
      }
      if (updatedLead) eventBus.emit('lead.updated', { leadId, userId: updatedById, changes: data });
      return updatedLead;
    } catch (e: any) {
      const pg = e?.cause?.code ? e.cause : e;
      if (pg?.code === "23505") {
        const constraint = String(pg?.constraint_name || pg?.constraint || pg?.detail || pg?.message || "");
        if (constraint.includes("email")) {
          const err = new Error("Duplicate email: a lead with this email already exists");
          (err as any).fieldErrors = { email: "A lead with this email already exists." };
          throw err;
        }
        if (constraint.includes("phone")) {
          const err = new Error("Duplicate phone number: a lead with this phone number already exists");
          (err as any).fieldErrors = { phone: "A lead with this phone number already exists." };
          throw err;
        }
        throw new Error("Duplicate lead found with the same email or phone");
      }
      throw e;
    }
  }

  static async updateCustomData(leadId: string, customData: Record<string, unknown>, organizationId: string) {
    const [updated] = await db.update(leads)
      .set({ customData, updatedAt: new Date() })
      .where(and(eq(leads.id, leadId), eq(leads.organizationId, organizationId)))
      .returning();
    return updated;
  }

  static async getLead(leadId: string, organizationId: string) {
    const [lead] = await db.select().from(leads)
      .where(and(eq(leads.id, leadId), eq(leads.organizationId, organizationId), isNull(leads.deletedAt)))
      .limit(1);
    return lead;
  }

  // Unscoped fetch for trusted internal callers only (event handlers, background workers)
  static async getLeadById(leadId: string) {
    const [lead] = await db.select().from(leads).where(eq(leads.id, leadId)).limit(1);
    return lead;
  }

  private static buildRuleCondition(rule: FilterRule, currentUserId?: string) {
    let rawVal = rule.value;
    if (rawVal === "me" && currentUserId) {
      rawVal = currentUserId;
    }

    const op = rule.operator;

    // Status GROUP: every status (built-in or custom) in a category, resolved inside the query.
    if (rule.field === "statusCategory") {
      const catVal = String(rawVal || "");
      const baseKeys = DEFAULT_SYSTEM_STATUSES.filter((st) => st.category === catVal).map((st) => st.key);
      const inCustom = sql`${leads.status} IN (SELECT ${customStatusConfigs.key} FROM ${customStatusConfigs} WHERE ${customStatusConfigs.organizationId} = ${leads.organizationId} AND ${customStatusConfigs.category} = ${catVal})`;
      const cond = baseKeys.length ? or(inArray(leads.status, baseKeys), inCustom)! : inCustom;
      return op === "not_equals" ? sql`NOT (${cond})` : cond;
    }

    // Special field helpers
    if (rule.field === "tag" || rule.field === "tagId") {
      const tagVal = String(rawVal || "");
      if (op === "is_empty") {
        return sql`NOT EXISTS (SELECT 1 FROM ${leadTags} WHERE ${leadTags.leadId} = ${leads.id})`;
      }
      if (op === "is_not_empty") {
        return sql`EXISTS (SELECT 1 FROM ${leadTags} WHERE ${leadTags.leadId} = ${leads.id})`;
      }
      return exists(
        db
          .select({ id: leadTags.leadId })
          .from(leadTags)
          .innerJoin(tags, eq(leadTags.tagId, tags.id))
          .where(
            and(
              eq(leadTags.leadId, leads.id),
              or(eq(tags.id, tagVal), eq(tags.name, tagVal), ilike(tags.name, `%${tagVal}%`)),
            ),
          ),
      );
    }

    if (rule.field.startsWith("customData.")) {
      const key = rule.field.replace("customData.", "");
      // Some legacy rows stored custom_data as a JSON *string* scalar instead of an object; unwrap
      // those (#>>'{}' then re-cast) so ->> extracts the key for both shapes.
      const cd = sql`(CASE WHEN jsonb_typeof(${leads.customData}) = 'string' THEN (${leads.customData} #>> '{}')::jsonb ELSE ${leads.customData} END)`;
      const jsonPath = sql`${cd}->>${key}`;
      const strVal = String(rawVal ?? "");

      switch (op) {
        case "equals":
          return eq(jsonPath, strVal);
        case "not_equals":
          return ne(jsonPath, strVal);
        case "contains":
          return ilike(jsonPath, `%${strVal}%`);
        case "does_not_contain":
          return sql`${jsonPath} NOT ILIKE ${"%" + strVal + "%"}`;
        case "is_empty":
          return or(isNull(jsonPath), eq(jsonPath, ""));
        case "is_not_empty":
          return and(isNotNull(jsonPath), ne(jsonPath, ""));
        default:
          return eq(jsonPath, strVal);
      }
    }

    // Standard column mapping
    const colMap: Record<string, any> = {
      status: leads.status,
      ownerId: leads.ownerId,
      teamId: leads.teamId,
      sourceId: leads.sourceId,
      stageId: leads.stageId,
      pipelineId: leads.pipelineId,
      priority: leads.priority,
      name: leads.name,
      email: leads.email,
      phone: leads.phone,
      company: leads.company,
      score: leads.score,
      expectedValue: leads.expectedValue,
      createdAt: leads.createdAt,
      updatedAt: leads.updatedAt,
      nextFollowUpAt: leads.nextFollowUpAt,
      firstContactedAt: leads.firstContactedAt,
    };

    const col = colMap[rule.field];
    if (!col) return undefined;

    const strVal = rawVal !== undefined && rawVal !== null ? String(rawVal) : "";
    const isText = ["name", "email", "phone", "company", "status", "priority", "lostReason"].includes(rule.field);

    switch (op) {
      case "equals":
        if (rawVal === null || strVal === "" || strVal === "null" || strVal === "unassigned") {
          return isNull(col);
        }
        return eq(col, rawVal as any);

      case "not_equals":
        if (rawVal === null || strVal === "" || strVal === "null" || strVal === "unassigned") {
          return isNotNull(col);
        }
        return ne(col, rawVal as any);

      case "contains":
        return isText ? ilike(col, `%${strVal}%`) : sql`${col}::text ILIKE ${"%" + strVal + "%"}`;

      case "does_not_contain":
        return isText ? sql`${col} NOT ILIKE ${"%" + strVal + "%"}` : sql`${col}::text NOT ILIKE ${"%" + strVal + "%"}`;

      case "is_empty":
        return isText ? or(isNull(col), eq(col, "")) : isNull(col);

      case "is_not_empty":
        return isText ? and(isNotNull(col), ne(col, "")) : isNotNull(col);

      case "before": {
        const d = strVal === "now" ? new Date() : new Date(strVal);
        return lt(col, d);
      }

      case "after": {
        const d = strVal === "now" ? new Date() : new Date(strVal);
        return gt(col, d);
      }

      case "between": {
        let dates: [Date, Date];
        if (Array.isArray(rawVal) && rawVal.length === 2) {
          dates = [new Date(rawVal[0]), new Date(rawVal[1])];
        } else if (typeof rawVal === "string" && rawVal.includes(",")) {
          const parts = rawVal.split(",");
          dates = [new Date(parts[0]), new Date(parts[1])];
        } else {
          dates = [new Date(0), new Date()];
        }
        return and(gte(col, dates[0]), lte(col, dates[1]));
      }

      case "gt":
        return gt(col, isNaN(Number(rawVal)) ? rawVal : Number(rawVal));

      case "lt":
        return lt(col, isNaN(Number(rawVal)) ? rawVal : Number(rawVal));

      default:
        return eq(col, rawVal as any);
    }
  }

  static async listLeads(options: ListLeadsOptions) {
    const page = Math.max(options.page || 1, 1);
    const limit = Math.min(Math.max(options.limit || 50, 1), options.maxLimit ?? 100);
    const offset = (page - 1) * limit;

    // Recycled (soft-deleted) leads never appear in normal lists.
    const baseConditions = [eq(leads.organizationId, options.organizationId), isNull(leads.deletedAt)];

    // Strict owner isolation: non-admin callers strictly only see their own assigned leads.
    if (options.enforceOwnerId) {
      baseConditions.push(eq(leads.ownerId, options.enforceOwnerId));
    }

    // Global Search (Name, Phone, Email, Company)
    if (options.search && options.search.trim()) {
      baseConditions.push(leadSearchCondition(options.search));
    }

    if (options.segment && options.segment !== "hot_leads") {
      baseConditions.push((await SmartSegmentationService.conditions(options.organizationId))[options.segment]);
    }

    // Shortcut params
    if (options.status) baseConditions.push(eq(leads.status, options.status));
    if (options.hideJunkLost) {
      baseConditions.push(sql`${leads.status} NOT IN ('junk', 'lost')`);
      baseConditions.push(sql`${leads.status} NOT IN (SELECT ${customStatusConfigs.key} FROM ${customStatusConfigs} WHERE ${customStatusConfigs.organizationId} = ${leads.organizationId} AND ${customStatusConfigs.category} = 'lost')`);
    }
    if (!options.enforceOwnerId && options.ownerId) {
      if (options.ownerId === "null" || options.ownerId === "unassigned") {
        baseConditions.push(isNull(leads.ownerId));
      } else {
        baseConditions.push(eq(leads.ownerId, options.ownerId));
      }
    }
    if (options.teamId) baseConditions.push(eq(leads.teamId, options.teamId));
    if (options.sourceId) baseConditions.push(eq(leads.sourceId, options.sourceId));
    if (options.stageId) baseConditions.push(eq(leads.stageId, options.stageId));
    if (options.ids) baseConditions.push(options.ids.length ? inArray(leads.id, options.ids) : sql`false`);

    // Structured Filters (Group or Rules array)
    if (options.filters) {
      let rules: FilterRule[] = [];
      let logic: "AND" | "OR" = "AND";

      if (Array.isArray(options.filters)) {
        rules = options.filters;
      } else if (options.filters.rules) {
        rules = options.filters.rules;
        logic = options.filters.logic || "AND";
      }

      if (options.enforceOwnerId) {
        rules = rules.filter((r) => r.field !== "ownerId");
      }

      const ruleConds = rules
        .map((r) => this.buildRuleCondition(r, options.currentUserId))
        .filter(Boolean);

      if (ruleConds.length > 0) {
        if (logic === "OR") {
          baseConditions.push(or(...ruleConds)!);
        } else {
          baseConditions.push(and(...ruleConds)!);
        }
      }
    }

    const where = and(...baseConditions);

    // Sorting
    let sortCol: any = leads.createdAt;
    if (options.sortField === "updatedAt") sortCol = leads.updatedAt;
    else if (options.sortField === "owner") sortCol = sql`(SELECT lower(coalesce(nullif(trim(concat_ws(' ', u.first_name, u.last_name)), ''), u.email)) FROM users u WHERE u.id = "leads"."owner_id")`;
    else if (options.sortField === "crn") sortCol = leads.crn;
    else if (options.sortField === "name") sortCol = leads.name;
    else if (options.sortField === "status") sortCol = leads.status;
    else if (options.sortField === "ownerId") sortCol = leads.ownerId;
    else if (options.sortField === "nextFollowUpAt") sortCol = leads.nextFollowUpAt;
    else if (options.sortField === "priority") sortCol = leads.priority;
    else if (options.sortField === "score") sortCol = leads.score;

    // Blanks (no owner, no follow-up) sink to the bottom whichever way the column is sorted.
    const orderExpr = options.sortOrder === "asc" ? sql`${sortCol} ASC NULLS LAST` : sql`${sortCol} DESC NULLS LAST`;

    // Default view surfaces unworked "new" leads first (then newest). An explicit column sort from
    // the user overrides this — their choice wins. `id` last: most sort columns aren't unique, and
    // without a tiebreaker offset paging repeats or skips rows between pages.
    const orderBy = options.sortField
      ? [orderExpr, desc(leads.id)]
      : [sql`(${leads.status} = 'new') desc`, desc(leads.createdAt), desc(leads.id)];

    const [data, [{ total }]] = await Promise.all([
      db
        .select({
          ...getTableColumns(leads),
          // Internal AI/scoring blobs are the bulk of custom_data and no list renders them.
          customData: sql<unknown>`${leads.customData} - '_aiRecap' - '_scoreFactors' - '_enrichment'`.as("custom_data"),
          // Latest human note (system bookkeeping notes skipped) — the list's context preview.
          lastNote: sql<{ content: string; at: string } | null>`(
            SELECT json_build_object('content', left(a.content, 300), 'at', a.created_at AT TIME ZONE 'UTC') FROM ${activities} a
            WHERE a.lead_id = "leads"."id" AND a.type = 'note' AND a.content !~ ${SYSTEM_NOTE_RE}
            ORDER BY a.created_at DESC LIMIT 1)`.as("last_note"),
        })
        .from(leads)
        .where(where)
        .orderBy(...orderBy)
        .limit(limit)
        .offset(offset),
      db.select({ total: count() }).from(leads).where(where),
    ]);

    const totalCount = Number(total || 0);
    const totalPages = Math.ceil(totalCount / limit) || 1;

    return {
      data,
      total: totalCount,
      page,
      limit,
      totalPages,
    };
  }

  /** Lead count per status for the list's status chips (tenant-wide, owner-scoped for reps). */
  static async statusCounts(organizationId: string, enforceOwnerId?: string) {
    const rows = await db
      .select({ status: leads.status, n: count() })
      .from(leads)
      .where(and(eq(leads.organizationId, organizationId), isNull(leads.deletedAt), ...(enforceOwnerId ? [eq(leads.ownerId, enforceOwnerId)] : [])))
      .groupBy(leads.status);
    return Object.fromEntries(rows.map((r) => [r.status, Number(r.n)])) as Record<string, number>;
  }

  // Lean feed for the dashboard "Today's priorities" panel. Instead of loading every lead and scoring
  // them all in JS, this returns only leads that CAN resolve to a high-priority next-best-action —
  // a SQL superset of NextBestActionService's high-priority rules (new & uncontacted, overdue follow-up
  // on an open lead, hot active lead, or a lead that recently opened shared content). NextBestAction
  // stays the authority on the final label; this just narrows what we score.
  static async listPriorityCandidates(organizationId: string, engagedIds: string[] = [], limit = 200, enforceOwnerId?: string) {
    const now = new Date();
    // Resolve by status CATEGORY so tenants' custom open/in-progress statuses are included too.
    const { CustomStatusSchemaService } = await import("./customStatusSchemaService");
    const categories = await CustomStatusSchemaService.getStatusCategoryMap(organizationId);
    const keysIn = (...cats: string[]) => [...categories].filter(([, c]) => cats.includes(c)).map(([k]) => k);
    const openStatuses = keysIn("open", "in_progress");
    const inProgress = keysIn("in_progress");
    const orConds = [
      and(inArray(leads.status, openStatuses), isNull(leads.lastContactedAt)),
      and(inArray(leads.status, openStatuses), isNotNull(leads.nextFollowUpAt), lt(leads.nextFollowUpAt, now)),
      and(inArray(leads.status, inProgress), gte(leads.score, 70)),
    ];
    if (engagedIds.length) orConds.push(inArray(leads.id, engagedIds));

    return db
      .select({
        id: leads.id,
        name: leads.name,
        status: leads.status,
        score: leads.score,
        phone: leads.phone,
        email: leads.email,
        lastContactedAt: leads.lastContactedAt,
        nextFollowUpAt: leads.nextFollowUpAt,
        // The cached AI plan, so the dashboard can rank by the AI's read without calling a model.
        // It's the same blob the lead page reads; nothing here generates or refreshes it.
        customData: leads.customData,
      })
      .from(leads)
      .where(and(
        eq(leads.organizationId, organizationId),
        isNull(leads.deletedAt),
        ...(enforceOwnerId ? [eq(leads.ownerId, enforceOwnerId)] : []),
        or(...orConds)
      ))
      .limit(limit);
  }

  static async listLeadsByStage(organizationId: string, limitPerStage = 20, statuses?: string[], enforceOwnerId?: string) {
    const cols = statuses && statuses.length ? statuses : ["new", "active", "won", "lost", "unqualified"];

    // Fetch every column concurrently — the board previously issued them one status at a time, so on
    // the remote DB it cost one ~300ms round-trip per column (~1.5s for 5). In parallel it's ~one.
    const perColumn = await Promise.all(
      cols.map(async (st) => {
        const { data, total } = await this.listLeads({ organizationId, status: st, page: 1, limit: limitPerStage, enforceOwnerId });
        return [st, { data, total }] as const;
      }),
    );

    return Object.fromEntries(perColumn) as Record<string, { data: any[]; total: number }>;
  }

  // Soft delete → recycle bin. The lead disappears from all lists but is recoverable for 30 days.
  static async deleteLead(leadId: string, deletedById: string, organizationId: string) {
    const validBy = (deletedById && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(deletedById)) ? deletedById : null;
    const [deletedLead] = await db.update(leads)
      .set({ deletedAt: new Date(), deletedBy: validBy, updatedAt: new Date() }) // updatedAt: phones pull the delete as a change
      .where(and(eq(leads.id, leadId), eq(leads.organizationId, organizationId), isNull(leads.deletedAt)))
      .returning();
    return deletedLead;
  }

  // Soft-delete many leads in ONE statement; returns the ids actually deleted (already-gone or
  // foreign ids simply don't come back).
  static async bulkDeleteLeads(leadIds: string[], deletedById: string, organizationId: string): Promise<string[]> {
    if (leadIds.length === 0) return [];
    const validBy = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(deletedById) ? deletedById : null;
    const rows = await db.update(leads)
      .set({ deletedAt: new Date(), deletedBy: validBy, updatedAt: new Date() })
      .where(and(inArray(leads.id, leadIds), eq(leads.organizationId, organizationId), isNull(leads.deletedAt)))
      .returning({ id: leads.id });
    return rows.map((r) => r.id);
  }

  static async listDeletedLeads(organizationId: string, ownerId?: string) {
    // Only the fields the recycle bin renders (the route maps to these nine), and bounded — this
    // used to be an unbounded SELECT * of every soft-deleted lead, customData blobs included.
    const rows = await db
      .select({
        id: leads.id,
        name: leads.name,
        email: leads.email,
        phone: leads.phone,
        company: leads.company,
        status: leads.status,
        createdAt: leads.createdAt,
        deletedAt: leads.deletedAt,
      })
      .from(leads)
      .where(and(eq(leads.organizationId, organizationId), isNotNull(leads.deletedAt), ...(ownerId ? [eq(leads.ownerId, ownerId)] : [])))
      .orderBy(desc(leads.deletedAt))
      .limit(500);
    const PURGE_DAYS = 30;
    return rows.map((l) => {
      const deletedMs = l.deletedAt ? new Date(l.deletedAt).getTime() : Date.now();
      const daysLeft = Math.max(0, PURGE_DAYS - Math.floor((Date.now() - deletedMs) / (1000 * 60 * 60 * 24)));
      return { ...l, daysLeft };
    });
  }

  static async restoreLead(leadId: string, organizationId: string, ownerId?: string) {
    await PlanService.assertCanAddLead(organizationId);
    const [restored] = await db.update(leads)
      .set({ deletedAt: null, deletedBy: null, updatedAt: new Date() })
      .where(and(eq(leads.id, leadId), eq(leads.organizationId, organizationId), isNotNull(leads.deletedAt), ...(ownerId ? [eq(leads.ownerId, ownerId)] : [])))
      .returning();
    return restored;
  }

  // Permanently removes leads AND their child rows. Several child tables (activities, follow-ups,
  // attachments, status history, tags, notifications, WhatsApp messages) don't ON DELETE CASCADE,
  // so we clear them first — otherwise the leads delete hits a foreign-key violation.
  private static async hardDeleteLeads(leadIds: string[]): Promise<number> {
    if (leadIds.length === 0) return 0;
    // Chunked (Postgres caps a statement at 65 535 parameters; a tenant can have far more deleted leads)
    // and one transaction per chunk, so a failure rolls that chunk back whole instead of leaving
    // half-purged leads. Stored files are deleted only AFTER the rows are gone (a failed delete can then
    // only orphan a file, never leave a row pointing at a missing one).
    const CHUNK = 1000;
    let total = 0;
    for (let i = 0; i < leadIds.length; i += CHUNK) {
      const ids = leadIds.slice(i, i + CHUNK);
      const { removed, refs } = await db.transaction(async (tx) => {
        await tx.delete(activities).where(inArray(activities.leadId, ids));
        // reminders reference follow_ups (a grandchild), so clear them before their follow-ups.
        const fu = await tx.select({ id: followUps.id }).from(followUps).where(inArray(followUps.leadId, ids));
        if (fu.length) await tx.delete(reminders).where(inArray(reminders.followUpId, fu.map((f) => f.id)));
        await tx.delete(followUps).where(inArray(followUps.leadId, ids));
        const files = await tx.select({ ref: leadAttachments.fileUrl }).from(leadAttachments).where(inArray(leadAttachments.leadId, ids));
        await tx.delete(leadAttachments).where(inArray(leadAttachments.leadId, ids));
        await tx.delete(leadStatusHistory).where(inArray(leadStatusHistory.leadId, ids));
        await tx.delete(leadTags).where(inArray(leadTags.leadId, ids));
        await tx.delete(notifications).where(inArray(notifications.leadId, ids));
        await tx.delete(whatsappMessages).where(inArray(whatsappMessages.leadId, ids));
        const deleted = await tx.delete(leads).where(inArray(leads.id, ids)).returning({ id: leads.id });
        return { removed: deleted.length, refs: files.map((f) => f.ref) };
      });
      total += removed;
      if (refs.length) {
        const { deleteAttachment } = await import("@/lib/storage/attachments");
        await Promise.all(refs.map((r) => deleteAttachment(r)));
      }
    }
    return total;
  }

  // Permanent removal — the only path that actually deletes rows. Gate behind leads.purge.
  static async purgeLead(leadId: string, organizationId: string) {
    const [target] = await db.select({ id: leads.id }).from(leads)
      .where(and(eq(leads.id, leadId), eq(leads.organizationId, organizationId), isNotNull(leads.deletedAt)));
    if (!target) return null;
    await this.hardDeleteLeads([leadId]);
    return { id: leadId };
  }

  static async emptyRecycleBin(organizationId: string) {
    const rows = await db.select({ id: leads.id }).from(leads)
      .where(and(eq(leads.organizationId, organizationId), isNotNull(leads.deletedAt)));
    const purgedCount = await this.hardDeleteLeads(rows.map((r) => r.id));
    return { purgedCount };
  }

  // Auto-purge: permanently remove anything soft-deleted more than `days` ago (default 30), across
  // every organization. Logs one System-attributed audit entry per organization touched — not per
  // lead — so a busy scan doesn't flood any single org's trail.
  static async purgeExpired(days = 30) {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const rows = await db.select({ id: leads.id, organizationId: leads.organizationId }).from(leads)
      .where(and(isNotNull(leads.deletedAt), lt(leads.deletedAt, cutoff)));
    const purgedCount = await this.hardDeleteLeads(rows.map((r) => r.id));

    const byOrg = new Map<string, number>();
    for (const r of rows) byOrg.set(r.organizationId, (byOrg.get(r.organizationId) ?? 0) + 1);
    const { AuditService } = await import("@/domains/audit/service");
    for (const [organizationId, purgedForOrg] of byOrg) {
      await AuditService.log({ organizationId, action: "lead.auto_purge", entityType: "organization", entityId: organizationId, metadata: { purgedCount: purgedForOrg, olderThanDays: days } });
    }
    return { purgedCount };
  }

  // Delegate to canonical AssignmentService
  static async assignLead(leadId: string, ownerId: string | null, assignedById: string | undefined, organizationId: string) {
    const { AssignmentService } = await import("./assignmentService");
    return AssignmentService.assignLead({
      leadId,
      ownerId,
      assignedById: assignedById ?? "system",
      organizationId,
    });
  }

  static async changeStatus(leadId: string, newStatus: string, changedById: string | null | undefined, organizationId: string, reason?: string | null, source?: string) {
    const idWhere = and(eq(leads.id, leadId), eq(leads.organizationId, organizationId));

    const [currentLead] = await db.select({ status: leads.status, organizationId: leads.organizationId }).from(leads).where(idWhere).limit(1);
    if (!currentLead) throw new Error("Lead not found");
    if (currentLead.status === newStatus) return currentLead;

    // Capture disposition by the target status's CATEGORY, not its literal key — so custom statuses
    // (e.g. "closed_won" in the won category, "disqualified" in the lost category) get the same
    // won/lost bookkeeping as the base keys. Resolving via the tenant schema is the single fix that
    // keeps won_at, loss reason, follow-up cancellation and analytics correct for custom statuses.
    const { CustomStatusSchemaService } = await import("./customStatusSchemaService");
    const category = await CustomStatusSchemaService.getStatusCategory(currentLead.organizationId, newStatus);
    const isLoss = category === "lost" || category === "unqualified";
    const isWon = category === "won";
    const isClosed = isLoss || isWon;
    const patch: Record<string, unknown> = { status: newStatus, updatedAt: new Date() };
    if (isLoss) patch.lostReason = reason?.trim() || null;
    else patch.lostReason = null;
    if (isWon) patch.wonAt = new Date();
    // A resolved lead is no longer an active follow-up opportunity: drop its pending follow-up so it
    // stops surfacing in overdue lists, the dashboard and "next best action". Reopening schedules anew.
    if (isClosed) patch.nextFollowUpAt = null;

    const [updatedLead] = await db.update(leads).set(patch).where(idWhere).returning();

    if (isClosed) {
      await db.update(followUps)
        .set({ status: "cancelled", updatedAt: new Date() })
        .where(and(eq(followUps.leadId, leadId), eq(followUps.status, "pending")));
      // Keep the pipeline board honest: a Won lead shouldn't sit in "New Lead".
      await this.moveToClosingStage(updatedLead, isWon ? "won" : "lost").catch(() => {});
    }

    const validChangedById = (changedById && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(changedById))
      ? changedById
      : null;

    await db.insert(leadStatusHistory).values({
      leadId, oldStatus: currentLead.status, newStatus, changedById: validChangedById,
    });
    if (isLoss && reason?.trim()) {
      await ActivityService.addActivity({ leadId, userId: validChangedById ?? undefined, type: "note", content: `Lost reason: ${reason.trim()}` });
    }
    eventBus.emit('lead.status_changed', { leadId, oldStatus: currentLead.status, newStatus, userId: validChangedById ?? undefined, source });
    return updatedLead;
  }

  // Status and pipeline stage are separate fields. When a lead is won/lost, move it to the pipeline's
  // matching stage ("Won", "Closed Won", "Lost"…) if the tenant has one — never invent a stage.
  static async moveToClosingStage(lead: { id: string; organizationId: string | null; stageId: string | null }, kind: "won" | "lost") {
    if (!lead.organizationId) return;
    const all = await db
      .select({ id: leadPipelineStages.id, name: leadPipelineStages.name, pipelineId: leadPipelineStages.pipelineId })
      .from(leadPipelineStages)
      .where(eq(leadPipelineStages.organizationId, lead.organizationId));
    const current = all.find((st) => st.id === lead.stageId);
    const candidates = current ? all.filter((st) => st.pipelineId === current.pipelineId) : all;
    const target = matchClosingStage(candidates, kind);
    if (target && target.id !== lead.stageId) {
      await db.update(leads).set({ stageId: target.id, updatedAt: new Date() }).where(eq(leads.id, lead.id));
      const { eventBus } = await import("@/lib/events/emitter");
      eventBus.emit("lead.stage_changed", { leadId: lead.id, changes: { stageId: target.id, fromStageId: lead.stageId } });
    }
  }
}

const CLOSING_STAGE = {
  won: /\b(won|closed[\s-]*won|deal[\s-]*won|converted|booked|sold)\b/i,
  lost: /\b(lost|closed[\s-]*lost|dropped|not[\s-]*interested|disqualified)\b/i,
};

/** Pick the stage whose name clearly means won/lost; null when the pipeline has none. */
export function matchClosingStage<T extends { name: string }>(stages: T[], kind: "won" | "lost"): T | null {
  return stages.find((st) => CLOSING_STAGE[kind].test(st.name)) ?? null;
}

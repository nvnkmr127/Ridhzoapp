import { db } from "@/db";
import { leads, leadStatusHistory, leadTags, tags, activities, followUps, reminders, leadAttachments, notifications, whatsappMessages } from "@/db/schema";
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
} from "drizzle-orm";
import { eventBus } from "@/lib/events/emitter";
import { ActivityService } from "@/domains/activities/service";
import { FilterGroup, FilterRule } from "@/domains/savedViews/service";
import { normalizeEmail, normalizePhone } from "@/lib/leads/normalize";
import { PlanService } from "@/domains/billing/planService";
import { assertRequiredLeadFields } from "@/lib/leads/requiredFields";

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
};

export class LeadService {
  static async createLead(
    data: { name: string; email?: string; phone?: string; company?: string; ownerId?: string; teamId?: string; customData?: Record<string, unknown> },
    createdById: string | null,
    organizationId: string,
  ): Promise<typeof leads.$inferSelect> {
    await PlanService.assertCanAddLead(organizationId);
    // Enforce the org's required-field configuration at the ONE spot every synchronous create path
    // (manual UI, REST API, booking) funnels through — so the setting can't be UI-only.
    await assertRequiredLeadFields(organizationId, data);
    // Dedup within THIS org only — same email/phone in another tenant is a different lead.
    // Canonicalize first so "+1 555-0101" and "+15550101" are stored and compared identically;
    // otherwise formatting differences slip past both the app check and the DB unique index.
    const cleanEmail = normalizeEmail(data.email);
    const cleanPhone = normalizePhone(data.phone);
    // Compare phones on digits only so "+15550101234", "15550101234" and "+1 (555) 010-1234" are
    // treated as the same number — the DB unique index only catches exact-string matches, so this
    // app-level check is what dedups country-code / plus-vs-no-plus variants at create time.
    const phoneDigits = cleanPhone ? cleanPhone.replace(/\D/g, "") : "";
    if (cleanEmail || cleanPhone) {
      const orConds = [];
      if (cleanEmail) orConds.push(eq(leads.email, cleanEmail));
      if (phoneDigits) orConds.push(sql`regexp_replace(${leads.phone}, '\\D', '', 'g') = ${phoneDigits}`);
      const existing = await db
        .select({ id: leads.id, name: leads.name, email: leads.email, phone: leads.phone, deletedAt: leads.deletedAt })
        .from(leads)
        .where(and(eq(leads.organizationId, organizationId), or(...orConds)));

      const active = existing.filter((r) => !r.deletedAt);
      const inRecycleBin = existing.filter((r) => r.deletedAt);

      const dupActiveEmail = cleanEmail && active.find((r) => r.email?.toLowerCase() === cleanEmail.toLowerCase());
      const dupActivePhone = phoneDigits && active.find((r) => r.phone && r.phone.replace(/\D/g, "") === phoneDigits);

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
          if (cleanEmail && trashed.email?.toLowerCase() === cleanEmail.toLowerCase()) {
            updates.email = null;
          }
          if (phoneDigits && trashed.phone && trashed.phone.replace(/\D/g, "") === phoneDigits) {
            updates.phone = null;
          }
          if (Object.keys(updates).length > 0) {
            await db.update(leads).set(updates).where(eq(leads.id, trashed.id));
          }
        }
      }
    }

    let newLead;
    try {
      [newLead] = await db.insert(leads).values({
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
    } catch (e: any) {
      // If constraint violation occurs due to a soft-deleted lead, clear it and retry once
      if (e?.code === "23505") {
        const constraint = String(e?.constraint || e?.detail || e?.message || "");
        if (constraint.includes("email")) {
          if (cleanEmail) {
            const [trashed] = await db
              .select({ id: leads.id })
              .from(leads)
              .where(and(eq(leads.organizationId, organizationId), isNotNull(leads.deletedAt), eq(leads.email, cleanEmail)))
              .limit(1);
            if (trashed) {
              await db.update(leads).set({ email: null }).where(eq(leads.id, trashed.id));
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
              await db.update(leads).set({ phone: null }).where(eq(leads.id, trashed.id));
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
      if ("phone" in data) patch.phone = normalizePhone(data.phone) ?? null;
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
      if (e?.code === "23505") {
        const constraint = String(e?.constraint || e?.detail || e?.message || "");
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
    const limit = Math.max(options.limit || 50, 1);
    const offset = (page - 1) * limit;

    // Recycled (soft-deleted) leads never appear in normal lists.
    const baseConditions = [eq(leads.organizationId, options.organizationId), isNull(leads.deletedAt)];

    // Global Search (Name, Phone, Email, Company)
    if (options.search && options.search.trim()) {
      const term = options.search.trim();
      const rawDigits = term.replace(/[^0-9]/g, "");

      const searchConds = [
        ilike(leads.name, `%${term}%`),
        ilike(leads.email, `%${term}%`),
        ilike(leads.company, `%${term}%`),
      ];

      if (rawDigits.length >= 3) {
        searchConds.push(
          sql`regexp_replace(${leads.phone}, '[^0-9]', '', 'g') ILIKE ${"%" + rawDigits + "%"}`,
        );
      } else {
        searchConds.push(ilike(leads.phone, `%${term}%`));
      }

      baseConditions.push(or(...searchConds)!);
    }

    // Shortcut params
    if (options.status) baseConditions.push(eq(leads.status, options.status));
    if (options.ownerId) {
      if (options.ownerId === "null" || options.ownerId === "unassigned") {
        baseConditions.push(isNull(leads.ownerId));
      } else {
        baseConditions.push(eq(leads.ownerId, options.ownerId));
      }
    }
    if (options.teamId) baseConditions.push(eq(leads.teamId, options.teamId));
    if (options.sourceId) baseConditions.push(eq(leads.sourceId, options.sourceId));
    if (options.stageId) baseConditions.push(eq(leads.stageId, options.stageId));

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
    else if (options.sortField === "name") sortCol = leads.name;
    else if (options.sortField === "status") sortCol = leads.status;
    else if (options.sortField === "ownerId") sortCol = leads.ownerId;
    else if (options.sortField === "nextFollowUpAt") sortCol = leads.nextFollowUpAt;
    else if (options.sortField === "priority") sortCol = leads.priority;
    else if (options.sortField === "score") sortCol = leads.score;

    const orderExpr = options.sortOrder === "asc" ? asc(sortCol) : desc(sortCol);

    // Default view surfaces unworked "new" leads first (then newest). An explicit column sort from
    // the user overrides this — their choice wins.
    const orderBy = options.sortField
      ? [orderExpr]
      : [sql`(${leads.status} = 'new') desc`, desc(leads.createdAt)];

    const [data, [{ total }]] = await Promise.all([
      db.select().from(leads).where(where).orderBy(...orderBy).limit(limit).offset(offset),
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

  // Lean feed for the dashboard "Today's priorities" panel. Instead of loading every lead and scoring
  // them all in JS, this returns only leads that CAN resolve to a high-priority next-best-action —
  // a SQL superset of NextBestActionService's high-priority rules (new & uncontacted, overdue follow-up
  // on an open lead, hot active lead, or a lead that recently opened shared content). NextBestAction
  // stays the authority on the final label; this just narrows what we score.
  static async listPriorityCandidates(organizationId: string, engagedIds: string[] = [], limit = 200) {
    const now = new Date();
    const openStatuses = ["new", "active"];
    const orConds = [
      and(eq(leads.status, "new"), isNull(leads.lastContactedAt)),
      and(inArray(leads.status, openStatuses), isNotNull(leads.nextFollowUpAt), lt(leads.nextFollowUpAt, now)),
      and(eq(leads.status, "active"), gte(leads.score, 70)),
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
      })
      .from(leads)
      .where(and(eq(leads.organizationId, organizationId), isNull(leads.deletedAt), or(...orConds)))
      .limit(limit);
  }

  static async listLeadsByStage(organizationId: string, limitPerStage = 20, statuses?: string[]) {
    const cols = statuses && statuses.length ? statuses : ["new", "active", "won", "lost", "unqualified"];

    // Fetch every column concurrently — the board previously issued them one status at a time, so on
    // the remote DB it cost one ~300ms round-trip per column (~1.5s for 5). In parallel it's ~one.
    const perColumn = await Promise.all(
      cols.map(async (st) => {
        const { data, total } = await this.listLeads({ organizationId, status: st, page: 1, limit: limitPerStage });
        return [st, { data, total }] as const;
      }),
    );

    return Object.fromEntries(perColumn) as Record<string, { data: any[]; total: number }>;
  }

  // Soft delete → recycle bin. The lead disappears from all lists but is recoverable for 30 days.
  static async deleteLead(leadId: string, deletedById: string, organizationId: string) {
    const validBy = (deletedById && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(deletedById)) ? deletedById : null;
    const [deletedLead] = await db.update(leads)
      .set({ deletedAt: new Date(), deletedBy: validBy })
      .where(and(eq(leads.id, leadId), eq(leads.organizationId, organizationId), isNull(leads.deletedAt)))
      .returning();
    return deletedLead;
  }

  static async listDeletedLeads(organizationId: string) {
    const rows = await db.select().from(leads)
      .where(and(eq(leads.organizationId, organizationId), isNotNull(leads.deletedAt)))
      .orderBy(desc(leads.deletedAt));
    const PURGE_DAYS = 30;
    return rows.map((l) => {
      const deletedMs = l.deletedAt ? new Date(l.deletedAt).getTime() : Date.now();
      const daysLeft = Math.max(0, PURGE_DAYS - Math.floor((Date.now() - deletedMs) / (1000 * 60 * 60 * 24)));
      return { ...l, daysLeft };
    });
  }

  static async restoreLead(leadId: string, organizationId: string) {
    await PlanService.assertCanAddLead(organizationId);
    const [restored] = await db.update(leads)
      .set({ deletedAt: null, deletedBy: null })
      .where(and(eq(leads.id, leadId), eq(leads.organizationId, organizationId), isNotNull(leads.deletedAt)))
      .returning();
    return restored;
  }

  // Permanently removes leads AND their child rows. Several child tables (activities, follow-ups,
  // attachments, status history, tags, notifications, WhatsApp messages) don't ON DELETE CASCADE,
  // so we clear them first — otherwise the leads delete hits a foreign-key violation.
  private static async hardDeleteLeads(leadIds: string[]): Promise<number> {
    if (leadIds.length === 0) return 0;
    await db.delete(activities).where(inArray(activities.leadId, leadIds));
    // reminders reference follow_ups (a grandchild), so clear them before their follow-ups.
    const fu = await db.select({ id: followUps.id }).from(followUps).where(inArray(followUps.leadId, leadIds));
    if (fu.length) await db.delete(reminders).where(inArray(reminders.followUpId, fu.map((f) => f.id)));
    await db.delete(followUps).where(inArray(followUps.leadId, leadIds));
    await db.delete(leadAttachments).where(inArray(leadAttachments.leadId, leadIds));
    await db.delete(leadStatusHistory).where(inArray(leadStatusHistory.leadId, leadIds));
    await db.delete(leadTags).where(inArray(leadTags.leadId, leadIds));
    await db.delete(notifications).where(inArray(notifications.leadId, leadIds));
    await db.delete(whatsappMessages).where(inArray(whatsappMessages.leadId, leadIds));
    const deleted = await db.delete(leads).where(inArray(leads.id, leadIds)).returning({ id: leads.id });
    return deleted.length;
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
  static async assignLead(leadId: string, ownerId: string | null, assignedById?: string, organizationId?: string) {
    const { AssignmentService } = await import("./assignmentService");
    return AssignmentService.assignLead({
      leadId,
      ownerId,
      assignedById: assignedById ?? "system",
      organizationId,
    });
  }

  static async changeStatus(leadId: string, newStatus: string, changedById?: string | null, organizationId?: string, reason?: string | null, source?: string) {
    const idWhere = organizationId
      ? and(eq(leads.id, leadId), eq(leads.organizationId, organizationId))
      : eq(leads.id, leadId);

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
}

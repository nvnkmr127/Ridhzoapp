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
    // Dedup within THIS org only — same email/phone in another tenant is a different lead.
    const cleanEmail = data.email?.trim() || undefined;
    const cleanPhone = data.phone?.trim() || undefined;
    if (cleanEmail || cleanPhone) {
      const orConds = [];
      if (cleanEmail) orConds.push(eq(leads.email, cleanEmail));
      if (cleanPhone) orConds.push(eq(leads.phone, cleanPhone));
      const existing = await db
        .select({ id: leads.id, name: leads.name, email: leads.email, phone: leads.phone, deletedAt: leads.deletedAt })
        .from(leads)
        .where(and(eq(leads.organizationId, organizationId), or(...orConds)));

      const active = existing.filter((r) => !r.deletedAt);
      const inRecycleBin = existing.filter((r) => r.deletedAt);

      const dupActiveEmail = cleanEmail && active.find((r) => r.email?.toLowerCase() === cleanEmail.toLowerCase());
      const dupActivePhone = cleanPhone && active.find((r) => r.phone === cleanPhone);

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
          if (cleanPhone && trashed.phone === cleanPhone) {
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
  ) {
    try {
      const [updatedLead] = await db.update(leads)
        .set({ ...data, updatedAt: new Date() })
        .where(and(eq(leads.id, leadId), eq(leads.organizationId, organizationId)))
        .returning();
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
      const jsonPath = sql`${leads.customData}->>${key}`;
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

  static async listLeadsByStage(organizationId: string, limitPerStage = 20) {
    const statuses = ["new", "active", "won", "lost", "unqualified"];
    const results: Record<string, { data: any[]; total: number }> = {};

    for (const st of statuses) {
      const { data, total } = await this.listLeads({
        organizationId,
        status: st,
        page: 1,
        limit: limitPerStage,
      });
      results[st] = { data, total };
    }

    return results;
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

  // Auto-purge: permanently remove anything soft-deleted more than `days` ago (default 30).
  static async purgeExpired(days = 30) {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const rows = await db.select({ id: leads.id }).from(leads)
      .where(and(isNotNull(leads.deletedAt), lt(leads.deletedAt, cutoff)));
    const purgedCount = await this.hardDeleteLeads(rows.map((r) => r.id));
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

    const [currentLead] = await db.select({ status: leads.status }).from(leads).where(idWhere).limit(1);
    if (!currentLead) throw new Error("Lead not found");
    if (currentLead.status === newStatus) return currentLead;

    // Capture disposition: a loss reason for lost/unqualified, a won timestamp for won.
    // Moving back to an open status clears the loss reason so stale reasons don't linger.
    const isLoss = newStatus === "lost" || newStatus === "unqualified";
    const patch: Record<string, unknown> = { status: newStatus, updatedAt: new Date() };
    if (isLoss) patch.lostReason = reason?.trim() || null;
    else patch.lostReason = null;
    if (newStatus === "won") patch.wonAt = new Date();

    const [updatedLead] = await db.update(leads).set(patch).where(idWhere).returning();

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

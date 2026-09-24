"use server";

import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users, leadSources, leadPipelineStages } from "@/db/schema";
import { requireOrg, hasPermission } from "@/lib/rbac";
import { LeadService } from "@/domains/leads/service";
import { CustomFieldService } from "@/domains/customFields/service";
import { CustomStatusSchemaService } from "@/domains/leads/customStatusSchemaService";
import { AuditService } from "@/domains/audit/service";
import { ok, fail, actionFail } from "@/lib/actions/result";
import { toCsv } from "@/lib/leads/csv";

const MAX_ROWS = 10_000;

const schema = z.object({
  search: z.string().optional(),
  status: z.string().optional(),
  owner: z.string().optional(),
  filters: z.string().optional(), // the URL's JSON filter group
  sort: z.string().optional(),
  order: z.enum(["asc", "desc"]).optional(),
  ids: z.array(z.guid()).max(MAX_ROWS).optional(), // ticked rows; omitted = everything matching
});

// Exports what the user is looking at: the ticked rows, or EVERY lead matching the current search /
// filters (not just the visible page). Same visibility as the leads list — reps get their own leads,
// admin-only custom fields only for admins. Values are formula-safe (see lib/leads/csv).
export async function exportLeadsCsvAction(input: z.input<typeof schema>) {
  const { userId, organizationId } = await requireOrg();
  const parsed = schema.safeParse(input);
  if (!parsed.success) return fail("VALIDATION", "Couldn't read the export options.");
  const q = parsed.data;
  let filters: unknown;
  try {
    filters = q.filters ? JSON.parse(q.filters) : undefined;
  } catch {
    filters = undefined;
  }

  try {
    const isAdmin = await hasPermission("settings.manage");
    const { data: rows, total } = await LeadService.listLeads({
      organizationId,
      search: q.search,
      status: q.status,
      ownerId: q.owner,
      filters: filters as never,
      sortField: q.sort || "createdAt",
      sortOrder: q.order || "desc",
      page: 1,
      limit: MAX_ROWS,
      currentUserId: userId,
      enforceOwnerId: isAdmin ? undefined : userId,
      ids: q.ids,
    });
    if (rows.length === 0) return fail("VALIDATION", "No leads to export.");

    const [statuses, defs, owners, sources, stages] = await Promise.all([
      CustomStatusSchemaService.getTenantStatusSchema(organizationId).catch(() => []),
      CustomFieldService.list(organizationId).catch(() => []),
      db.select({ id: users.id, firstName: users.firstName, lastName: users.lastName, email: users.email }).from(users).where(eq(users.organizationId, organizationId)),
      db.select({ id: leadSources.id, name: leadSources.name }).from(leadSources).where(eq(leadSources.organizationId, organizationId)),
      db.select({ id: leadPipelineStages.id, name: leadPipelineStages.name }).from(leadPipelineStages).where(eq(leadPipelineStages.organizationId, organizationId)),
    ]);
    const statusLabel = new Map(statuses.map((s) => [s.key, s.label]));
    const ownerName = new Map(owners.map((u) => [u.id, [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email]));
    const sourceName = new Map(sources.map((s) => [s.id, s.name]));
    const stageName = new Map(stages.map((s) => [s.id, s.name]));
    const fields = (defs as { key: string; label: string; adminOnly?: boolean; disabled?: boolean }[]).filter((f) => !f.disabled && (isAdmin || !f.adminOnly));

    const headers = ["Lead #", "Name", "Phone", "Email", "Company", "Status", "Stage", "Owner", "Source", "Score", "Expected value", "Created", "Last contacted", "Next follow-up", ...fields.map((f) => f.label)];
    const body = rows.map((l) => {
      const cd = (l.customData as Record<string, unknown> | null) ?? {};
      return [
        l.displayId ?? "",
        l.name,
        l.phone,
        l.email,
        l.company,
        statusLabel.get(l.status) ?? l.status,
        l.stageId ? stageName.get(l.stageId) ?? "" : "",
        l.ownerId ? ownerName.get(l.ownerId) ?? "" : "Unassigned",
        l.sourceId ? sourceName.get(l.sourceId) ?? "" : "",
        l.score ?? "",
        l.expectedValue ?? "",
        l.createdAt,
        l.lastContactedAt,
        l.nextFollowUpAt,
        ...fields.map((f) => {
          const v = cd[f.key];
          return Array.isArray(v) ? v.join("; ") : v == null ? "" : typeof v === "object" ? JSON.stringify(v) : v;
        }),
      ];
    });

    await AuditService.log({
      organizationId,
      userId,
      action: "lead.export",
      entityType: "lead",
      entityId: organizationId,
      metadata: { rows: rows.length, selected: q.ids?.length ?? null, truncated: total > MAX_ROWS },
    }).catch(() => {});

    return ok({ csv: toCsv(headers, body), count: rows.length, truncated: total > MAX_ROWS, total });
  } catch (e) {
    return actionFail(e);
  }
}

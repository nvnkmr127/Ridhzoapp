"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { parse } from "csv-parse/sync";
import { requirePermission, hasPermission } from "@/lib/rbac";
import { LeadImportService, getImportFields, type ImportRow } from "@/domains/leads/importService";
import { ok, fail, actionFail } from "@/lib/actions/result";

// The columns this org can import (fixed lead fields + active custom fields), for the wizard to
// list and offer as mapping targets. Admin-only custom fields are hidden from non-admin importers.
export async function listImportFieldsAction() {
  const { organizationId } = await requirePermission("leads.edit");
  const isAdmin = await hasPermission("settings.manage");
  return ok(await getImportFields(organizationId, isAdmin));
}

// Roughly the 1MB Server Action body limit — reject early with a clear message instead of
// letting the platform throw an opaque "Body exceeded limit" error.
const MAX_CSV_BYTES = 1_000_000;

// Parses raw CSV into headers + row objects (keyed by header). csv-parse handles quoting/escaping
// robustly — better than a hand-rolled client parser. Auto-suggests a field→header mapping.
export async function parseImportCsvAction(csvContent: string) {
  // Importing is a create operation — hold it to the same leads.edit gate as manual create.
  const { organizationId } = await requirePermission("leads.edit");
  const isAdmin = await hasPermission("settings.manage");

  if (!csvContent || !csvContent.trim()) {
    return fail("VALIDATION", "This file is empty. Please choose a CSV with at least a header row and one lead.");
  }
  if (csvContent.length > MAX_CSV_BYTES) {
    return fail("VALIDATION", "This file is too large (over ~1 MB). Split it into smaller batches and try again.");
  }

  let records: Record<string, string>[];
  try {
    records = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
    });
  } catch {
    return fail("VALIDATION", "We couldn't read this CSV. Make sure it's valid, comma-separated, and UTF-8 encoded.");
  }

  if (records.length === 0) {
    return fail("VALIDATION", "No rows found. The file needs a header row and at least one lead.");
  }

  const headers = Object.keys(records[0]);

  // Suggest a mapping: match each import field (fixed + custom) to a header by loose name equality.
  const fields = await getImportFields(organizationId, isAdmin);
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const mapping: Record<string, string> = {};
  for (const f of fields) {
    const hit = headers.find((h) => norm(h) === norm(f.key) || norm(h) === norm(f.label));
    if (hit) mapping[f.key] = hit;
  }

  return ok({ headers, rows: records.slice(0, 5000), mapping });
}

const rowSchema = z.object({
  name: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  company: z.string().optional(),
  status: z.string().optional(),
  expectedValue: z.string().optional(),
  // Custom-field values keyed by field key; validated against the org's defs server-side.
  customData: z.record(z.string(), z.any()).optional(),
});

const configSchema = z.object({
  sourceId: z.string().nullish(),
  ownerId: z.string().nullish(),
  fallbackStatus: z.string().optional(),
});

// Simulate (dry run): validate + detect duplicates, return what WOULD happen. No writes.
export async function simulateImportAction(input: { rows: ImportRow[] }) {
  const { organizationId } = await requirePermission("leads.edit");
  const isAdmin = await hasPermission("settings.manage");
  const parsed = z.array(rowSchema).max(5000).safeParse(input.rows);
  if (!parsed.success) {
    return fail("VALIDATION", "The imported rows are invalid or exceed the 5,000-row limit. Please re-check the file.");
  }
  try {
    return ok(await LeadImportService.analyze(organizationId, parsed.data, { isAdmin }));
  } catch (e) {
    return actionFail(e);
  }
}

// Commit: insert the valid, non-duplicate rows.
export async function commitImportAction(input: { rows: ImportRow[]; config: z.infer<typeof configSchema> }) {
  const { organizationId, userId } = await requirePermission("leads.edit");
  const isAdmin = await hasPermission("settings.manage");
  const parsedRows = z.array(rowSchema).max(5000).safeParse(input.rows);
  if (!parsedRows.success) {
    return fail("VALIDATION", "The imported rows are invalid or exceed the 5,000-row limit. Please re-check the file.");
  }
  const parsedConfig = configSchema.safeParse(input.config);
  if (!parsedConfig.success) {
    return fail("VALIDATION", "Import settings are invalid. Please reselect the source and owner and try again.");
  }
  try {
    const res = await LeadImportService.commit(organizationId, userId, parsedRows.data, parsedConfig.data, { isAdmin });
    revalidatePath('/');
    revalidatePath('/my-dashboard');
    revalidatePath("/leads");
    return ok(res);
  } catch (e) {
    return actionFail(e);
  }
}

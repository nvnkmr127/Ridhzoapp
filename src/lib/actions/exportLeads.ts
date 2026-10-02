"use server";

import { z } from "zod";
import { requireOrg, hasPermission, emailVerifiedError } from "@/lib/rbac";
import { fail } from "@/lib/actions/result";
import { exportLeadsCsvCore, exportSchema } from "@/lib/leads/exportCore";

// Exports what the user is looking at: the ticked rows, or EVERY lead matching the current search /
// filters (not just the visible page). The export itself lives in lib/leads/exportCore (shared with the
// mobile API); this wrapper only decides who may run it. Values are formula-safe (see lib/leads/csv).
export async function exportLeadsCsvAction(input: z.input<typeof exportSchema>) {
  const { userId, organizationId } = await requireOrg();
  { const gate = await emailVerifiedError(); if (gate) return fail("FORBIDDEN", gate); }
  // Taking the whole book of contacts out of the app is its own permission (members have it by default).
  if (!(await hasPermission("leads.export"))) return fail("FORBIDDEN", "You don't have permission to export leads. Ask an admin.");
  const parsed = exportSchema.safeParse(input);
  if (!parsed.success) return fail("VALIDATION", "Couldn't read the export options.");
  return exportLeadsCsvCore({ userId, organizationId, isAdmin: await hasPermission("settings.manage") }, parsed.data);
}

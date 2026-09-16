"use server";

import { requirePermission } from "@/lib/rbac";
import { AuditService } from "@/domains/audit/service";
import { ok, actionFail } from "@/lib/actions/result";

// Powers the "Load more" control on /settings/audit. Cursor-paginated so history beyond the
// first page is actually reachable, instead of the fixed 100-row window the page used to show.
export async function listAuditLogsPageAction(input: { cursor?: string | null; action?: string } = {}) {
  const { organizationId } = await requirePermission("audit.view");
  try {
    const page = await AuditService.list(organizationId, { cursor: input.cursor, action: input.action });
    return ok(page);
  } catch (e) {
    return actionFail(e);
  }
}

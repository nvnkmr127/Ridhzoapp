"use server";

import { requireOrg, requirePermission } from "@/lib/rbac";
import { LeadSourceService } from "@/domains/leads/sourceService";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ok, fail, actionFail } from "@/lib/actions/result";
import { sanitizeFields } from "@/lib/leads/formFields";
import { db } from "@/db";
import { webhookEvents } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";

/** After a Page reconnects, requeue the leads that failed during the token outage so nothing is
 *  permanently lost. Scoped to auth-failure events for that page. Best-effort. */
async function requeueAuthFailedEvents(pageId: string): Promise<number> {
  try {
    const rows = await db
      .select({ id: webhookEvents.id })
      .from(webhookEvents)
      .where(
        and(
          eq(webhookEvents.provider, "facebook"),
          eq(webhookEvents.status, "failed"),
          sql`${webhookEvents.payload}->>'page_id' = ${pageId}`,
          sql`${webhookEvents.errorLog}->>'reason' = 'auth_error_needs_reconnect'`,
        ),
      );
    if (rows.length === 0) return 0;
    const { ingestionQueue } = await import("@/lib/jobs/workers/ingestionWorker");
    for (const r of rows) {
      await db.update(webhookEvents).set({ status: "pending", errorLog: null }).where(eq(webhookEvents.id, r.id));
      await ingestionQueue.add(`ingest-fb-replay-${r.id}`, { webhookEventId: r.id, provider: "facebook" });
    }
    return rows.length;
  } catch (e) {
    console.error("[sources] requeueAuthFailedEvents failed (non-fatal)", e);
    return 0;
  }
}

export async function listSourcesAction() {
  const { organizationId } = await requireOrg();
  return LeadSourceService.getSources(organizationId);
}

const createSchema = z.object({
  name: z.string().min(1).max(255),
  // Must match a provider the ingestion worker knows how to normalize.
  type: z.enum(["generic_webhook", "facebook_lead_ads", "webform", "google_lead_ads"]),
});

export async function createSourceAction(input: z.infer<typeof createSchema>) {
  const { organizationId } = await requirePermission("sources.manage");
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return fail("VALIDATION", "Please enter a name and choose a valid source type.");
  try {
    const row = await LeadSourceService.createSource({ ...parsed.data, organizationId });
    revalidatePath("/settings/sources");
    return ok(row);
  } catch (e) {
    return actionFail(e);
  }
}

export async function updateSourceFormAction(id: string, fields: unknown) {
  const { organizationId } = await requirePermission("sources.manage");
  const source = await LeadSourceService.getSource(id);
  if (!source || source.organizationId !== organizationId) return fail("NOT_FOUND", "This form no longer exists.");
  try {
    const clean = sanitizeFields(fields);
    const config = { ...((source.config as Record<string, unknown>) ?? {}), formFields: clean };
    await LeadSourceService.updateSource(id, { config }, organizationId);
    revalidatePath("/settings/sources");
    return ok({ fields: clean });
  } catch (e) {
    return actionFail(e);
  }
}

export async function toggleSourceAction(id: string, isActive: boolean) {
  const { organizationId } = await requirePermission("sources.manage");
  try {
    await LeadSourceService.updateSource(id, { isActive: isActive ? 1 : 0 }, organizationId);
    revalidatePath("/settings/sources");
    return ok({ id, isActive });
  } catch (e) {
    return actionFail(e);
  }
}

export async function renameSourceAction(id: string, name: string) {
  const { organizationId } = await requirePermission("sources.manage");
  const parsed = z.string().min(1).max(255).safeParse(name);
  if (!parsed.success) return fail("VALIDATION", "Please enter a source name.");
  try {
    const row = await LeadSourceService.updateSource(id, { name: parsed.data }, organizationId);
    revalidatePath("/settings/sources");
    return ok(row);
  } catch (e) {
    return actionFail(e);
  }
}

export async function deleteSourceAction(id: string) {
  const { organizationId } = await requirePermission("sources.manage");
  try {
    const res = await LeadSourceService.deleteSource(id, organizationId);
    revalidatePath("/settings/sources");
    return ok(res);
  } catch (e) {
    return actionFail(e);
  }
}

const facebookPageIdsSchema = z.array(z.string().min(1)).min(1);

/**
 * Connects the Pages the user selected. Page access tokens are NOT accepted from the client — they
 * were stashed server-side during OAuth (keyed to this user) and are read back here by pageId.
 */
export async function connectFacebookPagesAction(pageIds: z.infer<typeof facebookPageIdsSchema>) {
  const { organizationId, userId } = await requirePermission("sources.manage");
  const parsed = facebookPageIdsSchema.safeParse(pageIds);
  if (!parsed.success) return fail("VALIDATION", "Please select at least one Facebook Page.");

  try {
    const { takePendingPages } = await import("@/lib/leads/fbPendingStore");
    const pending = await takePendingPages(userId);
    if (!pending) return fail("VALIDATION", "Your Facebook connection session expired. Please reconnect and try again.");

    const chosen = pending.pages.filter((p) => parsed.data.includes(p.pageId));
    if (chosen.length === 0) return fail("VALIDATION", "The selected Pages weren't found. Please reconnect and try again.");

    const expiresAt = pending.expiresAt ? new Date(pending.expiresAt) : null;
    const connected = [];
    let replayed = 0;
    for (const p of chosen) {
      const source = await LeadSourceService.upsertFacebookPageSource(organizationId, {
        pageId: p.pageId,
        name: p.name,
        pageAccessToken: p.pageAccessToken,
        expiresAt,
      });
      connected.push(source);
      // Recover any leads that failed while this Page's token was dead.
      replayed += await requeueAuthFailedEvents(p.pageId);
    }
    revalidatePath("/settings/sources");
    return ok({ connected, replayed });
  } catch (e) {
    return actionFail(e);
  }
}

const formFilterSchema = z.object({
  sourceId: z.string().uuid(),
  formFilter: z.array(z.string()).optional(),
  // id → name, so the source card can show which forms are selected without a Graph round-trip.
  formNames: z.record(z.string(), z.string()).optional(),
});

/** Saves the whitelist of Facebook lead-form IDs this source should capture. Empty = all forms. */
export async function updateSourceFormFilterAction(input: z.infer<typeof formFilterSchema>) {
  const { organizationId } = await requirePermission("sources.manage");
  const parsed = formFilterSchema.safeParse(input);
  if (!parsed.success) return fail("VALIDATION", "Invalid filter data");

  try {
    const source = await LeadSourceService.getSource(parsed.data.sourceId);
    if (!source || source.organizationId !== organizationId) {
      return fail("NOT_FOUND", "Source not found");
    }

    const currentConfig = (source.config as Record<string, unknown>) ?? {};
    const newConfig = {
      ...currentConfig,
      formFilter: parsed.data.formFilter || [],
      formFilterNames: parsed.data.formNames || {},
    };

    const updated = await LeadSourceService.updateSource(source.id, { config: newConfig }, organizationId);
    revalidatePath("/settings/sources");
    return ok(updated);
  } catch (e) {
    return actionFail(e);
  }
}

/** Lists the live lead forms on a connected Facebook Page so the user can pick which to capture. */
export async function listFacebookFormsAction(sourceId: string) {
  const { organizationId } = await requirePermission("sources.manage");
  try {
    const source = await LeadSourceService.getSource(sourceId);
    if (!source || source.organizationId !== organizationId) return fail("NOT_FOUND", "Source not found");
    if (source.type !== "facebook_lead_ads") return fail("VALIDATION", "Not a Facebook Lead Ads source.");

    const config = (source.config as Record<string, any>) ?? {};
    if (!config.pageId || !config.pageAccessToken) {
      return fail("VALIDATION", "Missing Facebook Page ID or Access Token in source configuration.");
    }

    const { MetaTokenRefreshService } = await import("@/domains/leads/metaTokenRefreshService");
    const forms = await MetaTokenRefreshService.listPageLeadForms(config.pageId, config.pageAccessToken);
    return ok({ forms });
  } catch (e) {
    if (await flagIfAuthError(e, sourceId)) {
      return fail("VALIDATION", "Facebook access for this Page has expired. Please reconnect the Page, then try again.");
    }
    return actionFail(e);
  }
}

/** If the error is a dead-token error, mark the source as needing reconnect. Returns whether it was. */
async function flagIfAuthError(e: unknown, sourceId: string): Promise<boolean> {
  const { MetaTokenRefreshService } = await import("@/domains/leads/metaTokenRefreshService");
  if (!MetaTokenRefreshService.isAuthError(e)) return false;
  await LeadSourceService.markNeedsReconnect(sourceId);
  return true;
}

const syncRangeSchema = z
  .object({ since: z.number().int().positive().optional(), until: z.number().int().positive().optional() })
  .optional();

export async function syncPastFacebookLeadsAction(sourceId: string, range?: { since?: number; until?: number }) {
  const { organizationId } = await requirePermission("sources.manage");
  const parsedRange = syncRangeSchema.safeParse(range);
  if (!parsedRange.success) return fail("VALIDATION", "Invalid date range.");
  const window = parsedRange.data ?? {};
  try {
    const source = await LeadSourceService.getSource(sourceId);
    if (!source || source.organizationId !== organizationId) {
      return fail("NOT_FOUND", "Source not found");
    }
    if (source.type !== "facebook_lead_ads") {
      return fail("VALIDATION", "Past lead sync is only supported for Facebook Lead Ads.");
    }
    const config = (source.config as Record<string, any>) ?? {};
    if (!config.pageId || !config.pageAccessToken) {
      return fail("VALIDATION", "Missing Facebook Page ID or Access Token in source configuration.");
    }

    const { redisConfigured } = await import("@/lib/jobs/redis");

    // Prod: run in the background so a high-volume Page can't time out the request. The worker writes
    // progress/result onto the source config (syncStatus + lastSync), shown on the sources page.
    if (redisConfigured()) {
      const { facebookSyncQueue } = await import("@/lib/jobs/workers/facebookSyncWorker");
      const newConfig = { ...config, syncStatus: "running", syncStartedAt: new Date().toISOString() };
      await LeadSourceService.updateSource(source.id, { config: newConfig }, organizationId);
      await facebookSyncQueue.add(`fb-sync-${source.id}`, {
        sourceId: source.id,
        organizationId,
        since: window.since,
        until: window.until,
      });
      revalidatePath("/settings/sources");
      return ok({ queued: true });
    }

    // Dev fallback (no Redis): run inline and return counts directly.
    const { FacebookSyncService } = await import("@/domains/leads/facebookSyncService");
    const result = await FacebookSyncService.run(source.id, organizationId, window);
    revalidatePath("/leads");
    revalidatePath("/settings/sources");
    return ok(result);
  } catch (e) {
    if (await flagIfAuthError(e, sourceId)) {
      return fail("VALIDATION", "Facebook access for this Page has expired. Please reconnect the Page, then sync again.");
    }
    return actionFail(e);
  }
}

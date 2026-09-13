"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/rbac";
import { TenantIntegrationsService } from "@/domains/organizations/tenantIntegrationsService";
import { ok, fail, actionFail, zodFieldErrors } from "@/lib/actions/result";

export async function getTenantIntegrationsAction() {
  const { organizationId } = await requirePermission("settings.manage");
  return TenantIntegrationsService.getView(organizationId);
}

const enrichmentSchema = z.object({
  apiUrl: z.string().trim().url("Enter a valid https URL").optional().or(z.literal("")),
  authHeader: z.string().trim().max(100).optional().or(z.literal("")),
  authValue: z.string().max(1024).optional(), // blank = keep existing
  timeoutMs: z.coerce.number().int().min(1000).max(60000).optional(),
  enabled: z.boolean().optional(),
});

export async function updateEnrichmentAction(input: z.infer<typeof enrichmentSchema>) {
  const { organizationId } = await requirePermission("settings.manage");
  const parsed = enrichmentSchema.safeParse(input);
  if (!parsed.success) return fail("VALIDATION", "Please check the highlighted fields.", zodFieldErrors(parsed.error));
  const d = parsed.data;

  // Turning it on requires a complete config.
  if (d.enabled) {
    const existing = await TenantIntegrationsService.getView(organizationId);
    const willHaveValue = (d.authValue && d.authValue.length > 0) || existing.hasEnrichmentAuthValue;
    const willHaveUrl = (d.apiUrl && d.apiUrl.length > 0) || existing.enrichmentApiUrl;
    if (!willHaveUrl || !willHaveValue) {
      return fail("VALIDATION", "To enable enrichment, provide the provider URL and auth header value.");
    }
  }

  try {
    const view = await TenantIntegrationsService.upsertEnrichment(organizationId, {
      apiUrl: d.apiUrl || null,
      authHeader: d.authHeader || null,
      authValue: d.authValue,
      timeoutMs: d.timeoutMs ?? null,
      enabled: d.enabled,
    });
    revalidatePath("/settings/lead-intelligence");
    return ok(view);
  } catch (e) {
    return actionFail(e);
  }
}

const capiSchema = z.object({
  pixelId: z.string().trim().max(64).optional().or(z.literal("")),
  accessToken: z.string().max(1024).optional(), // blank = keep existing
  testEventCode: z.string().trim().max(64).optional().or(z.literal("")),
  enabled: z.boolean().optional(),
});

export async function updateCapiAction(input: z.infer<typeof capiSchema>) {
  const { organizationId } = await requirePermission("settings.manage");
  const parsed = capiSchema.safeParse(input);
  if (!parsed.success) return fail("VALIDATION", "Please check the highlighted fields.", zodFieldErrors(parsed.error));
  const d = parsed.data;

  if (d.enabled) {
    const existing = await TenantIntegrationsService.getView(organizationId);
    const willHaveToken = (d.accessToken && d.accessToken.length > 0) || existing.hasCapiAccessToken;
    const willHavePixel = (d.pixelId && d.pixelId.length > 0) || existing.capiPixelId;
    if (!willHavePixel || !willHaveToken) {
      return fail("VALIDATION", "To enable Meta CAPI, provide the Pixel/Dataset ID and access token.");
    }
  }

  try {
    const view = await TenantIntegrationsService.upsertCapi(organizationId, {
      pixelId: d.pixelId || null,
      accessToken: d.accessToken,
      testEventCode: d.testEventCode || null,
      enabled: d.enabled,
    });
    revalidatePath("/settings/lead-intelligence");
    return ok(view);
  } catch (e) {
    return actionFail(e);
  }
}

const stageMapSchema = z.record(z.string(), z.string());

/** Save the tenant's Conversion Leads status → Meta stage-event map. Empty resets to the default. */
export async function updateCapiStageMapAction(map: Record<string, string>) {
  const { organizationId } = await requirePermission("settings.manage");
  const parsed = stageMapSchema.safeParse(map);
  if (!parsed.success) return fail("VALIDATION", "Invalid stage mapping.");
  try {
    const view = await TenantIntegrationsService.upsertCapiStageMap(organizationId, parsed.data);
    revalidatePath("/settings/lead-intelligence");
    return ok(view);
  } catch (e) {
    return actionFail(e);
  }
}

export async function sendTestCapiEventAction() {
  const { organizationId } = await requirePermission("settings.manage");
  const { MetaCapiService } = await import("@/domains/leads/metaCapiService");
  const res = await MetaCapiService.sendTest(organizationId);
  if (!res.ok) return fail("SERVER", res.error || "Test event failed.");
  return ok({ sent: true });
}

export async function setInboundEmailAction(enabled: boolean) {
  const { organizationId } = await requirePermission("settings.manage");
  try {
    const view = await TenantIntegrationsService.setInboundEmail(organizationId, Boolean(enabled));
    revalidatePath("/settings/lead-intelligence");
    return ok(view);
  } catch (e) {
    return actionFail(e);
  }
}

export async function rotateInboundTokenAction() {
  const { organizationId } = await requirePermission("settings.manage");
  try {
    const view = await TenantIntegrationsService.rotateInboundToken(organizationId);
    revalidatePath("/settings/lead-intelligence");
    return ok(view);
  } catch (e) {
    return actionFail(e);
  }
}

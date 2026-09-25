"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/rbac";
import { TenantIntegrationsService, DEFAULT_AUTH_HEADER } from "@/domains/organizations/tenantIntegrationsService";
import { ok, fail, actionFail, zodFieldErrors } from "@/lib/actions/result";

const PAGE = "/settings/lead-intelligence";

export async function getTenantIntegrationsAction() {
  const { organizationId } = await requirePermission("settings.manage");
  return TenantIntegrationsService.getView(organizationId);
}

// Every visible field is sent on save; "" clears it. Secrets: blank keeps the stored value.
const enrichmentSchema = z.object({
  apiUrl: z
    .string()
    .trim()
    .max(500)
    .refine((v) => v === "" || /^https:\/\/[^\s]+$/i.test(v), "Enter an https:// URL"),
  // RFC 7230 token, so fetch doesn't reject it at request time (which would fail silently).
  authHeader: z
    .string()
    .trim()
    .max(100)
    .refine((v) => v === "" || /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(v), "Header names can't contain spaces or symbols like : or @"),
  authValue: z.string().max(1024).optional(),
  enabled: z.boolean(),
});

async function publicUrlError(url: string): Promise<string | null> {
  if (!url) return null;
  try {
    const { assertPublicHttpUrl } = await import("@/lib/webhooks/ssrf");
    await assertPublicHttpUrl(url);
    return null;
  } catch (e) {
    return e instanceof Error ? e.message.replace("Webhook", "Provider") : "Invalid URL";
  }
}

export async function updateEnrichmentAction(input: z.input<typeof enrichmentSchema>) {
  const { organizationId } = await requirePermission("settings.manage");
  const parsed = enrichmentSchema.safeParse(input);
  if (!parsed.success) return fail("VALIDATION", "Please fix the highlighted fields.", zodFieldErrors(parsed.error));
  const d = parsed.data;
  const urlError = await publicUrlError(d.apiUrl);
  if (urlError) return fail("VALIDATION", "Please fix the highlighted fields.", { apiUrl: urlError });

  try {
    const view = await TenantIntegrationsService.upsertEnrichment(organizationId, {
      enabled: d.enabled,
      apiUrl: d.apiUrl || null,
      authHeader: d.authHeader || null,
      authValue: d.authValue || undefined,
    });
    revalidatePath(PAGE);
    return ok(view);
  } catch (e) {
    return actionFail(e);
  }
}

/** Look up a sample lead with the form's (possibly unsaved) provider settings. */
export async function testEnrichmentAction(input: z.input<typeof enrichmentSchema> & { sampleEmail: string }) {
  const { organizationId } = await requirePermission("settings.manage");
  const parsed = enrichmentSchema.safeParse(input);
  if (!parsed.success) return fail("VALIDATION", "Please fix the highlighted fields.", zodFieldErrors(parsed.error));
  const d = parsed.data;
  if (!d.apiUrl) return fail("VALIDATION", "Enter the provider URL first.", { apiUrl: "Required" });
  const sampleEmail = z.string().trim().email().safeParse(input.sampleEmail);
  if (!sampleEmail.success) return fail("VALIDATION", "Enter an email address to look up.", { sampleEmail: "Enter a valid email" });

  const authValue = d.authValue || (await TenantIntegrationsService.getSavedSecrets(organizationId)).enrichmentAuthValue;
  if (!authValue) return fail("VALIDATION", "Enter the API key first.", { authValue: "Required" });

  const { callProvider } = await import("@/domains/leads/enrichmentService");
  const res = await callProvider(
    { email: sampleEmail.data },
    { url: d.apiUrl, authHeader: d.authHeader || DEFAULT_AUTH_HEADER, authValue, timeoutMs: 10_000 },
  );
  if (!res.ok) {
    // "no match" still proves the connection + auth work.
    if (res.reason === "no match") return ok({ fields: [] as string[] });
    return fail("SERVER", `Test failed: ${res.reason}.`);
  }
  return ok({ fields: Object.keys(res.result.attributes) });
}

export async function disconnectEnrichmentAction() {
  const { organizationId } = await requirePermission("settings.manage");
  try {
    const view = await TenantIntegrationsService.clearEnrichment(organizationId);
    revalidatePath(PAGE);
    return ok(view);
  } catch (e) {
    return actionFail(e);
  }
}

const capiSchema = z.object({
  pixelId: z
    .string()
    .trim()
    .max(64)
    .refine((v) => v === "" || /^\d+$/.test(v), "The Pixel/Dataset ID is numbers only"),
  accessToken: z.string().trim().max(1024).optional(),
  testEventCode: z.string().trim().max(64),
  enabled: z.boolean(),
});

export async function updateCapiAction(input: z.input<typeof capiSchema>) {
  const { organizationId } = await requirePermission("settings.manage");
  const parsed = capiSchema.safeParse(input);
  if (!parsed.success) return fail("VALIDATION", "Please fix the highlighted fields.", zodFieldErrors(parsed.error));
  const d = parsed.data;
  try {
    const view = await TenantIntegrationsService.upsertCapi(organizationId, {
      enabled: d.enabled,
      pixelId: d.pixelId || null,
      accessToken: d.accessToken || undefined,
      testEventCode: d.testEventCode || null,
    });
    revalidatePath(PAGE);
    return ok(view);
  } catch (e) {
    return actionFail(e);
  }
}

export async function disconnectCapiAction() {
  const { organizationId } = await requirePermission("settings.manage");
  try {
    const view = await TenantIntegrationsService.clearCapi(organizationId);
    revalidatePath(PAGE);
    return ok(view);
  } catch (e) {
    return actionFail(e);
  }
}

const stageMapSchema = z.record(z.string().max(64), z.string().max(100));

/** Save the tenant's Conversion Leads status → Meta stage-event map. Empty = report no stages. */
export async function updateCapiStageMapAction(map: Record<string, string>) {
  const { organizationId } = await requirePermission("settings.manage");
  const parsed = stageMapSchema.safeParse(map);
  if (!parsed.success) return fail("VALIDATION", "Invalid stage mapping.");
  try {
    const view = await TenantIntegrationsService.upsertCapiStageMap(organizationId, parsed.data);
    revalidatePath(PAGE);
    return ok(view);
  } catch (e) {
    return actionFail(e);
  }
}

/** Send a sample Lead event with the form's (possibly unsaved) values to Meta's Test Events tab. */
export async function sendTestCapiEventAction(input: z.input<typeof capiSchema>) {
  const { organizationId } = await requirePermission("settings.manage");
  const parsed = capiSchema.safeParse(input);
  if (!parsed.success) return fail("VALIDATION", "Please fix the highlighted fields.", zodFieldErrors(parsed.error));
  const d = parsed.data;
  const { MetaCapiService } = await import("@/domains/leads/metaCapiService");
  const res = await MetaCapiService.sendTest(organizationId, {
    pixelId: d.pixelId || null,
    accessToken: d.accessToken || undefined,
    testEventCode: d.testEventCode || null,
  });
  if (!res.ok) return fail("SERVER", res.error || "Test event failed.");
  return ok({ sent: true });
}

export async function setInboundEmailAction(enabled: boolean) {
  const { organizationId } = await requirePermission("settings.manage");
  try {
    const view = await TenantIntegrationsService.setInboundEmail(organizationId, Boolean(enabled));
    revalidatePath(PAGE);
    return ok(view);
  } catch (e) {
    return actionFail(e);
  }
}

export async function rotateInboundTokenAction() {
  const { organizationId } = await requirePermission("settings.manage");
  try {
    const view = await TenantIntegrationsService.rotateInboundToken(organizationId);
    revalidatePath(PAGE);
    return ok(view);
  } catch (e) {
    return actionFail(e);
  }
}

"use server";

import { requirePermission } from "@/lib/rbac";
import { WebhookEndpointService, WEBHOOK_EVENT_TYPES } from "@/domains/integrations/webhookEndpointService";
import { WebhookDlqService } from "@/domains/leads/webhookDlqService";
import { RateLimiter } from "@/lib/rate-limit";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ok, fail, actionFail } from "@/lib/actions/result";

const createSchema = z.object({
  url: z.string().url("Enter a valid URL (https://…)").max(2048),
  events: z.array(z.enum(WEBHOOK_EVENT_TYPES)).min(1, "Select at least one event"),
});

export async function listWebhookEndpointsAction() {
  const { organizationId } = await requirePermission("api.manage");
  return WebhookEndpointService.list(organizationId);
}

export async function createWebhookEndpointAction(input: { url: string; events: string[] }) {
  const { organizationId } = await requirePermission("api.manage");
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    return fail("VALIDATION", parsed.error.issues[0]?.message ?? "Please provide a valid URL and at least one event.");
  }
  try {
    const row = await WebhookEndpointService.create(organizationId, parsed.data.url, parsed.data.events);
    revalidatePath("/settings/webhooks");
    return ok(row);
  } catch (e) {
    return actionFail(e);
  }
}

export async function toggleWebhookEndpointAction(id: string, isActive: boolean) {
  const { organizationId } = await requirePermission("api.manage");
  try {
    const row = await WebhookEndpointService.setActive(organizationId, id, isActive);
    if (!row) return fail("NOT_FOUND", "This webhook no longer exists.");
    revalidatePath("/settings/webhooks");
    return ok(row);
  } catch (e) {
    return actionFail(e);
  }
}

export async function deleteWebhookEndpointAction(id: string) {
  const { organizationId } = await requirePermission("api.manage");
  try {
    await WebhookEndpointService.remove(organizationId, id);
    revalidatePath("/settings/webhooks");
    return ok({ deleted: true });
  } catch (e) {
    return actionFail(e);
  }
}

export async function revealWebhookSecretAction(id: string) {
  const { organizationId } = await requirePermission("api.manage");
  try {
    const secret = await WebhookEndpointService.revealSecret(organizationId, id);
    if (!secret) return fail("NOT_FOUND", "This webhook no longer exists.");
    return ok({ secret });
  } catch (e) {
    return actionFail(e);
  }
}

export async function testWebhookEndpointAction(id: string) {
  const { organizationId } = await requirePermission("api.manage");
  // Test triggers an outbound request the caller controls — throttle it (SSRF/abuse amplification).
  const limit = await RateLimiter.checkLimit(`webhook-test:${organizationId}`, 10, 60);
  if (!limit.success) return fail("RATE_LIMIT", "Too many test deliveries. Please wait a minute and try again.");
  try {
    const res = await WebhookEndpointService.test(organizationId, id);
    if (!res.success) {
      return fail("SERVER", res.error ?? `Test delivery failed (HTTP ${res.statusCode}).`);
    }
    return ok({ statusCode: res.statusCode });
  } catch (e) {
    return actionFail(e);
  }
}

export async function listWebhookDlqAction() {
  const { organizationId } = await requirePermission("api.manage");
  return WebhookDlqService.getFailedDlqJobs(organizationId);
}

export async function retryWebhookDlqAction(deliveryId: string) {
  const { organizationId } = await requirePermission("api.manage");
  try {
    const res = await WebhookDlqService.retryDlqJob(deliveryId, organizationId);
    revalidatePath("/settings/webhooks");
    return ok(res);
  } catch (e) {
    return actionFail(e);
  }
}

export async function purgeWebhookDlqAction(deliveryId: string) {
  const { organizationId } = await requirePermission("api.manage");
  try {
    const res = await WebhookDlqService.purgeDlqJob(deliveryId, organizationId);
    revalidatePath("/settings/webhooks");
    return ok(res);
  } catch (e) {
    return actionFail(e);
  }
}

"use server";

import { headers } from "next/headers";
import { db } from "@/db";
import { webhookEvents } from "@/db/schema";
import { eq } from "drizzle-orm";
import { LeadSourceService } from "@/domains/leads/sourceService";
import { RateLimiter } from "@/lib/rate-limit";
import { ok, fail, actionFail } from "@/lib/actions/result";
import { resolveFormFields, buildSubmission } from "@/lib/leads/formFields";

// Public (no auth) lead capture from a hosted web form. The sourceId in the URL is the only
// "credential"; it only lets a visitor create a lead. Fields are whatever the tenant configured
// for this source — validated server-side against that saved schema, never the client's claim.
// Rate-limited per source+IP.
export async function submitPublicLeadAction(sourceId: string, input: Record<string, string>) {
  const source = await LeadSourceService.getSource(sourceId);
  if (!source || !source.isActive || !source.organizationId) {
    return fail("NOT_FOUND", "This form is no longer active.");
  }

  const fields = resolveFormFields(source.config);
  const built = buildSubmission(fields, input ?? {});
  if (!built.ok) return fail("VALIDATION", built.error);

  const ip = (await headers()).get("x-forwarded-for") || "unknown";
  const limit = await RateLimiter.checkLimit(`public-form:${sourceId}:${ip}`, 10, 60);
  if (!limit.success) {
    return fail("RATE_LIMIT", "Too many submissions. Please wait a moment and try again.");
  }

  const payload = { ...built.values, sourceId, organizationId: source.organizationId, source: source.name };

  try {
    const [event] = await db
      .insert(webhookEvents)
      .values({ provider: "generic_webhook", payload })
      .returning({ id: webhookEvents.id });

    // Process inline — a hosted form must not hang on a down/unreachable Redis worker. Best-effort:
    // the event row persists regardless, and processing errors don't block the visitor's success.
    try {
      const { GenericWebhookAdapter } = await import("@/lib/integrations/adapters/GenericWebhookAdapter");
      const { IngestionService } = await import("@/lib/leads/ingestion");
      const normalized = await new GenericWebhookAdapter().normalize(payload, sourceId);
      normalized.organizationId = source.organizationId;
      await IngestionService.processLead(normalized);
      await db.update(webhookEvents).set({ status: "processed", processedAt: new Date() }).where(eq(webhookEvents.id, event.id));
    } catch (procErr) {
      console.error("[publicLead] inline processing failed (event recorded)", procErr);
    }

    return ok({ submitted: true });
  } catch (e) {
    return actionFail(e);
  }
}

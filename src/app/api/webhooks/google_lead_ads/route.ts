import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { LeadSourceService } from "@/domains/leads/sourceService";
import { IngestionService } from "@/lib/leads/ingestion";
import { applySourceFieldMappings } from "@/lib/leads/sourceFieldMapping";
import { readSecret } from "@/lib/crypto/secret";
import { RateLimiter } from "@/lib/rate-limit";
import { db } from "@/db";
import { webhookEvents } from "@/db/schema";
import { and, eq } from "drizzle-orm";

// Google Ads Lead Form webhook receiver.
// In Google Ads → Lead form → "Deliver leads", set:
//   Webhook URL:  https://<domain>/api/webhooks/google_lead_ads?sourceId=<this source's id>
//   Key:          this source's signing secret (shown in the sources list)
// Google POSTs { lead_id, user_column_data:[{column_id,string_value}], google_key, is_test, ... }.
// Ingest synchronously here (no Redis/worker dependency). Each delivery is recorded in webhook_events
// (PII-free: ids only) keyed by Google's lead_id, so a retried delivery is a no-op and failures
// show up on the source card via LeadSourceService.recentFailures.

// Google's lead field column ids → our normalized fields.
function mapColumns(userColumnData: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (Array.isArray(userColumnData)) {
    for (const c of userColumnData) {
      const id = (c as any)?.column_id;
      if (id) out[String(id).toUpperCase()] = String((c as any)?.string_value ?? "");
    }
  }
  return out;
}

// Google's built-in contact columns; everything else is a custom question and is offered for
// mapping to a custom field, so these contact columns don't leak into customData.
const STANDARD_GOOGLE_COLS = new Set([
  "FULL_NAME", "FIRST_NAME", "LAST_NAME", "EMAIL", "USER_EMAIL", "PHONE_NUMBER", "USER_PHONE", "COMPANY_NAME",
]);
const MAX_BODY_BYTES = 256 * 1024;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
  const sourceId = req.nextUrl.searchParams.get("sourceId");
  if (!sourceId) return NextResponse.json({ error: "Missing sourceId" }, { status: 400 });
  // Reject a malformed id before it hits the DB (a uuid cast error would otherwise 500).
  if (!UUID_RE.test(sourceId)) return NextResponse.json({ error: "Invalid sourceId" }, { status: 400 });

  const ip = req.headers.get("x-forwarded-for") || "unknown";
  const limit = await RateLimiter.checkLimit(`webhook:google_lead_ads:${sourceId}:${ip}`, 100, 60);
  if (!limit.success) return NextResponse.json({ error: "Too Many Requests" }, { status: 429 });

  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  let body: any = null;
  try { body = JSON.parse(raw); } catch {}
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });

  const source = await LeadSourceService.getSource(sourceId);
  if (!source || !source.isActive || !source.organizationId || source.type !== "google_lead_ads") {
    return NextResponse.json({ error: "Invalid or inactive Google source" }, { status: 403 });
  }

  // Google echoes the key you configured as `google_key` — validate it against the source secret.
  // Fail closed: a source with no secret accepts nothing.
  const key = String(body.google_key ?? "");
  const secret = readSecret(source.webhookSecret);
  if (!secret || !(key.length === secret.length && timingSafeEqual(Buffer.from(key), Buffer.from(secret)))) {
    return NextResponse.json({ error: "Invalid key" }, { status: 401 });
  }

  // Google sends a test ping when you save the webhook — acknowledge 200 without creating a lead,
  // and remember it so the card can show "Test received".
  if (body.is_test) {
    await LeadSourceService.updateSource(sourceId, { configPatch: { lastTestAt: new Date().toISOString() } }, source.organizationId).catch(() => {});
    return NextResponse.json({ status: "test_ok" }, { status: 200 });
  }

  // Record the delivery. Same lead_id twice = Google retry: skip if already processed, redo if it failed.
  const googleLeadId = body.lead_id ? String(body.lead_id) : undefined;
  const idempotencyKey = googleLeadId ? `${sourceId}:${googleLeadId}` : undefined;
  const meta = { sourceId, organizationId: source.organizationId, lead_id: googleLeadId, form_id: body.form_id, campaign_id: body.campaign_id };
  let eventId: string | undefined;
  try {
    const [ev] = await db.insert(webhookEvents)
      .values({ provider: "google_lead_ads", payload: meta, idempotencyKey, status: "processing" })
      .onConflictDoNothing({ target: [webhookEvents.provider, webhookEvents.idempotencyKey] })
      .returning({ id: webhookEvents.id });
    eventId = ev?.id;
    if (!ev && idempotencyKey) {
      const [prev] = await db.select({ id: webhookEvents.id, status: webhookEvents.status }).from(webhookEvents)
        .where(and(eq(webhookEvents.provider, "google_lead_ads"), eq(webhookEvents.idempotencyKey, idempotencyKey))).limit(1);
      if (prev?.status === "processed") return NextResponse.json({ status: "duplicate" }, { status: 200 });
      eventId = prev?.id;
    }
  } catch (e) {
    console.error("[GOOGLE_LEADFORM_WEBHOOK] event log failed (continuing)", e);
  }
  const settle = async (status: "processed" | "failed", reason?: string) => {
    if (!eventId) return;
    await db.update(webhookEvents)
      .set({ status, processedAt: new Date(), errorLog: reason ? { reason } : null })
      .where(eq(webhookEvents.id, eventId)).catch(() => {});
  };

  const cols = mapColumns(body.user_column_data);
  const extraCols = Object.fromEntries(Object.entries(cols).filter(([k]) => !STANDARD_GOOGLE_COLS.has(k)));

  // Apply the source's saved field mappings to the custom questions (question → custom field / lead
  // field). Unmapped questions land in customData under their raw column id — flat (not nested), so
  // ingestion coerces any whose key matches an org custom field, same as Facebook/web-form leads.
  const rules = Array.isArray((source.config as any)?.fieldMappings) ? (source.config as any).fieldMappings : [];
  const applied = applySourceFieldMappings(extraCols, rules);

  const name = applied.name || cols.FULL_NAME || [cols.FIRST_NAME, cols.LAST_NAME].filter(Boolean).join(" ").trim() || "Google Lead";
  const email = applied.email || cols.EMAIL || cols.USER_EMAIL || undefined;
  const phone = applied.phone || cols.PHONE_NUMBER || cols.USER_PHONE || undefined;
  if (!email && !phone) {
    await settle("failed", "no_contact");
    return NextResponse.json({ error: "Lead has no email or phone to dedupe on" }, { status: 422 });
  }

  try {
    const result = await IngestionService.processLead({
      name,
      email,
      phone,
      company: applied.company || cols.COMPANY_NAME || undefined,
      sourceId,
      organizationId: source.organizationId,
      externalId: googleLeadId,
      expectedValue: applied.expectedValue,
      customData: {
        formId: body.form_id,
        campaignId: body.campaign_id,
        gclId: body.gcl_id,
        ...(googleLeadId ? { googleLeadId } : {}),
        ...applied.customData,
      },
    });
    // A repeat inquiry merges into the existing lead silently — leave a note so the rep sees it.
    if (result.status === "deduplicated") {
      try {
        const { ActivityService } = await import("@/domains/activities/service");
        await ActivityService.addActivity({ leadId: result.leadId, type: "note", content: "Submitted a Google lead form again." });
      } catch (e) {
        console.error("[GOOGLE_LEADFORM_WEBHOOK] repeat-note failed (non-fatal)", e);
      }
    }
    await settle("processed");
    return NextResponse.json({ status: result.status, leadId: result.leadId }, { status: 200 });
  } catch (e: any) {
    console.error("[GOOGLE_LEADFORM_WEBHOOK]", e);
    await settle("failed", String(e?.message ?? "ingestion_failed").slice(0, 300));
    return NextResponse.json({ error: "Ingestion failed" }, { status: 500 });
  }
}

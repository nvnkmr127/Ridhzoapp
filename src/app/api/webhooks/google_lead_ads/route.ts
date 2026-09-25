import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { LeadSourceService } from "@/domains/leads/sourceService";
import { IngestionService } from "@/lib/leads/ingestion";
import { applySourceFieldMappings } from "@/lib/leads/sourceFieldMapping";

// Google Ads Lead Form webhook receiver.
// In Google Ads → Lead form → "Deliver leads", set:
//   Webhook URL:  https://<domain>/api/webhooks/google_lead_ads?sourceId=<this source's id>
//   Key:          this source's signing secret (shown in the sources list)
// Google POSTs { lead_id, user_column_data:[{column_id,string_value}], google_key, is_test, ... }.
// Ingest synchronously here (no Redis/worker dependency) so it works before the queue is wired.

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

export async function POST(req: NextRequest) {
  const sourceId = req.nextUrl.searchParams.get("sourceId");
  if (!sourceId) return NextResponse.json({ error: "Missing sourceId" }, { status: 400 });
  // Reject a malformed id before it hits the DB (a uuid cast error would otherwise 500).
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sourceId)) {
    return NextResponse.json({ error: "Invalid sourceId" }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });

  const source = await LeadSourceService.getSource(sourceId);
  if (!source || !source.isActive || !source.organizationId || source.type !== "google_lead_ads") {
    return NextResponse.json({ error: "Invalid or inactive Google source" }, { status: 403 });
  }

  // Google echoes the key you configured as `google_key` — validate it against the source secret.
  const key = String((body as any).google_key ?? "");
  if (source.webhookSecret && !(key.length === source.webhookSecret.length && timingSafeEqual(Buffer.from(key), Buffer.from(source.webhookSecret)))) {
    return NextResponse.json({ error: "Invalid key" }, { status: 401 });
  }

  // Google sends a test ping when you save the webhook — acknowledge 200 without creating a lead.
  if ((body as any).is_test) return NextResponse.json({ status: "test_ok" }, { status: 200 });

  const cols = mapColumns((body as any).user_column_data);
  // Google's built-in contact columns; everything else is a custom question and is offered for
  // mapping to a custom field. Keep this set so those contact columns don't leak into customData.
  const STANDARD_GOOGLE_COLS = new Set([
    "FULL_NAME", "FIRST_NAME", "LAST_NAME", "EMAIL", "USER_EMAIL", "PHONE_NUMBER", "USER_PHONE", "COMPANY_NAME",
  ]);
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
    return NextResponse.json({ error: "Lead has no email or phone to dedupe on" }, { status: 422 });
  }

  try {
    const result = await IngestionService.processLead({
      name,
      email,
      phone,
      company: cols.COMPANY_NAME || undefined,
      sourceId,
      organizationId: source.organizationId,
      externalId: (body as any).lead_id ? String((body as any).lead_id) : undefined,
      expectedValue: applied.expectedValue,
      customData: {
        formId: (body as any).form_id,
        campaignId: (body as any).campaign_id,
        gclId: (body as any).gcl_id,
        ...applied.customData,
      },
    });
    return NextResponse.json({ status: result.status, leadId: result.leadId }, { status: 200 });
  } catch (e: any) {
    console.error("[GOOGLE_LEADFORM_WEBHOOK]", e);
    return NextResponse.json({ error: e?.message ?? "Ingestion failed" }, { status: 500 });
  }
}

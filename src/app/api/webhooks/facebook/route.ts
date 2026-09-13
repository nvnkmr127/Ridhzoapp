import { NextRequest, NextResponse } from "next/server";
import { FacebookLeadMappingService } from "@/domains/leads/facebookLeadMappingService";
import { db } from "@/db";
import { webhookEvents, leadSources } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { ingestionQueue } from "@/lib/jobs/workers/ingestionWorker";
import { verifyMetaSignature } from "@/lib/webhooks/signature";

/** True if any Facebook source is connected for this Page. Meta can deliver leadgen events for
 *  Pages we don't manage (broad app subscription); enqueuing those just burns worker retries. */
async function hasSourceForPage(pageId?: string): Promise<boolean> {
  if (!pageId) return true; // no page id → let the worker decide, don't drop silently
  const rows = await db
    .select({ id: leadSources.id })
    .from(leadSources)
    .where(and(eq(leadSources.type, "facebook_lead_ads"), sql`${leadSources.config}->>'pageId' = ${pageId}`))
    .limit(1);
  return rows.length > 0;
}

const FB_VERIFY_TOKEN = process.env.FACEBOOK_VERIFY_TOKEN || "privyr_fb_webhook_secret";

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const hubMode = searchParams.get("hub.mode");
  const hubVerifyToken = searchParams.get("hub.verify_token");
  const hubChallenge = searchParams.get("hub.challenge");

  const { verified, challenge } = FacebookLeadMappingService.verifyFacebookWebhook(
    hubMode,
    hubVerifyToken,
    hubChallenge,
    FB_VERIFY_TOKEN
  );

  if (verified && challenge) {
    return new NextResponse(challenge, { status: 200 });
  }

  return NextResponse.json({ success: false, error: "Forbidden: Verification token mismatch" }, { status: 403 });
}

export async function POST(req: NextRequest) {
  try {
    const rawText = await req.text();

    // Verify Meta's payload signature when an app secret is configured. Rejects spoofed
    // lead injection. Unset secret = verification skipped (dev), same pattern as other integrations.
    const appSecret = process.env.FACEBOOK_APP_SECRET;
    if (appSecret) {
      if (!verifyMetaSignature(rawText, req.headers.get("x-hub-signature-256"), appSecret)) {
        return NextResponse.json({ success: false, error: "Invalid signature" }, { status: 401 });
      }
    } else {
      console.warn("[FACEBOOK_WEBHOOK] FACEBOOK_APP_SECRET unset — signature verification skipped");
    }

    let body: any;

    try {
      body = JSON.parse(rawText);
    } catch {
      return NextResponse.json({ success: false, error: "Invalid JSON format" }, { status: 400 });
    }

    if (body.object !== "page" || !Array.isArray(body.entry)) {
      return NextResponse.json({ success: false, error: "Unrecognized Facebook payload" }, { status: 400 });
    }

    const processedEvents = [];

    for (const entry of body.entry) {
      if (!Array.isArray(entry.changes)) continue;

      for (const change of entry.changes) {
        if (change.field === "leadgen" && change.value) {
          const leadgenValue = change.value;
          const leadgenId = leadgenValue.leadgen_id;
          const formId = leadgenValue.form_id;
          const idempotencyKey = `fb_${leadgenId}`;

          // Ignore leads for Pages nobody has connected — don't create events the worker can only fail.
          if (!(await hasSourceForPage(leadgenValue.page_id))) {
            continue;
          }

          // Meta retries deliveries; dedupe on the leadgen id so we don't store duplicate events or
          // make duplicate Graph calls. ponytail: app-level check (no unique index / prod migration);
          // a rare concurrent double-delivery still gets caught by lead-level dedup downstream.
          const existing = await db
            .select({ id: webhookEvents.id })
            .from(webhookEvents)
            .where(eq(webhookEvents.idempotencyKey, idempotencyKey))
            .limit(1);
          if (existing.length > 0) {
            processedEvents.push(existing[0].id);
            continue;
          }

          // Store event in database
          const [event] = await db
            .insert(webhookEvents)
            .values({
              provider: "facebook",
              payload: {
                leadgen_id: leadgenId,
                form_id: formId,
                page_id: leadgenValue.page_id,
                ad_id: leadgenValue.ad_id,
                raw: leadgenValue,
              },
              idempotencyKey,
            })
            .returning();

          // Enqueue for async lead ingestion & Graph API field resolution
          await ingestionQueue.add(`ingest-fb-${event.id}`, {
            webhookEventId: event.id,
            provider: "facebook",
            leadgenId,
            formId,
          });

          processedEvents.push(event.id);
        }
      }
    }

    return NextResponse.json({ success: true, processedEvents }, { status: 202 });
  } catch (error: any) {
    console.error("[FACEBOOK_WEBHOOK_ERROR]", error);
    return NextResponse.json({ success: false, error: "Internal Server Error" }, { status: 500 });
  }
}

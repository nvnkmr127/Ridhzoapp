import { NextRequest, NextResponse } from "next/server";
import { FacebookLeadMappingService } from "@/domains/leads/facebookLeadMappingService";
import { FacebookIngestionService } from "@/domains/leads/facebookIngestionService";
import { db } from "@/db";
import { webhookEvents, leadSources } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
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

    // Verify Meta's payload signature. Rejects spoofed lead injection. In production the app secret
    // is MANDATORY — without it any unauthenticated POST could inject leads for any connected Page,
    // so we refuse rather than silently skip. Only local/dev (non-production) may run without it.
    const appSecret = process.env.FACEBOOK_APP_SECRET;
    if (appSecret) {
      if (!verifyMetaSignature(rawText, req.headers.get("x-hub-signature-256"), appSecret)) {
        return NextResponse.json({ success: false, error: "Invalid signature" }, { status: 401 });
      }
    } else if (process.env.NODE_ENV === "production") {
      console.error("[FACEBOOK_WEBHOOK] FACEBOOK_APP_SECRET unset in production — refusing unverified webhook");
      return NextResponse.json({ success: false, error: "Webhook verification not configured" }, { status: 500 });
    } else {
      console.warn("[FACEBOOK_WEBHOOK] FACEBOOK_APP_SECRET unset — signature verification skipped (non-production)");
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

    const processedEvents: string[] = [];
    let hadTransientFailure = false;

    for (const entry of body.entry) {
      if (!Array.isArray(entry.changes)) continue;

      for (const change of entry.changes) {
        if (change.field !== "leadgen" || !change.value) continue;

        const leadgenValue = change.value;
        const leadgenId = leadgenValue.leadgen_id;
        const formId = leadgenValue.form_id;
        const pageId = leadgenValue.page_id;
        const idempotencyKey = `fb_${leadgenId}`;

        // Always log receipt so it's provable Meta is actually calling us (top debugging question).
        console.log(`[FACEBOOK_WEBHOOK] leadgen received page=${pageId} form=${formId} leadgen=${leadgenId}`);

        // Ignore leads for Pages nobody has connected — but log it, so a page-id mismatch is visible
        // instead of a silent drop.
        if (!(await hasSourceForPage(pageId))) {
          console.warn(`[FACEBOOK_WEBHOOK] no connected source for page=${pageId} — skipping leadgen=${leadgenId}`);
          continue;
        }

        // Find-or-create the event, idempotent on the leadgen id (Meta re-delivers). A previously
        // failed event is reprocessed on redelivery; a processed one is skipped.
        const existing = await db
          .select()
          .from(webhookEvents)
          .where(eq(webhookEvents.idempotencyKey, idempotencyKey))
          .limit(1);
        let event = existing[0];
        if (event?.status === "processed") {
          processedEvents.push(event.id);
          continue;
        }
        if (!event) {
          // Insert-or-nothing on the (provider, idempotency_key) unique index closes the race where
          // Meta delivers the same leadgen twice concurrently: only one row is created, the other
          // insert no-ops and we re-read the winner instead of creating a duplicate event.
          const [created] = await db
            .insert(webhookEvents)
            .values({
              provider: "facebook",
              payload: {
                leadgen_id: leadgenId,
                form_id: formId,
                page_id: pageId,
                ad_id: leadgenValue.ad_id,
                raw: leadgenValue,
              },
              idempotencyKey,
            })
            .onConflictDoNothing({ target: [webhookEvents.provider, webhookEvents.idempotencyKey] })
            .returning();
          event = created;
          if (!event) {
            const [again] = await db
              .select()
              .from(webhookEvents)
              .where(eq(webhookEvents.idempotencyKey, idempotencyKey))
              .limit(1);
            event = again;
            if (event?.status === "processed") {
              processedEvents.push(event.id);
              continue;
            }
          }
        }
        if (!event) continue;

        // Process INLINE — no dependency on the droplet worker. On a transient failure we mark the
        // event failed and return 5xx so Meta re-delivers (its built-in retry), and the redelivery
        // reprocesses the still-unprocessed event. Auth/skip/success are terminal (handled inside).
        try {
          const result = await FacebookIngestionService.processEvent(event);
          console.log(`[FACEBOOK_WEBHOOK] processed leadgen=${leadgenId} → ${result.status}${result.reason ? ` (${result.reason})` : ""}`);
          processedEvents.push(event.id);
        } catch (e: any) {
          console.error(`[FACEBOOK_WEBHOOK] inline processing failed for leadgen=${leadgenId}:`, e?.message);
          await db
            .update(webhookEvents)
            .set({ status: "failed", errorLog: { message: e?.message, stack: e?.stack } })
            .where(eq(webhookEvents.id, event.id));
          hadTransientFailure = true;
        }
      }
    }

    // A 5xx tells Meta to redeliver so transient failures get another attempt; otherwise 202.
    if (hadTransientFailure) {
      return NextResponse.json({ success: false, error: "Retry later", processedEvents }, { status: 503 });
    }
    return NextResponse.json({ success: true, processedEvents }, { status: 202 });
  } catch (error: any) {
    console.error("[FACEBOOK_WEBHOOK_ERROR]", error);
    return NextResponse.json({ success: false, error: "Internal Server Error" }, { status: 500 });
  }
}

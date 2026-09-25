import { NextRequest, NextResponse } from "next/server";
import { RateLimiter } from "@/lib/rate-limit";
import { db } from "@/db";
import { webhookEvents } from "@/db/schema";
import { ingestionQueue } from "@/lib/jobs/workers/ingestionWorker";

import { z } from "zod";
import { createHmac, timingSafeEqual } from "crypto";

const webhookPayloadSchema = z.object({
  name: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
}).passthrough();

// Only these source types receive leads on this route (the worker has an adapter for each).
// facebook_lead_ads stays for anyone who wired a relay (e.g. Zapier) to the URL older cards showed.
const ROUTE_PROVIDERS = new Set(["generic_webhook", "webform", "facebook_lead_ads"]);

// Constant-time string compare (secrets / signatures).
function safeEqual(a: string, b: string) {
  const x = Buffer.from(a, "utf8");
  const y = Buffer.from(b, "utf8");
  return x.length === y.length && timingSafeEqual(x, y);
}

// Website form tools (WordPress, Elementor, Webflow, Contact Form 7…) post form-encoded or multipart
// bodies; custom code usually posts JSON. Accept all three. Empty fields are dropped so a blank
// optional "email" doesn't fail validation.
async function readBody(req: NextRequest): Promise<{ rawText: string | null; body: Record<string, unknown> | null }> {
  const type = req.headers.get("content-type") ?? "";
  let rawText: string | null = null;
  let body: Record<string, unknown> | null = null;
  if (type.includes("multipart/form-data")) {
    const form = await req.formData();
    body = Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === "string"));
  } else {
    rawText = await req.text();
    if (type.includes("application/x-www-form-urlencoded")) {
      body = Object.fromEntries(new URLSearchParams(rawText));
    } else {
      try {
        const parsed = JSON.parse(rawText);
        body = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
      } catch {
        body = null;
      }
    }
  }
  if (body) for (const [k, v] of Object.entries(body)) if (v === "") delete body[k];
  return { rawText, body };
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  try {
    const { provider } = await params;
    const { rawText, body: rawBody } = await readBody(req);
    if (!rawBody) {
      return NextResponse.json({ success: false, error: "Send the lead as JSON or as form fields" }, { status: 400 });
    }

    // Basic validation to ensure the payload is well-formed
    const parseResult = webhookPayloadSchema.safeParse(rawBody);
    if (!parseResult.success) {
      return NextResponse.json({ success: false, error: "Invalid payload format" }, { status: 400 });
    }
    const body = parseResult.data;
    
    const ip = req.headers.get("x-forwarded-for") || "unknown";
    const rateLimitKey = `webhook:${provider}:${ip}`;
    const limitResult = await RateLimiter.checkLimit(rateLimitKey, 100, 60);

    if (!limitResult.success) {
      return NextResponse.json({ success: false, error: "Too Many Requests" }, { 
        status: 429,
        headers: {
          'X-RateLimit-Limit': limitResult.limit.toString(),
          'X-RateLimit-Remaining': limitResult.remaining.toString(),
          'X-RateLimit-Reset': limitResult.reset.toString(),
        }
      });
    }

    // Identify source
    const sourceId = (body as any).sourceId || req.nextUrl.searchParams.get("sourceId");
    if (!sourceId) {
      return NextResponse.json({ success: false, error: "Missing sourceId" }, { status: 400 });
    }

    const { LeadSourceService } = await import("@/domains/leads/sourceService");
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(sourceId))) {
      return NextResponse.json({ success: false, error: "Invalid sourceId" }, { status: 400 });
    }
    const source = await LeadSourceService.getSource(sourceId);
    // The URL's provider must be this source's own type, so a lead can't be routed through a
    // different adapter than the one its source was set up for.
    if (!source || !source.isActive || !source.organizationId || source.type !== provider || !ROUTE_PROVIDERS.has(provider)) {
      return NextResponse.json({ success: false, error: "Invalid or inactive source" }, { status: 403 });
    }

    // Authentication, either way: (a) the secret itself as `?key=` / `x-webhook-key` — for form tools
    // that can't compute signatures — or (b) an HMAC SHA-256 signature of the raw body.
    if (source.webhookSecret) {
      const key = req.nextUrl.searchParams.get("key") ?? req.headers.get("x-webhook-key");
      const signature = req.headers.get("x-hub-signature-256");
      if (key) {
        if (!safeEqual(key, source.webhookSecret)) {
          return NextResponse.json({ success: false, error: "Invalid key" }, { status: 401 });
        }
      } else if (signature && rawText !== null) {
        const expected = createHmac("sha256", source.webhookSecret).update(rawText).digest("hex");
        const cleanSig = signature.startsWith("sha256=") ? signature.slice(7) : signature;
        if (!safeEqual(cleanSig, expected)) {
          return NextResponse.json({ success: false, error: "Invalid signature" }, { status: 401 });
        }
      } else {
        return NextResponse.json({ success: false, error: "Add ?key=<your secret> to the URL, or sign the body (x-hub-signature-256)" }, { status: 401 });
      }
    }

    // Simple idempotency check based on a header (optional, depends on provider)
    const idempotencyKey = req.headers.get("x-idempotency-key") || undefined;

    if (idempotencyKey) {
      const { eq, and } = await import("drizzle-orm");
      const [existingEvent] = await db
        .select()
        .from(webhookEvents)
        .where(
          and(
            eq(webhookEvents.provider, provider),
            eq(webhookEvents.idempotencyKey, idempotencyKey)
          )
        )
        .limit(1);

      if (existingEvent) {
        return NextResponse.json({ success: true, eventId: existingEvent.id, duplicate: true }, { status: 200 });
      }
    }

    // 1. Store the webhook event immediately. Fold the resolved sourceId and organizationId into the payload so
    // the ingestion worker finds it even when it arrived via the query string, not the body.
    // Insert-or-nothing on (provider, idempotency_key) so a concurrent duplicate delivery no-ops
    // instead of throwing a unique violation; we then re-read and treat it as the duplicate.
    const [event] = await db.insert(webhookEvents).values({
      provider,
      payload: { ...body, sourceId, organizationId: source.organizationId },
      idempotencyKey,
    })
      .onConflictDoNothing({ target: [webhookEvents.provider, webhookEvents.idempotencyKey] })
      .returning();

    if (!event && idempotencyKey) {
      const { eq, and } = await import("drizzle-orm");
      const [existing] = await db
        .select()
        .from(webhookEvents)
        .where(and(eq(webhookEvents.provider, provider), eq(webhookEvents.idempotencyKey, idempotencyKey)))
        .limit(1);
      if (existing) {
        return NextResponse.json({ success: true, eventId: existing.id, duplicate: true }, { status: 200 });
      }
    }
    if (!event) {
      return NextResponse.json({ success: false, error: "Failed to store webhook event" }, { status: 500 });
    }

    // 2. Offload to BullMQ for asynchronous processing
    await ingestionQueue.add(`ingest-${event.id}`, {
      webhookEventId: event.id
    });

    return NextResponse.json({ success: true, eventId: event.id }, { status: 202 });

  } catch (error: any) {
    console.error("Webhook receiver error:", error);
    return NextResponse.json({ success: false, error: "Internal Server Error" }, { status: 500 });
  }
}

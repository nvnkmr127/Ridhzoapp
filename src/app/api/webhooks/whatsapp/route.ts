import { NextRequest, NextResponse } from "next/server";
import { parseWebhook } from "@/lib/messaging/whatsapp/parse";
import { WhatsAppService } from "@/lib/messaging/whatsapp/service";
import { verifyMetaSignature } from "@/lib/webhooks/signature";
import { timingSafeEqual } from "crypto";
import { InboundIntentService } from "@/domains/leads/inboundIntentService";

// GET: webhook verification handshake. Meta/most BSPs send hub.* params and expect the
// challenge echoed back when the verify token matches. WATXIO_DOC: confirm param names.
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const mode = q.get("hub.mode");
  const token = q.get("hub.verify_token");
  const challenge = q.get("hub.challenge");
  if (mode === "subscribe" && token && token === process.env.WATXIO_VERIFY_TOKEN) {
    return new NextResponse(challenge ?? "", { status: 200 });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

// POST: inbound replies + delivery-status updates. Always 200 fast so Watxio doesn't retry-storm;
// failures on individual items are logged, not surfaced.
export async function POST(req: NextRequest) {
  const rawText = await req.text();

  // Authenticate the delivery. Preferred: HMAC signature (WATXIO_APP_SECRET). If the provider can't sign,
  // a shared token (WATXIO_VERIFY_TOKEN) as ?token= or x-verify-token. In production a request that
  // passes neither is refused — an unauthenticated endpoint would let anyone forge lead replies.
  const appSecret = process.env.WATXIO_APP_SECRET;
  const verifyToken = process.env.WATXIO_VERIFY_TOKEN;
  let authentic = false;
  if (appSecret) {
    authentic = verifyMetaSignature(rawText, req.headers.get("x-hub-signature-256"), appSecret);
  } else if (verifyToken) {
    const given = req.nextUrl.searchParams.get("token") ?? req.headers.get("x-verify-token") ?? "";
    authentic = given.length === verifyToken.length && timingSafeEqual(Buffer.from(given), Buffer.from(verifyToken));
  } else if (process.env.NODE_ENV !== "production") {
    authentic = true; // local dev only
  } else {
    console.error("[whatsapp-webhook] neither WATXIO_APP_SECRET nor WATXIO_VERIFY_TOKEN is set — refusing unauthenticated inbound");
  }
  if (!authentic) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  let body: any;
  try {
    body = JSON.parse(rawText);
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  const { messages, statuses } = parseWebhook(body);

  await Promise.allSettled([
    ...statuses.map((s) => WhatsAppService.updateStatus(s.id, s.status)),
    ...messages.map(async (m) => {
      const res = await WhatsAppService.recordInbound({ fromPhone: m.from, providerMessageId: m.id, body: m.body });
      // AI intent/sentiment tagging on matched replies — best-effort, never blocks the ack.
      if (res.matched && res.leadId) await InboundIntentService.classifyAndTag(res.leadId, m.body, res.organizationId);
    }),
  ]);

  return NextResponse.json({ ok: true, received: messages.length + statuses.length });
}

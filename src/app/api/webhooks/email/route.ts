import { NextRequest, NextResponse } from "next/server";
import { EmailInboundService, isAutoReply, htmlToText } from "@/domains/leads/emailInboundService";
import { InboundIntentService } from "@/domains/leads/inboundIntentService";
import { TenantIntegrationsService } from "@/domains/organizations/tenantIntegrationsService";
import { logError } from "@/lib/log";
import { keepAlive } from "@/lib/keepAlive";

// Inbound email webhook. Postmark, Mailgun, Resend and SendGrid can POST parsed inbound mail to a
// URL — point yours here. Body format and field names vary between providers, so we accept JSON or
// form data and read the common aliases below; reshape here if yours differs.
//
// Security + multi-tenancy: this endpoint writes to a lead's timeline by matching the sender
// address, which is trivially spoofable, so a per-tenant token is REQUIRED. The token (from
// Settings → Lead Intelligence) both identifies the org and authorises the POST — matching is
// scoped to that org. Unknown/disabled token = 401. No open door.
export async function POST(req: NextRequest) {
  const token = req.headers.get("x-webhook-token") ?? req.nextUrl.searchParams.get("token") ?? "";
  const resolved = await TenantIntegrationsService.resolveInboundToken(token);
  if (!resolved) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  // Postmark and Resend post JSON; Mailgun routes and SendGrid Inbound Parse post form data.
  let body: Record<string, unknown>;
  try {
    const type = req.headers.get("content-type") ?? "";
    if (type.includes("multipart/form-data") || type.includes("application/x-www-form-urlencoded")) {
      body = Object.fromEntries([...(await req.formData()).entries()].filter(([, v]) => typeof v === "string"));
    } else {
      body = (await req.json()) as Record<string, unknown>;
    }
  } catch {
    return NextResponse.json({ ok: false, error: "invalid body" }, { status: 400 });
  }
  // Resend wraps the message in an event envelope: { type: "email.received", data: { from, … } }.
  if (body.type === "email.received" && body.data && typeof body.data === "object") {
    body = body.data as Record<string, unknown>;
  }

  const str = (...keys: string[]): string => {
    for (const k of keys) {
      const v = body[k];
      if (typeof v === "string" && v) return v;
    }
    return "";
  };

  const from = str("from", "sender", "fromEmail", "From");
  const subject = str("subject", "Subject");
  let text = str("stripped-text", "text", "body-plain", "body", "plain", "TextBody");
  if (!text) text = htmlToText(str("stripped-html", "html", "body-html", "HtmlBody", "Html")).trim(); // HTML-only mail
  const messageId = str("MessageID", "Message-Id", "message-id", "message_id", "messageId");

  if (!from) return NextResponse.json({ ok: true, matched: false });

  if (isAutoReply({ from, subject, autoSubmitted: str("Auto-Submitted", "auto-submitted", "X-Autoreply") })) {
    return NextResponse.json({ ok: true, matched: false, ignored: "auto-reply" });
  }

  // Matching is scoped to the token's org so a reply can only land on that tenant's leads. A real
  // failure returns 500 so the provider retries (recordInbound is idempotent on Message-ID/content);
  // "no lead with that address" is a normal 200.
  try {
    const res = await EmailInboundService.recordInbound({
      from,
      subject,
      body: text,
      messageId,
      organizationId: resolved.organizationId,
    });
    // Classify after responding: an LLM call must not hold the provider's request open (timeouts
    // make providers retry).
    if (res.matched && res.leadId && !res.duplicate) {
      keepAlive(
        InboundIntentService.classifyAndTag(res.leadId, `${subject}\n${text}`, resolved.organizationId),
        "inbound email intent",
      );
    }
    return NextResponse.json({ ok: true, matched: res.matched, ...(res.duplicate ? { duplicate: true } : {}) });
  } catch (e) {
    logError("webhooks.email", e, { organizationId: resolved.organizationId });
    return NextResponse.json({ ok: false, error: "temporary failure" }, { status: 500 });
  }
}

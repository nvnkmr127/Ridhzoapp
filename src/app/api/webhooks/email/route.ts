import { NextRequest, NextResponse } from "next/server";
import { EmailInboundService } from "@/domains/leads/emailInboundService";
import { InboundIntentService } from "@/domains/leads/inboundIntentService";
import { TenantIntegrationsService } from "@/domains/organizations/tenantIntegrationsService";
import { logError } from "@/lib/log";

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
  const text = str("stripped-text", "text", "body-plain", "body", "plain", "TextBody");

  if (!from) return NextResponse.json({ ok: true, matched: false });

  // Best-effort; always 200 so the provider doesn't retry-storm on a single bad row. Matching is
  // scoped to the token's org so a reply can only land on that tenant's leads.
  try {
    const res = await EmailInboundService.recordInbound({
      from,
      subject,
      body: text,
      organizationId: resolved.organizationId,
    });
    if (res.matched && res.leadId) {
      await InboundIntentService.classifyAndTag(res.leadId, `${subject}\n${text}`, resolved.organizationId);
    }
    return NextResponse.json({ ok: true, matched: res.matched });
  } catch (e) {
    logError("webhooks.email", e, { organizationId: resolved.organizationId });
    return NextResponse.json({ ok: true, matched: false });
  }
}

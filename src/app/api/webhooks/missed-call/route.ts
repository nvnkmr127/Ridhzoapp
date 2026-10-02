import { NextRequest, NextResponse } from "next/server";
import { clientIp } from "@/lib/clientIp";
import { timingSafeEqual } from "crypto";
import { sql, and, eq } from "drizzle-orm";
import { db } from "@/db";
import { leads } from "@/db/schema";
import { WhatsAppService } from "@/lib/messaging/whatsapp/service";
import { ActivityService } from "@/domains/activities/service";
import { RateLimiter } from "@/lib/rate-limit";

// Provider-agnostic missed-call → instant WhatsApp. Point any telephony provider (Twilio,
// Exotel, Knowlarity, …) at POST /api/webhooks/missed-call with { phone, organizationId } when a call to your
// business number is missed. We match the caller to a lead and auto-send a WhatsApp so no
// missed call goes un-followed-up. Optional shared secret: header x-webhook-secret.
export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  const rateLimit = await RateLimiter.checkLimit(`webhook:missed-call:${ip}`, 60, 60);
  if (!rateLimit.success) {
    return NextResponse.json({ ok: false, error: "Too many requests" }, { status: 429 });
  }

  // Fail closed: with no secret configured the endpoint would let anyone trigger WhatsApp sends.
  const secret = process.env.MISSED_CALL_WEBHOOK_SECRET;
  const sent = req.headers.get("x-webhook-secret") ?? "";
  const a = Buffer.from(sent);
  const b = Buffer.from(secret ?? "");
  if (!secret || a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  const phone: string = body.phone || body.from || body.caller || "";
  const organizationId: string | undefined = body.organizationId || req.nextUrl.searchParams.get("orgId") || undefined;
  const digits = String(phone).replace(/\D/g, "");
  if (!digits) return NextResponse.json({ ok: false, error: "missing phone" }, { status: 400 });

  // The shared secret authenticates the provider, not a tenant — without an org a call would match
  // (and message) a lead in whichever workspace has that number.
  if (!organizationId) return NextResponse.json({ ok: false, error: "missing organizationId" }, { status: 400 });
  const whereConditions = [sql`regexp_replace(${leads.phone}, '\\D', '', 'g') = ${digits}`, eq(leads.organizationId, organizationId)];

  const [lead] = await db
    .select({ id: leads.id, name: leads.name })
    .from(leads)
    .where(and(...whereConditions))
    .limit(1);

  if (!lead) return NextResponse.json({ ok: true, matched: false });

  const message =
    process.env.MISSED_CALL_MESSAGE ||
    "Hi {{first_name}}, sorry we missed your call! How can we help? Reply here and we'll get right back to you.";

  try {
    await WhatsAppService.send({ leadId: lead.id, body: message });
    await ActivityService.addActivity({ leadId: lead.id, type: "whatsapp", content: "Missed call → auto WhatsApp sent." });
  } catch {
    // Personal mode / outside window: log the missed call so the rep follows up manually.
    await ActivityService.addActivity({ leadId: lead.id, type: "note", content: "Missed call — auto WhatsApp couldn't send; follow up manually." });
  }

  return NextResponse.json({ ok: true, matched: true, leadId: lead.id });
}

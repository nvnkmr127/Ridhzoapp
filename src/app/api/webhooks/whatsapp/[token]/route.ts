import { NextRequest, NextResponse } from "next/server";
import { parseWebhook } from "@/lib/messaging/whatsapp/parse";
import { WhatsAppService } from "@/lib/messaging/whatsapp/service";
import { WhatsAppSettingsService } from "@/domains/organizations/whatsappSettingsService";
import { InboundIntentService } from "@/domains/leads/inboundIntentService";
import { RateLimiter } from "@/lib/rate-limit";
import { clientIp } from "@/lib/clientIp";

// Inbound WhatsApp for a workspace that connected ITS OWN account (Settings → Integrations). The long random
// token in the URL identifies and authenticates the workspace, so replies are recorded against that
// workspace only — unlike the shared platform webhook, which can't tell tenants apart.
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  // Cheap guard against token guessing (the token is 192 bits; this just bounds noise and DB lookups).
  if (!(await RateLimiter.checkLimit(`wa-inbound:${clientIp(req)}`, 120, 60)).success) {
    return NextResponse.json({ ok: false, error: "rate limited" }, { status: 429 });
  }
  const organizationId = await WhatsAppSettingsService.orgForToken(token);
  if (!organizationId) return NextResponse.json({ ok: false, error: "unknown" }, { status: 404 });

  let body: unknown;
  try {
    body = JSON.parse(await req.text());
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  const { messages, statuses } = parseWebhook(body);
  await Promise.allSettled([
    ...statuses.map((s) => WhatsAppService.updateStatus(s.id, s.status)),
    ...messages.map(async (m) => {
      const res = await WhatsAppService.recordInbound({ fromPhone: m.from, providerMessageId: m.id, body: m.body, organizationId });
      if (res.matched && res.leadId) await InboundIntentService.classifyAndTag(res.leadId, m.body, res.organizationId);
    }),
  ]);
  return NextResponse.json({ ok: true, received: messages.length + statuses.length });
}

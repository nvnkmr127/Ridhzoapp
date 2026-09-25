import { NextRequest, NextResponse } from "next/server";
import { verifyWebhookSignature } from "@/lib/billing/razorpay";
import { BillingService } from "@/domains/billing/service";

// Razorpay subscription lifecycle. Signature is HMAC over the RAW body, so read text() (not json()).
export async function POST(req: NextRequest) {
  const raw = await req.text();
  const signature = req.headers.get("x-razorpay-signature");

  if (!verifyWebhookSignature(raw, signature)) {
    return NextResponse.json({ ok: false, error: "invalid signature" }, { status: 401 });
  }

  let body: any;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  const subscription = body?.payload?.subscription?.entity;
  const payment = body?.payload?.payment?.entity;
  try {
    await BillingService.handleWebhook(body?.event, subscription, payment);
  } catch (e) {
    console.error("[razorpay] webhook handling failed", e);
    // Still 200 so Razorpay doesn't retry-storm; we've logged it.
  }
  return NextResponse.json({ ok: true });
}

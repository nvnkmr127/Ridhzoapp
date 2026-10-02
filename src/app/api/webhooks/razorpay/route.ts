import { NextRequest, NextResponse } from "next/server";
import { verifyWebhookSignature } from "@/lib/billing/razorpay";
import { BillingService } from "@/domains/billing/service";
import { db } from "@/db";
import { webhookEvents } from "@/db/schema";
import { and, eq } from "drizzle-orm";

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

  // Event ledger: Razorpay re-delivers (and retries on our 5xx). Each x-razorpay-event-id is processed
  // once; a previous attempt that FAILED is retried. Handling is also idempotent on its own, this just
  // stops repeat side effects (emails, invoices, coupon counts) and gives support a delivery trail.
  const eventId = req.headers.get("x-razorpay-event-id");
  let ledgerId: string | undefined;
  if (eventId) {
    const [created] = await db
      .insert(webhookEvents)
      .values({ provider: "razorpay", idempotencyKey: eventId, payload: { event: body?.event, subscriptionId: subscription?.id ?? null, paymentId: payment?.id ?? null }, status: "processing" })
      .onConflictDoNothing({ target: [webhookEvents.provider, webhookEvents.idempotencyKey] })
      .returning({ id: webhookEvents.id });
    if (created) {
      ledgerId = created.id;
    } else {
      const [prev] = await db.select({ id: webhookEvents.id, status: webhookEvents.status }).from(webhookEvents)
        .where(and(eq(webhookEvents.provider, "razorpay"), eq(webhookEvents.idempotencyKey, eventId))).limit(1);
      if (prev?.status === "processed") return NextResponse.json({ ok: true, duplicate: true });
      ledgerId = prev?.id; // failed earlier → process again
    }
  }

  try {
    if (body?.event === "refund.processed" || body?.event === "payment.refunded") {
      await BillingService.handleRefundWebhook(body?.payload?.refund?.entity);
    } else if (body?.event === "payment.failed") {
      await BillingService.handlePaymentFailedWebhook(payment);
    } else {
      await BillingService.handleWebhook(body?.event, subscription, payment);
    }
    if (ledgerId) await db.update(webhookEvents).set({ status: "processed", processedAt: new Date() }).where(eq(webhookEvents.id, ledgerId)).catch(() => {});
  } catch (e) {
    console.error("[razorpay] webhook handling failed", e);
    if (ledgerId) await db.update(webhookEvents).set({ status: "failed", errorLog: { message: (e as Error)?.message } }).where(eq(webhookEvents.id, ledgerId)).catch(() => {});
    // 500 so Razorpay retries (it backs off for up to 24h); handleWebhook is idempotent and drops stale events.
    return NextResponse.json({ ok: false, error: "temporary failure" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

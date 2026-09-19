import crypto from "crypto";

// Thin Razorpay client over fetch — no SDK (ponytail: it's Basic-auth REST + an HMAC).
// Configure with RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET, and a plan_id
// per paid tier (RAZORPAY_PLAN_PRO, RAZORPAY_PLAN_BUSINESS) created in the Razorpay dashboard.

const KEY_ID = process.env.RAZORPAY_KEY_ID;
const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;
const WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET;
const API = "https://api.razorpay.com/v1";

export const RAZORPAY_PLAN_IDS: Record<string, string | undefined> = {
  starter: process.env.RAZORPAY_PLAN_STARTER || process.env.RAZORPAY_PLAN_PRO,
  unlimited: process.env.RAZORPAY_PLAN_UNLIMITED || process.env.RAZORPAY_PLAN_BUSINESS,
  pro: process.env.RAZORPAY_PLAN_STARTER || process.env.RAZORPAY_PLAN_PRO,
  business: process.env.RAZORPAY_PLAN_UNLIMITED || process.env.RAZORPAY_PLAN_BUSINESS,
};

export function isConfigured() {
  return Boolean(KEY_ID && KEY_SECRET);
}

export function publicKeyId() {
  return KEY_ID ?? null;
}

function authHeader() {
  return "Basic " + Buffer.from(`${KEY_ID}:${KEY_SECRET}`).toString("base64");
}

// Create a subscription for a plan. total_count is how many billing cycles to charge.
export async function createSubscription(planId: string, totalCount = 12) {
  if (!isConfigured()) throw new Error("Billing is not configured");
  const res = await fetch(`${API}/subscriptions`, {
    method: "POST",
    headers: { Authorization: authHeader(), "Content-Type": "application/json" },
    body: JSON.stringify({ plan_id: planId, total_count: totalCount, customer_notify: 1 }),
  });
  if (!res.ok) throw new Error(`Razorpay subscription failed (${res.status}): ${await res.text()}`);
  return (await res.json()) as { id: string; status: string; short_url?: string };
}

export async function cancelSubscription(subscriptionId: string) {
  if (!isConfigured()) throw new Error("Billing is not configured");
  const res = await fetch(`${API}/subscriptions/${subscriptionId}/cancel`, {
    method: "POST",
    headers: { Authorization: authHeader(), "Content-Type": "application/json" },
    body: JSON.stringify({ cancel_at_cycle_end: 0 }),
  });
  if (!res.ok) throw new Error(`Razorpay cancel failed (${res.status}): ${await res.text()}`);
  return res.json();
}

// Checkout success handshake: generated = HMAC_SHA256(payment_id + "|" + subscription_id, secret).
export function verifyPaymentSignature(input: { paymentId: string; subscriptionId: string; signature: string }) {
  if (!KEY_SECRET) return false;
  const expected = crypto.createHmac("sha256", KEY_SECRET).update(`${input.paymentId}|${input.subscriptionId}`).digest("hex");
  return safeEqual(expected, input.signature);
}

// Webhook authenticity: HMAC_SHA256(rawBody, webhook_secret) === X-Razorpay-Signature.
export function verifyWebhookSignature(rawBody: string, signature: string | null) {
  if (!WEBHOOK_SECRET || !signature) return false;
  const expected = crypto.createHmac("sha256", WEBHOOK_SECRET).update(rawBody).digest("hex");
  return safeEqual(expected, signature);
}

function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

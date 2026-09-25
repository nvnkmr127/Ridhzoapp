import crypto from "crypto";

// Thin Razorpay client over fetch — no SDK (ponytail: it's Basic-auth REST + an HMAC).
// Configure with RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET, and a plan_id
// per paid tier (RAZORPAY_PLAN_STARTER, RAZORPAY_PLAN_UNLIMITED; legacy RAZORPAY_PLAN_PRO/_BUSINESS)
// created in the Razorpay dashboard.

const KEY_ID = process.env.RAZORPAY_KEY_ID;
const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;
const WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET;
const API = "https://api.razorpay.com/v1";

export type BillingCycle = "monthly" | "yearly";

export const RAZORPAY_PLAN_IDS: Record<string, string | undefined> = {
  starter: process.env.RAZORPAY_PLAN_STARTER || process.env.RAZORPAY_PLAN_PRO,
  unlimited: process.env.RAZORPAY_PLAN_UNLIMITED || process.env.RAZORPAY_PLAN_BUSINESS,
  pro: process.env.RAZORPAY_PLAN_STARTER || process.env.RAZORPAY_PLAN_PRO,
  business: process.env.RAZORPAY_PLAN_UNLIMITED || process.env.RAZORPAY_PLAN_BUSINESS,
};

// Yearly Razorpay plans (period "yearly", interval 1). Optional — the yearly toggle only shows when set.
export const RAZORPAY_YEARLY_PLAN_IDS: Record<string, string | undefined> = {
  starter: process.env.RAZORPAY_PLAN_STARTER_YEARLY,
  unlimited: process.env.RAZORPAY_PLAN_UNLIMITED_YEARLY,
};

export function planIdFor(plan: string, cycle: BillingCycle): string | undefined {
  return cycle === "yearly" ? RAZORPAY_YEARLY_PLAN_IDS[plan] : RAZORPAY_PLAN_IDS[plan];
}

export function yearlyAvailable(): boolean {
  return Boolean(RAZORPAY_YEARLY_PLAN_IDS.starter && RAZORPAY_YEARLY_PLAN_IDS.unlimited);
}

export function isConfigured() {
  return Boolean(KEY_ID && KEY_SECRET);
}

export function publicKeyId() {
  return KEY_ID ?? null;
}

function authHeader() {
  return "Basic " + Buffer.from(`${KEY_ID}:${KEY_SECRET}`).toString("base64");
}

export type RazorpaySubscription = {
  id: string;
  plan_id: string;
  status: string; // created | authenticated | active | pending | halted | cancelled | completed | expired
  current_end?: number | null;
  charge_at?: number | null; // next charge time — for a trial-delayed subscription, the first charge
  start_at?: number | null; // when billing starts (future = scheduled change)
  short_url?: string;
  notes?: Record<string, string>;
};

// Which of our plans a Razorpay plan_id is (canonical names only), or null if it isn't one of ours.
export function planForPlanId(planId: string | null | undefined): "starter" | "unlimited" | null {
  if (!planId) return null;
  if (planId === RAZORPAY_PLAN_IDS.starter || planId === RAZORPAY_YEARLY_PLAN_IDS.starter) return "starter";
  if (planId === RAZORPAY_PLAN_IDS.unlimited || planId === RAZORPAY_YEARLY_PLAN_IDS.unlimited) return "unlimited";
  return null;
}

export function cycleForPlanId(planId: string | null | undefined): BillingCycle {
  return planId && (planId === RAZORPAY_YEARLY_PLAN_IDS.starter || planId === RAZORPAY_YEARLY_PLAN_IDS.unlimited) ? "yearly" : "monthly";
}

// Create (or reuse — fail_existing 0 returns the match) a Razorpay customer. Carrying the GSTIN on the
// customer is what puts it on Razorpay's tax invoices.
export async function upsertCustomer(input: { name: string; email?: string; contact?: string; gstin?: string | null }) {
  if (!isConfigured()) throw new Error("Billing is not configured");
  const body: Record<string, unknown> = { name: input.name.slice(0, 50), fail_existing: 0 };
  if (input.email) body.email = input.email;
  if (input.contact) body.contact = input.contact;
  if (input.gstin) body.gstin = input.gstin;
  const res = await fetch(`${API}/customers`, {
    method: "POST",
    headers: { Authorization: authHeader(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Razorpay customer failed (${res.status}): ${await res.text()}`);
  return (await res.json()) as { id: string };
}

export async function updateCustomerGstin(customerId: string, input: { name: string; gstin: string | null }) {
  if (!isConfigured()) return;
  await fetch(`${API}/customers/${encodeURIComponent(customerId)}`, {
    method: "PUT",
    headers: { Authorization: authHeader(), "Content-Type": "application/json" },
    body: JSON.stringify({ name: input.name.slice(0, 50), gstin: input.gstin ?? "" }),
  });
}

// Create a subscription for a plan. total_count is how many billing cycles Razorpay will charge
// before the subscription "completes" — 12 used to silently end every customer's plan after a year.
// notes.organizationId ties the subscription to the workspace (checked on verify and in webhooks).
// startAt: first charge on that date instead of now (end of trial / end of the period already paid).
// offerId: a Razorpay Offer (the discount behind a coupon code). customerId: carries the GSTIN.
// total_count: cycles before the subscription "completes" — 12 used to end every plan after a year.
export async function createSubscription(
  planId: string,
  organizationId: string,
  opts: { startAt?: Date | null; cycle?: BillingCycle; offerId?: string | null; customerId?: string | null; couponCode?: string | null } = {},
) {
  if (!isConfigured()) throw new Error("Billing is not configured");
  const totalCount = opts.cycle === "yearly" ? 10 : 120;
  const res = await fetch(`${API}/subscriptions`, {
    method: "POST",
    headers: { Authorization: authHeader(), "Content-Type": "application/json" },
    body: JSON.stringify({
      plan_id: planId,
      total_count: totalCount,
      customer_notify: 1,
      notes: { organizationId, ...(opts.couponCode ? { couponCode: opts.couponCode } : {}) },
      ...(opts.startAt ? { start_at: Math.floor(opts.startAt.getTime() / 1000) } : {}),
      ...(opts.offerId ? { offer_id: opts.offerId } : {}),
      ...(opts.customerId ? { customer_id: opts.customerId } : {}),
    }),
  });
  if (!res.ok) throw new Error(`Razorpay subscription failed (${res.status}): ${await res.text()}`);
  return (await res.json()) as RazorpaySubscription;
}

export async function fetchSubscription(subscriptionId: string) {
  if (!isConfigured()) throw new Error("Billing is not configured");
  const res = await fetch(`${API}/subscriptions/${encodeURIComponent(subscriptionId)}`, { headers: { Authorization: authHeader() } });
  if (!res.ok) throw new Error(`Razorpay fetch failed (${res.status}): ${await res.text()}`);
  return (await res.json()) as RazorpaySubscription;
}

// atCycleEnd: keep the paid plan until the period the customer already paid for ends.
export async function cancelSubscription(subscriptionId: string, atCycleEnd = false) {
  if (!isConfigured()) throw new Error("Billing is not configured");
  const res = await fetch(`${API}/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`, {
    method: "POST",
    headers: { Authorization: authHeader(), "Content-Type": "application/json" },
    body: JSON.stringify({ cancel_at_cycle_end: atCycleEnd ? 1 : 0 }),
  });
  if (!res.ok) throw new Error(`Razorpay cancel failed (${res.status}): ${await res.text()}`);
  return res.json();
}

export type RazorpayInvoice = {
  id: string;
  date: number | null;
  amount_paid: number;
  amount: number;
  status: string;
  short_url: string | null; // hosted invoice page — has the PDF download
  billing_start?: number | null; // period this charge covers (subscription invoices)
  billing_end?: number | null;
};

async function invoicesWhere(query: string): Promise<RazorpayInvoice[]> {
  const res = await fetch(`${API}/invoices?${query}&count=100`, { headers: { Authorization: authHeader() } });
  if (!res.ok) return [];
  return ((await res.json()) as { items?: RazorpayInvoice[] }).items ?? [];
}

// Every receipt for the workspace, newest first: all its subscriptions (by customer — survives
// upgrades, yearly switches and resubscribes), plus the current subscription in case it predates
// the customer record. Deduped by invoice id.
export async function listInvoices(ids: { customerId?: string | null; subscriptionId?: string | null }): Promise<RazorpayInvoice[]> {
  if (!isConfigured()) return [];
  const lists = await Promise.all([
    ids.customerId ? invoicesWhere(`customer_id=${encodeURIComponent(ids.customerId)}`) : [],
    ids.subscriptionId ? invoicesWhere(`subscription_id=${encodeURIComponent(ids.subscriptionId)}`) : [],
  ]);
  const byId = new Map(lists.flat().map((i) => [i.id, i]));
  return [...byId.values()].sort((a, b) => (b.date ?? 0) - (a.date ?? 0));
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

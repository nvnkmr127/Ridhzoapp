"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { startSubscriptionAction, verifySubscriptionAction, cancelSubscriptionAction, setPlanManuallyAction, checkCouponAction, saveGstDetailsAction } from "@/lib/actions/billing";
import { Check, X, Receipt, AlertTriangle, Tag, FileText, CalendarClock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PlanLimits } from "@/domains/billing/planService";

type Limits = Record<string, PlanLimits>;
type Invoice = { id: string; date: string | null; amount: number; status: string; url: string | null };
type BillingStatus = "paid" | "pending" | "grace_period" | "locked" | "free" | "trial";
type Cycle = "monthly" | "yearly";

declare global {
  interface Window { Razorpay?: any }
}

function loadCheckout(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.Razorpay) return resolve();
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Couldn't open the payment window. Check your internet and try again."));
    document.body.appendChild(s);
  });
}

const NAMES: Record<string, string> = { free: "Free", starter: "Starter", unlimited: "Unlimited" };
const ORDER = ["free", "starter", "unlimited"];
const fmt = (n: number) => (n === Infinity || n > 1e9 ? "Unlimited" : n.toLocaleString("en-IN"));
const day = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
const rupees = (n: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

export function BillingManager({
  plan, status, trialEndsAt, currentPeriodEnd, cancelAtPeriodEnd, configured, limits, invoices, prefill,
  yearlyAvailable = false, cycle: currentCycle = "monthly", scheduled = null, gst,
}: {
  yearlyAvailable?: boolean;
  cycle?: Cycle;
  scheduled?: { plan: string; startsAt: string } | null;
  gst: { billingName: string; gstin: string };
  plan: string;
  status: BillingStatus;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  configured: boolean;
  limits: Limits;
  invoices: Invoice[];
  prefill: { name: string; email: string; contact: string };
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [cycle, setCycle] = React.useState<Cycle>(yearlyAvailable ? currentCycle : "monthly");
  const [coupon, setCoupon] = React.useState("");
  const [couponMsg, setCouponMsg] = React.useState<{ ok: boolean; text: string } | null>(null);
  const [gstForm, setGstForm] = React.useState(gst);
  const [gstSaving, setGstSaving] = React.useState(false);

  async function applyCoupon(target = "starter") {
    if (!coupon.trim()) return setCouponMsg(null);
    const res = await checkCouponAction(coupon, target);
    setCouponMsg(res.ok ? { ok: true, text: res.data.message } : { ok: false, text: res.message });
  }

  async function saveGst(e: React.FormEvent) {
    e.preventDefault();
    setGstSaving(true);
    try {
      const res = await saveGstDetailsAction(gstForm);
      if (!res.ok) return toast({ variant: "destructive", title: "GST details not saved", description: res.message });
      toast({ title: "GST details saved", description: "They'll appear on your next invoice." });
    } finally {
      setGstSaving(false);
    }
  }

  const inTrial = status === "trial" && !!trialEndsAt;
  const trialDays = inTrial ? Math.max(1, Math.ceil((new Date(trialEndsAt!).getTime() - Date.now()) / 86_400_000)) : 0;
  const paymentProblem = status === "grace_period" || status === "locked";
  const paying = plan !== "free" && !inTrial;

  // Billing unconfigured (dev/testing): switch the plan directly, no payment. This path is refused
  // server-side once Razorpay is configured, so it's not a free-upgrade route in production.
  async function switchManually(target: string) {
    setBusy(target);
    try {
      const res = await setPlanManuallyAction(target);
      if (!res.ok) {
        toast({ variant: "destructive", title: "Could not switch plan", description: res.message });
        return;
      }
      toast({ title: "Plan switched", description: `You're now on ${NAMES[target] ?? target} (testing mode — no payment taken).` });
      router.refresh();
    } catch {
      toast({ variant: "destructive", title: "Could not switch plan", description: "We couldn't reach the server. Please try again." });
    } finally {
      setBusy(null);
    }
  }

  async function subscribe(target: string) {
    if (!configured) return switchManually(target);
    setBusy(target);
    try {
      const couponOk = couponMsg?.ok ? coupon.trim() : undefined;
      const startRes = await startSubscriptionAction({ plan: target, cycle, couponCode: couponOk, email: prefill.email, phone: prefill.contact });
      if (!startRes.ok) {
        toast({ variant: "destructive", title: "Could not start payment", description: startRes.message });
        setBusy(null);
        return;
      }
      const { subscriptionId, keyId, firstChargeAt } = startRes.data;
      await loadCheckout();
      const rzp = new window.Razorpay({
        key: keyId,
        subscription_id: subscriptionId,
        name: "Ridhzo",
        description: firstChargeAt
          ? `${NAMES[target] ?? target} — first charge on ${day(firstChargeAt)} when your trial ends`
          : `${NAMES[target] ?? target} plan — ${cycle === "yearly" ? "yearly" : "monthly"}`,
        prefill,
        theme: { color: "#0a0a0a" },
        handler: async (resp: any) => {
          try {
            const res = await verifySubscriptionAction({
              subscriptionId,
              paymentId: resp.razorpay_payment_id,
              signature: resp.razorpay_signature,
            });
            if (!res.ok) {
              toast({ variant: "destructive", title: "Payment received, plan not switched yet", description: `${res.message} It will update automatically within a few minutes.` });
              return;
            }
            toast({
              title: res.data.scheduled ? "Change booked ✅" : "Payment successful 🎉",
              description: res.data.scheduled && res.data.startsAt
                ? `You keep your current plan until ${day(res.data.startsAt)}, then move to ${NAMES[res.data.plan] ?? res.data.plan}.`
                : `You're now on ${NAMES[res.data.plan] ?? res.data.plan}.`,
            });
            router.refresh();
          } catch {
            toast({ variant: "destructive", title: "Payment received, plan not switched yet", description: "It will update automatically within a few minutes." });
          } finally {
            setBusy(null);
          }
        },
        modal: { ondismiss: () => setBusy(null) },
      });
      rzp.open();
    } catch (e: any) {
      toast({ variant: "destructive", title: "Could not start payment", description: e?.message });
      setBusy(null);
    }
  }

  async function cancel() {
    const msg = configured && currentPeriodEnd
      ? `Cancel your plan? You keep ${NAMES[plan] ?? plan} until ${day(currentPeriodEnd)}, then move to Free. Your leads stay safe.`
      : "Cancel your plan? You'll move to Free. Your leads stay safe.";
    if (!confirm(msg)) return;
    setBusy("cancel");
    try {
      const res = await cancelSubscriptionAction();
      if (!res.ok) {
        toast({ variant: "destructive", title: "Could not cancel", description: res.message });
        return;
      }
      toast({
        title: "Plan cancelled",
        description: res.data.atPeriodEnd
          ? `No more charges. You keep your plan${res.data.endsAt ? ` until ${day(res.data.endsAt)}` : " until the end of this month"}.`
          : "You're now on Free.",
      });
      router.refresh();
    } catch {
      toast({ variant: "destructive", title: "Could not cancel", description: "We couldn't reach the server. Please try again." });
    } finally {
      setBusy(null);
    }
  }

  // One line under the plan name that says exactly where the customer stands.
  const standing = scheduled && scheduled.plan !== plan
    ? `Switching to ${NAMES[scheduled.plan] ?? scheduled.plan} on ${day(scheduled.startsAt)} — you keep ${NAMES[plan] ?? plan} until then.`
    : scheduled
      ? `Subscribed — first charge on ${day(scheduled.startsAt)}.`
      : inTrial
    ? `Free trial — ${trialDays} day${trialDays === 1 ? "" : "s"} left (ends ${day(trialEndsAt!)}). Subscribe to keep ${NAMES[plan]} after that.`
    : paymentProblem
      ? "Your last payment didn't go through. Pay again below to keep your plan."
      : cancelAtPeriodEnd
        ? `Cancelled — you keep ${NAMES[plan] ?? plan} ${currentPeriodEnd ? `until ${day(currentPeriodEnd)}` : "until the end of this month"}, then move to Free.`
        : status === "pending"
          ? "Waiting for your payment to be confirmed."
          : paying && currentPeriodEnd
            ? `${currentCycle === "yearly" ? "Yearly plan — renews" : "Renews"} on ${day(currentPeriodEnd)}.`
            : plan === "free"
              ? "Upgrade any time — your leads and settings carry over."
              : "";

  return (
    <div className="space-y-6">
      {!configured && (
        <div className="rounded-lg border border-border bg-muted p-4 text-sm text-foreground">
          <span className="font-medium">Testing mode</span> — billing isn&apos;t configured, so plan switches apply instantly with no payment.
          Add <code>RAZORPAY_KEY_ID</code>, <code>RAZORPAY_KEY_SECRET</code>, <code>RAZORPAY_WEBHOOK_SECRET</code>, <code>RAZORPAY_PLAN_STARTER</code> and{" "}
          <code>RAZORPAY_PLAN_UNLIMITED</code> to enable real checkout.
        </div>
      )}

      <div className={`rounded-2xl border p-6 ${paymentProblem ? "border-destructive/40 bg-destructive/5" : "bg-card"}`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-sm text-muted-foreground">Your plan</div>
            <div className="text-2xl font-bold">{NAMES[plan] ?? plan}{inTrial && <span className="ml-2 text-sm font-medium text-primary">Trial</span>}</div>
            {standing && (
              <p className={`mt-1 flex items-center gap-1.5 text-sm ${paymentProblem ? "text-destructive" : "text-muted-foreground"}`}>
                {paymentProblem && <AlertTriangle className="h-4 w-4 shrink-0" />}
                {standing}
              </p>
            )}
          </div>
          {paying && !cancelAtPeriodEnd && !paymentProblem && (
            <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={cancel} disabled={busy === "cancel"}>
              {busy === "cancel" ? "Cancelling…" : "Cancel plan"}
            </Button>
          )}
        </div>
      </div>

      {yearlyAvailable && (
        <div className="flex items-center justify-center gap-3">
          <div role="radiogroup" aria-label="Billing period" className="inline-flex rounded-full border border-border p-1">
            {(["monthly", "yearly"] as const).map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={cycle === c}
                onClick={() => setCycle(c)}
                className={`rounded-full px-4 py-1.5 text-sm ${cycle === c ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
              >
                {c === "monthly" ? "Monthly" : "Yearly"}
              </button>
            ))}
          </div>
          <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600">Yearly: 2 months free</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {ORDER.filter((name) => limits[name]).map((name) => {
          const l = limits[name];
          const isPlan = name === plan;
          const otherCycle = isPlan && paying && !inTrial && cycle !== currentCycle;
          // During the trial the Starter card must be buyable — "Current plan" there blocked every trial conversion.
          const canBuy = name !== "free" && (!isPlan || inTrial || paymentProblem || cancelAtPeriodEnd || otherCycle);
          const popular = name === "starter";
          const features: [boolean, string][] = [
            [true, `${fmt(l.leads)} leads`],
            [true, `${fmt(l.seats)} ${l.seats === 1 ? "user" : "users"}`],
            [true, `${fmt(l.aiCredits)} AI credits a month`],
            [true, `${fmt(l.automations)} automations`],
            [true, `${fmt(l.sequences)} follow-up sequences`],
            [true, `${fmt(l.sources)} lead ${l.sources === 1 ? "source" : "sources"}`],
            [l.aiAutoTag, "AI spots hot replies for you"],
            [!l.branding, "No Ridhzo branding on your forms"],
          ];
          const label = isPlan
            ? inTrial ? `Keep ${NAMES[name]} — subscribe`
              : paymentProblem ? "Pay now"
              : cancelAtPeriodEnd ? "Resubscribe"
              : otherCycle ? `Switch to ${cycle} billing`
              : "Current plan"
            : ORDER.indexOf(name) > ORDER.indexOf(plan) ? `Upgrade to ${NAMES[name]}` : `Switch to ${NAMES[name]}`;
          return (
            <div key={name} className={`relative rounded-2xl border p-5 space-y-4 ${isPlan ? "ring-2 ring-primary" : popular ? "border-primary/40 bg-card" : "bg-card"}`}>
              {popular && !isPlan && (
                <span className="absolute -top-2.5 left-5 rounded-full bg-primary px-2 py-0.5 text-[11px] font-medium text-primary-foreground">Most popular</span>
              )}
              <div className="space-y-1">
                <div className="flex items-baseline justify-between">
                  <div className="font-semibold text-lg">{NAMES[name] ?? name}</div>
                  <div className="text-right">
                    <div className="text-base font-bold">{cycle === "yearly" && l.yearlyPrice ? l.yearlyPrice : l.price}</div>
                    {name !== "free" && <div className="text-[11px] text-muted-foreground">incl. GST</div>}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">{l.description}</p>
              </div>
              <ul className="text-sm space-y-1.5">
                {features.map(([on, text]) => (
                  <li key={text} className={`flex items-center gap-2 ${on ? "" : "text-muted-foreground line-through"}`}>
                    {on ? <Check className="h-4 w-4 shrink-0 text-emerald-600" /> : <X className="h-4 w-4 shrink-0 text-muted-foreground" />}
                    {text}
                  </li>
                ))}
              </ul>
              {name === "free" ? (
                isPlan ? (
                  <Button className="w-full" disabled variant="secondary">Current plan</Button>
                ) : paying && !cancelAtPeriodEnd ? (
                  <Button className="w-full" variant="outline" onClick={cancel} disabled={busy === "cancel"}>Move to Free</Button>
                ) : null
              ) : (
                <Button
                  className="w-full"
                  variant={isPlan && !canBuy ? "secondary" : "default"}
                  disabled={!canBuy || busy !== null}
                  onClick={() => subscribe(name)}
                >
                  {busy === name ? "Opening payment…" : label}
                </Button>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Tag className="h-4 w-4 text-muted-foreground" />
        <Input
          value={coupon}
          onChange={(e) => { setCoupon(e.target.value.toUpperCase()); setCouponMsg(null); }}
          onBlur={() => applyCoupon(plan === "free" ? "starter" : plan)}
          placeholder="Have a promo code?"
          aria-label="Promo code"
          className="h-9 max-w-[200px] font-mono uppercase"
        />
        <Button type="button" variant="outline" size="sm" onClick={() => applyCoupon(plan === "free" ? "starter" : plan)} disabled={!coupon.trim()}>
          Apply
        </Button>
        {couponMsg && <span className={`text-sm ${couponMsg.ok ? "text-emerald-600" : "text-destructive"}`}>{couponMsg.text}</span>}
      </div>

      <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
        <CalendarClock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Pay by UPI, debit/credit card or net banking. Renews automatically — cancel any time and keep your plan until the period you paid for ends.
        Switching to a smaller plan starts when your current period ends, so you never pay twice.
      </p>

      <form onSubmit={saveGst} className="rounded-2xl border bg-card p-6 space-y-3">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-muted-foreground" />
          <h3 className="font-semibold">GST details for invoices</h3>
          <span className="text-xs text-muted-foreground">(optional — to claim GST input credit)</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="billing-name">Registered business name</Label>
            <Input id="billing-name" value={gstForm.billingName} onChange={(e) => setGstForm((s) => ({ ...s, billingName: e.target.value }))} placeholder="As on your GST certificate" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="gstin">GSTIN</Label>
            <Input id="gstin" value={gstForm.gstin} maxLength={15} onChange={(e) => setGstForm((s) => ({ ...s, gstin: e.target.value.toUpperCase() }))} placeholder="36ABCDE1234F1Z5" className="font-mono uppercase" />
          </div>
        </div>
        <div className="flex justify-end">
          <Button type="submit" size="sm" disabled={gstSaving}>{gstSaving ? "Saving…" : "Save GST details"}</Button>
        </div>
      </form>

      <div className="rounded-2xl border bg-card p-6 space-y-3">
        <div className="flex items-center gap-2">
          <Receipt className="h-4 w-4 text-muted-foreground" />
          <h3 className="font-semibold">Payment history</h3>
        </div>
        {invoices.length === 0 ? (
          <p className="text-sm text-muted-foreground">No payments yet. Receipts for every payment appear here.</p>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {invoices.map((inv) => (
              <li key={inv.id} className="flex items-center justify-between gap-3 py-2">
                <span>{inv.date ? day(inv.date) : "—"}</span>
                <span className="font-medium tabular-nums">{rupees(inv.amount)}</span>
                <span className="capitalize text-muted-foreground">{inv.status}</span>
                {inv.url ? (
                  <a href={inv.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">Receipt</a>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { startSubscriptionAction, verifySubscriptionAction, cancelSubscriptionAction, setPlanManuallyAction } from "@/lib/actions/billing";
import { Check } from "lucide-react";

type Limits = Record<string, { seats: number; leads: number; price?: string; description?: string }>;

declare global {
  interface Window { Razorpay?: any }
}

function loadCheckout(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.Razorpay) return resolve();
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Failed to load Razorpay checkout"));
    document.body.appendChild(s);
  });
}

const fmt = (n: number) => (n === null || n === Infinity || n > 1e9 ? "Unlimited" : n.toLocaleString());

export function BillingManager({
  plan, planStatus, currentPeriodEnd, configured, limits,
}: {
  plan: string; planStatus: string; currentPeriodEnd: Date | null; configured: boolean; limits: Limits;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [current, setCurrent] = React.useState(plan);

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
      setCurrent(target);
      toast({ title: "Plan switched", description: `You're now on the ${target} plan (testing mode — no payment taken).` });
    } catch {
      toast({ variant: "destructive", title: "Could not switch plan", description: "We couldn't reach the server. Please try again." });
    } finally {
      setBusy(null);
    }
  }

  async function upgrade(target: string) {
    if (!configured) {
      await switchManually(target);
      return;
    }
    setBusy(target);
    try {
      const startRes = await startSubscriptionAction(target);
      if (!startRes.ok) {
        toast({ variant: "destructive", title: "Could not start checkout", description: startRes.message });
        setBusy(null);
        return;
      }
      const { subscriptionId, keyId } = startRes.data;
      await loadCheckout();
      const rzp = new window.Razorpay({
        key: keyId,
        subscription_id: subscriptionId,
        name: "Ridhzo",
        description: `${target} plan`,
        handler: async (resp: any) => {
          try {
            const res = await verifySubscriptionAction({
              plan: target,
              subscriptionId,
              paymentId: resp.razorpay_payment_id,
              signature: resp.razorpay_signature,
            });
            if (!res.ok) {
              toast({ variant: "destructive", title: "Verification failed", description: res.message });
              return;
            }
            setCurrent(target);
            toast({ title: "Subscription active", description: `You're now on the ${target} plan.` });
          } catch {
            toast({ variant: "destructive", title: "Verification failed", description: "We couldn't reach the server. Please try again." });
          }
        },
        modal: { ondismiss: () => setBusy(null) },
      });
      rzp.open();
    } catch (e: any) {
      toast({ variant: "destructive", title: "Could not start checkout", description: e?.message });
    } finally {
      setBusy(null);
    }
  }

  async function cancel() {
    if (!confirm("Cancel your subscription? You'll drop to the free plan.")) return;
    setBusy("cancel");
    try {
      const res = await cancelSubscriptionAction();
      if (!res.ok) {
        toast({ variant: "destructive", title: "Could not cancel", description: res.message });
        return;
      }
      setCurrent("free");
      toast({ title: "Subscription cancelled" });
    } catch {
      toast({ variant: "destructive", title: "Could not cancel", description: "We couldn't reach the server. Please try again." });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      {!configured && (
        <div className="rounded-lg border border-border bg-muted p-4 text-sm text-foreground">
          <span className="font-medium">Testing mode</span> — billing isn’t configured, so plan switches apply instantly with no payment.
          Add <code>RAZORPAY_KEY_ID</code>, <code>RAZORPAY_KEY_SECRET</code>, <code>RAZORPAY_WEBHOOK_SECRET</code>, and a plan id per tier to enable real checkout.
        </div>
      )}

      <div className="rounded-2xl border bg-card p-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-muted-foreground">Current plan</div>
            <div className="text-2xl font-bold capitalize">{current} <Badge variant={planStatus === "active" ? "default" : "secondary"}>{planStatus}</Badge></div>
            {currentPeriodEnd && (
              <div suppressHydrationWarning className="text-xs text-muted-foreground mt-1">
                Renews {new Date(currentPeriodEnd).toLocaleDateString()}
              </div>
            )}
          </div>
          {current !== "free" && <Button variant="outline" onClick={cancel} disabled={busy === "cancel"}>Cancel plan</Button>}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {Object.entries(limits).map(([name, l]) => {
          const isCurrent = name === current;
          const paid = name !== "free";
          return (
            <div key={name} className={`rounded-2xl border p-5 space-y-3 ${isCurrent ? "border-border ring-1 ring-ring" : "bg-card"}`}>
              <div className="space-y-1">
                <div className="flex items-baseline justify-between">
                  <div className="font-semibold capitalize text-lg">{name}</div>
                  {l.price && <div className="text-base font-bold text-foreground">{l.price}</div>}
                </div>
                {l.description && <p className="text-xs text-muted-foreground">{l.description}</p>}
              </div>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li className="flex items-center gap-2"><Check className="h-4 w-4 text-muted-foreground" /> {fmt(l.seats)} seats</li>
                <li className="flex items-center gap-2"><Check className="h-4 w-4 text-muted-foreground" /> {fmt(l.leads)} leads</li>
              </ul>
              {isCurrent ? (
                <Button className="w-full" disabled variant="secondary">Current plan</Button>
              ) : paid ? (
                <Button className="w-full" onClick={() => upgrade(name)} disabled={busy === name}>
                  {busy === name ? "Starting…" : `Switch to ${name}`}
                </Button>
              ) : (
                <Button className="w-full" variant="outline"
                  onClick={() => (configured ? cancel() : switchManually("free"))}
                  disabled={busy === "cancel" || busy === "free"}>Downgrade</Button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

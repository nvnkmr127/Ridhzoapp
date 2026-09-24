import { requireOrg } from "@/lib/rbac";
import { BillingLifecycleService, type TenantBillingInfo } from "@/domains/billing/lifecycleService";
import { AlertTriangle, ShieldAlert, ArrowRight, Sparkles } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

// Trial countdown + "almost out of leads" nudge share one slim banner style.
function NudgeBanner({ label, title, detail, cta }: { label: string; title: string; detail: string; cta: string }) {
  return (
    <aside aria-label={label} className="border-b border-primary/20 bg-primary/5 px-4 py-2 text-foreground sm:px-6">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs sm:text-sm">
          <Sparkles className="h-4 w-4 shrink-0 text-primary" />
          <span className="font-semibold">{title}</span>
          <span className="hidden text-muted-foreground sm:inline">— {detail}</span>
        </div>
        <Button asChild size="sm" className="h-8 shrink-0 gap-1.5 px-3.5 text-xs">
          <Link href="/settings/billing">
            {cta} <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </Button>
      </div>
    </aside>
  );
}

export async function PaymentGraceBanner({
  billingInfo: initialBilling,
  leads,
}: {
  billingInfo?: TenantBillingInfo | null;
  leads?: { current: number; max: number };
} = {}) {
  let billing = initialBilling;
  if (billing === undefined) {
    let orgId: string;
    try {
      const auth = await requireOrg();
      orgId = auth.organizationId;
    } catch {
      return null;
    }
    billing = await BillingLifecycleService.getTenantBillingStatus(orgId);
  }
  if (!billing) return null;

  // Check if automatically downgraded due to 2+ payment failures
  const isDowngraded = (billing.failureCount ?? 0) >= 2 || (billing.planStatus === "halted" && billing.plan === "free");

  if (isDowngraded) {
    return (
      <aside
        aria-label="Subscription Downgraded Notice"
        className="border-b border-destructive/30 bg-destructive/10 px-4 py-2.5 text-foreground transition-all sm:px-6"
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-xl border border-destructive/20 bg-destructive/20 flex items-center justify-center shadow-sm">
              <ShieldAlert className="h-5 w-5 text-destructive" />
            </div>
            <div className="text-xs sm:text-sm">
              <span className="font-semibold text-destructive">Subscription Payment Failed (2x) — Account Downgraded</span>
              <span className="hidden text-muted-foreground sm:inline">
                {" "}
                — Your subscription failed renewal twice and has been downgraded to the Free tier. Advanced features are restricted.
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              asChild
              size="sm"
              className="h-8 gap-1.5 bg-destructive text-destructive-foreground px-3.5 text-xs font-medium hover:bg-destructive/90 shadow-sm"
            >
              <Link href="/settings/billing">
                Reactivate Plan <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
        </div>
      </aside>
    );
  }

  if (billing.status === "trial" && billing.trialEndsAt) {
    const days = Math.max(1, Math.ceil((new Date(billing.trialEndsAt).getTime() - Date.now()) / 86_400_000));
    return (
      <NudgeBanner
        label="Trial countdown"
        title={`${days} day${days === 1 ? "" : "s"} left in your free Starter trial`}
        detail="Keep AI replies, automations and all your lead sources running after the trial."
        cta="Keep Starter"
      />
    );
  }

  // Nudge before the lead cap blocks new leads (at 80%+ of a finite cap).
  if (leads && leads.max !== Infinity && leads.current >= leads.max * 0.8) {
    const full = leads.current >= leads.max;
    return (
      <NudgeBanner
        label="Lead limit"
        title={full ? `You've reached your ${leads.max} lead limit` : `${leads.current} of ${leads.max} leads used`}
        detail={full ? "New leads can't be added until you upgrade." : "Upgrade before you hit the limit so no new lead is missed."}
        cta="Upgrade"
      />
    );
  }

  if (billing.status === "paid" || billing.status === "free" || billing.status === "pending") {
    return null;
  }

  if (billing.status === "grace_period") {
    return (
      <aside
        aria-label="Payment Renewal Failed Banner"
        className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-foreground transition-all sm:px-6"
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-xl border border-amber-500/20 bg-amber-500/20 flex items-center justify-center shadow-sm">
              <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="text-xs sm:text-sm">
              <span className="font-semibold text-amber-900 dark:text-amber-200">
                Payment Renewal Failed — {billing.daysRemainingInGrace} Day{billing.daysRemainingInGrace === 1 ? "" : "s"} Grace Period
              </span>
              <span className="hidden text-muted-foreground sm:inline">
                {" "}
                — Update your payment method to prevent automatic downgrade to the Free tier after 2 failed attempts.
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              asChild
              size="sm"
              className="h-8 gap-1.5 bg-amber-600 text-white px-3.5 text-xs font-medium hover:bg-amber-500 shadow-sm dark:bg-amber-500 dark:hover:bg-amber-400"
            >
              <Link href="/settings/billing">
                Update Payment <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
        </div>
      </aside>
    );
  }

  if (billing.status === "locked") {
    return (
      <aside
        aria-label="Subscription Delinquent Banner"
        className="border-b border-destructive/30 bg-destructive/10 px-4 py-2.5 text-foreground transition-all sm:px-6"
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-xl border border-destructive/20 bg-destructive/20 flex items-center justify-center shadow-sm">
              <ShieldAlert className="h-5 w-5 text-destructive" />
            </div>
            <div className="text-xs sm:text-sm">
              <span className="font-semibold text-destructive">Subscription Overdue & Locked</span>
              <span className="hidden text-muted-foreground sm:inline">
                {" "}
                — Grace period has expired. Advanced features (AI Copilot, Sequences, Automations) are locked. Existing leads are safe and read-only.
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              asChild
              size="sm"
              className="h-8 gap-1.5 bg-destructive text-destructive-foreground px-3.5 text-xs font-medium hover:bg-destructive/90 shadow-sm"
            >
              <Link href="/settings/billing">
                Reactivate Subscription <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
        </div>
      </aside>
    );
  }

  return null;
}

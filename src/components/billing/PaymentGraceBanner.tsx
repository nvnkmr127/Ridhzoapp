import { requireOrg } from "@/lib/rbac";
import { BillingLifecycleService } from "@/domains/billing/lifecycleService";
import { AlertTriangle, Lock, ArrowRight } from "lucide-react";
import Link from "next/link";

export async function PaymentGraceBanner() {
  let orgId: string;
  try {
    const auth = await requireOrg();
    orgId = auth.organizationId;
  } catch {
    return null;
  }

  const billing = await BillingLifecycleService.getTenantBillingStatus(orgId);
  if (!billing || billing.status === "paid" || billing.status === "free" || billing.status === "pending") {
    return null;
  }

  if (billing.status === "grace_period") {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2 text-xs sm:text-sm bg-amber-500/15 border-b border-amber-500/30 text-amber-900 dark:text-amber-200">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <span>
            <strong>Payment renewal failed:</strong> Grace period active ({billing.daysRemainingInGrace} day{billing.daysRemainingInGrace === 1 ? "" : "s"} left before feature lock).
            {billing.failureReason ? ` (${billing.failureReason})` : ""}
          </span>
        </div>
        <Link
          href="/settings?tab=billing"
          className="inline-flex items-center gap-1 font-semibold text-amber-700 hover:text-amber-800 dark:text-amber-300 dark:hover:text-amber-200 underline underline-offset-2"
        >
          Update Payment Method <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
    );
  }

  if (billing.status === "locked") {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 text-xs sm:text-sm bg-destructive/15 border-b border-destructive/30 text-destructive dark:text-red-300">
        <div className="flex items-center gap-2">
          <Lock className="h-4 w-4 shrink-0 text-destructive" />
          <span>
            <strong>Subscription Delinquent:</strong> Grace period has expired. Advanced features (AI Copilot, Sequences, Automations) are locked. Existing leads are safe and read-only.
          </span>
        </div>
        <Link
          href="/settings?tab=billing"
          className="inline-flex items-center gap-1 font-semibold text-destructive hover:underline dark:text-red-200 underline-offset-2"
        >
          Renew Subscription <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
    );
  }

  return null;
}

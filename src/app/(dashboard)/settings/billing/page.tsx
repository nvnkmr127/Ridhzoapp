import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requireOrg, hasPermission } from "@/lib/rbac";
import { BillingService } from "@/domains/billing/service";
import { PLAN_LIMITS } from "@/domains/billing/planService";
import { isConfigured } from "@/lib/billing/razorpay";
import { BillingManager } from "@/components/settings/BillingManager";

export default async function BillingPage() {
  if (!(await hasPermission("billing.manage"))) redirect("/leads");
  const { organizationId } = await requireOrg();
  const billing = await BillingService.get(organizationId);

  return (
    <div className="flex-1 space-y-6 p-4 pt-4 sm:p-8 sm:pt-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <Link href="/settings"><Button variant="ghost" size="icon" aria-label="Go back"><ArrowLeft className="h-5 w-5" /></Button></Link>
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Billing & Plan</h2>
          <p className="text-sm text-muted-foreground">Manage your subscription. Payments are processed by Razorpay.</p>
        </div>
      </div>
      <BillingManager
        plan={billing?.plan ?? "free"}
        planStatus={billing?.planStatus ?? "active"}
        currentPeriodEnd={billing?.currentPeriodEnd ?? null}
        configured={isConfigured()}
        limits={PLAN_LIMITS}
      />
    </div>
  );
}

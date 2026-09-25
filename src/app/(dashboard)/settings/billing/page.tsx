import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { eq } from "drizzle-orm";
import { Button } from "@/components/ui/button";
import { requireOrg, hasPermission } from "@/lib/rbac";
import { BillingService } from "@/domains/billing/service";
import { BillingLifecycleService } from "@/domains/billing/lifecycleService";
import { PLAN_LIMITS } from "@/domains/billing/planService";
import { isConfigured, yearlyAvailable } from "@/lib/billing/razorpay";
import { BillingManager } from "@/components/settings/BillingManager";
import { db } from "@/db";
import { users } from "@/db/schema";
import { isPlaceholderEmail } from "@/lib/auth/googleLink";

// Old plan names still stored on some workspaces.
const CANONICAL: Record<string, string> = { pro: "starter", business: "unlimited" };

export default async function BillingPage() {
  if (!(await hasPermission("billing.manage"))) redirect("/leads");
  const { organizationId, userId } = await requireOrg();
  const [billing, status, invoices, [me], { cycle, scheduled }] = await Promise.all([
    BillingService.get(organizationId),
    BillingLifecycleService.getTenantBillingStatus(organizationId),
    BillingService.invoices(organizationId),
    db.select({ firstName: users.firstName, lastName: users.lastName, email: users.email, phone: users.phone }).from(users).where(eq(users.id, userId)).limit(1),
    BillingService.subscriptionInfo(organizationId),
  ]);
  const plan = billing?.plan ?? "free";

  return (
    <div className="flex-1 space-y-6 p-4 pt-4 sm:p-8 sm:pt-6 max-w-5xl">
      <div className="flex items-center gap-3">
        <Link href="/settings"><Button variant="ghost" size="icon" aria-label="Go back"><ArrowLeft className="h-5 w-5" /></Button></Link>
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Plan & billing</h2>
          <p className="text-sm text-muted-foreground">Pay monthly by UPI, card or net banking. Cancel any time.</p>
        </div>
      </div>
      <BillingManager
        plan={CANONICAL[plan] ?? plan}
        status={status?.status ?? "free"}
        trialEndsAt={billing?.trialEndsAt ? new Date(billing.trialEndsAt).toISOString() : null}
        currentPeriodEnd={billing?.currentPeriodEnd ? new Date(billing.currentPeriodEnd).toISOString() : null}
        cancelAtPeriodEnd={billing?.cancelAtPeriodEnd === 1}
        configured={isConfigured()}
        yearlyAvailable={isConfigured() && yearlyAvailable()}
        cycle={cycle ?? "monthly"}
        scheduled={scheduled}
        gst={{ billingName: billing?.billingName ?? "", gstin: billing?.gstin ?? "" }}
        limits={PLAN_LIMITS}
        invoices={invoices.map((i) => ({
          id: i.id,
          date: i.date ? new Date(i.date * 1000).toISOString() : null,
          amount: (i.amount_paid || i.amount) / 100,
          status: i.status,
          url: i.short_url,
        }))}
        prefill={{
          name: [me?.firstName, me?.lastName].filter(Boolean).join(" "),
          // Phone-signup accounts carry a synthetic email — don't prefill checkout with it.
          email: me?.email && !isPlaceholderEmail(me.email) ? me.email : "",
          contact: me?.phone ?? "",
        }}
      />
    </div>
  );
}

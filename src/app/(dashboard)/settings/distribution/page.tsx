import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requireOrg, hasPermission } from "@/lib/rbac";
import { LeadDistributionService } from "@/domains/integrations/leadDistributionService";
import { LeadDistributionManager } from "@/components/settings/LeadDistributionManager";

export default async function DistributionPage() {
  if (!(await hasPermission("api.manage"))) redirect("/leads");
  const { organizationId } = await requireOrg();
  const recipients = await LeadDistributionService.list(organizationId);

  return (
    <div className="flex-1 space-y-6 p-4 pt-4 sm:p-8 sm:pt-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <Link href="/settings"><Button variant="ghost" size="icon" aria-label="Go back"><ArrowLeft className="h-5 w-5" /></Button></Link>
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Lead Distribution</h2>
          <p className="text-sm text-muted-foreground">
            Forward a copy of every new lead to one or more recipients so nobody misses a lead.
          </p>
        </div>
      </div>
      <LeadDistributionManager initial={recipients} />
    </div>
  );
}

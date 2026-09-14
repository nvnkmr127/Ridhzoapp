import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requireOrg, hasPermission } from "@/lib/rbac";
import { TenantIntegrationsService } from "@/domains/organizations/tenantIntegrationsService";
import { LeadIntelligenceManager } from "@/components/settings/LeadIntelligenceManager";

export default async function LeadIntelligencePage() {
  if (!(await hasPermission("settings.manage"))) redirect("/leads");
  const { organizationId } = await requireOrg();
  const settings = await TenantIntegrationsService.getView(organizationId);

  return (
    <div className="flex-1 space-y-6 p-4 pt-4 sm:p-8 sm:pt-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <Link href="/settings"><Button variant="ghost" size="icon" aria-label="Go back"><ArrowLeft className="h-5 w-5" /></Button></Link>
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Lead Intelligence</h2>
          <p className="text-sm text-muted-foreground">
            Enrich new leads from your own data provider and pull inbound email onto the lead timeline.
          </p>
        </div>
      </div>
      <LeadIntelligenceManager initial={settings} />
    </div>
  );
}

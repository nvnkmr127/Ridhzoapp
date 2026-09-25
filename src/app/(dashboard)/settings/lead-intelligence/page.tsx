import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requireOrg, hasPermission } from "@/lib/rbac";
import { TenantIntegrationsService } from "@/domains/organizations/tenantIntegrationsService";
import { CustomStatusSchemaService } from "@/domains/leads/customStatusSchemaService";
import { appUrl } from "@/lib/mail/mailer";
import { LeadIntelligenceManager } from "@/components/settings/LeadIntelligenceManager";

export default async function LeadIntelligencePage() {
  if (!(await hasPermission("settings.manage"))) redirect("/leads");
  const { organizationId } = await requireOrg();
  const [settings, statuses] = await Promise.all([
    TenantIntegrationsService.getView(organizationId),
    CustomStatusSchemaService.getTenantStatusSchema(organizationId).catch(() => []),
  ]);

  return (
    <div className="flex-1 space-y-6 p-4 pt-4 sm:p-8 sm:pt-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <Link href="/settings"><Button variant="ghost" size="icon" aria-label="Go back"><ArrowLeft className="h-5 w-5" /></Button></Link>
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Lead Intelligence</h2>
          <p className="text-sm text-muted-foreground">
            Enrich new leads from your data provider, log email replies on the lead timeline, and
            send conversions back to Meta ads.
          </p>
        </div>
      </div>
      <LeadIntelligenceManager
        initial={settings}
        // Built on the server so SSR and the client render the same URL (no hydration mismatch).
        webhookBase={appUrl("/api/webhooks/email")}
        statuses={statuses.map((s) => ({ key: s.key, label: s.label }))}
      />
    </div>
  );
}

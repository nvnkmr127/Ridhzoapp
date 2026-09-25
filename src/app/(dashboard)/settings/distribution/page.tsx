import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requireOrg, hasPermission } from "@/lib/rbac";
import { LeadDistributionService } from "@/domains/integrations/leadDistributionService";
import { LeadSourceService } from "@/domains/leads/sourceService";
import { UserService } from "@/domains/users/service";
import { CustomFieldService } from "@/domains/customFields/service";
import { isConfigured as whatsappApiConfigured } from "@/lib/messaging/whatsapp/client";
import { LeadDistributionManager } from "@/components/settings/LeadDistributionManager";

export default async function DistributionPage() {
  if (!(await hasPermission("api.manage"))) redirect("/leads");
  const { organizationId } = await requireOrg();
  const [rules, sources, orgUsers, deliveryCounts, customFields] = await Promise.all([
    LeadDistributionService.list(organizationId),
    LeadSourceService.getSources(organizationId),
    UserService.list(organizationId),
    LeadDistributionService.deliveryCounts(organizationId),
    CustomFieldService.listCached(organizationId),
  ]);
  // Only active team members can receive in-app alerts (deactivated users are skipped at send time).
  const users = orgUsers
    .filter((u) => u.isActive !== false)
    .map((u) => ({
      id: u.id,
      name: [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email || "Unnamed user",
    }));
  // WhatsApp forwarding needs the BSP plus an approved template; hide the channel until both exist.
  const whatsappReady = whatsappApiConfigured() && !!process.env.WATXIO_LEAD_FORWARD_TEMPLATE;

  return (
    <div className="flex-1 space-y-6 p-4 pt-4 sm:p-8 sm:pt-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <Link href="/settings"><Button variant="ghost" size="icon" aria-label="Go back"><ArrowLeft className="h-5 w-5" /></Button></Link>
        <div>
          <h2 className="text-2xl font-bold tracking-tight">New-lead alerts</h2>
          <p className="text-sm text-muted-foreground">
            Send an alert about each new lead to people by email, in-app notification or WhatsApp.
            This doesn&apos;t change who owns the lead — to assign owners automatically, set it up in{" "}
            <Link href="/settings/sources" className="underline underline-offset-2">Where leads come from</Link>.
          </p>
        </div>
      </div>
      <LeadDistributionManager
        initial={rules}
        sources={sources.map((s) => ({ id: s.id, name: s.name }))}
        users={users}
        customFields={customFields.map((f) => ({ key: f.key, label: f.label }))}
        deliveryCounts={deliveryCounts}
        whatsappReady={whatsappReady}
      />
    </div>
  );
}

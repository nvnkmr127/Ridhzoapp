import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requireOrg, hasPermission } from "@/lib/rbac";
import { WebhookEndpointService } from "@/domains/integrations/webhookEndpointService";
import { WebhookDlqService } from "@/domains/leads/webhookDlqService";
import { WebhooksManager } from "@/components/settings/WebhooksManager";

export default async function WebhooksPage() {
  if (!(await hasPermission("api.manage"))) redirect("/leads");
  const { organizationId } = await requireOrg();
  const [endpoints, stats] = await Promise.all([
    WebhookEndpointService.list(organizationId),
    WebhookDlqService.getDeliveryStats(organizationId),
  ]);

  return (
    <div className="flex-1 space-y-6 p-4 pt-4 sm:p-8 sm:pt-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <Link href="/settings"><Button variant="ghost" size="icon" aria-label="Go back"><ArrowLeft className="h-5 w-5" /></Button></Link>
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Outbound Webhooks</h2>
          <p className="text-sm text-muted-foreground">
            Get a signed POST to your own URL when leads are created or change status.
          </p>
        </div>
      </div>
      <WebhooksManager initial={endpoints} dlqCount={stats.failed} stats={stats} />
    </div>
  );
}

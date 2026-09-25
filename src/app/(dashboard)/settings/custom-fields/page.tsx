import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requireOrg, hasPermission } from "@/lib/rbac";
import { CustomFieldService } from "@/domains/customFields/service";
import { CustomFieldsManager } from "@/components/settings/CustomFieldsManager";

export default async function CustomFieldsPage() {
  if (!(await hasPermission("settings.manage"))) redirect("/leads");
  const { organizationId } = await requireOrg();
  const fields = await CustomFieldService.list(organizationId);

  return (
    <div className="flex-1 space-y-6 p-4 pt-4 sm:p-8 sm:pt-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <Link href="/settings"><Button variant="ghost" size="icon" aria-label="Go back"><ArrowLeft className="h-5 w-5" /></Button></Link>
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Custom fields</h2>
          <p className="text-sm text-muted-foreground">Extra fields captured on every lead, specific to your business.</p>
        </div>
      </div>
      <CustomFieldsManager initial={fields} />
    </div>
  );
}

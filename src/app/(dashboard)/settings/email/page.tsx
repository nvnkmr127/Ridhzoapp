import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requireOrg, hasPermission } from "@/lib/rbac";
import { EmailSettingsService } from "@/domains/organizations/emailSettingsService";
import { EmailSettingsManager } from "@/components/settings/EmailSettingsManager";

export default async function EmailSettingsPage() {
  if (!(await hasPermission("settings.manage"))) redirect("/leads");
  const { organizationId } = await requireOrg();
  const settings = await EmailSettingsService.getView(organizationId);

  return (
    <div className="flex-1 space-y-6 p-4 pt-4 sm:p-8 sm:pt-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <Link href="/settings"><Button variant="ghost" size="icon" aria-label="Go back"><ArrowLeft className="h-5 w-5" /></Button></Link>
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Email sending</h2>
          <p className="text-sm text-muted-foreground">
            Send emails to your leads from your own mail server (SMTP), so they come from your address.
          </p>
        </div>
      </div>
      <EmailSettingsManager initial={settings} />
    </div>
  );
}

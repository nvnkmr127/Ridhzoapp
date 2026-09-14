import { redirect } from "next/navigation";
import { isSuperAdmin } from "@/lib/rbac";
import { PlatformService } from "@/domains/platform/service";
import { PlatformConsole } from "@/components/platform/PlatformConsole";

// Platform operator console — every organization on the instance. Super-admin only.
export default async function AdminPage() {
  if (!(await isSuperAdmin())) redirect("/leads");
  const orgs = await PlatformService.listOrganizations();

  return (
    <div className="flex-1 space-y-6 p-4 pt-4 sm:p-8 sm:pt-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Platform Admin</h2>
        <p className="text-sm text-muted-foreground">
          {orgs.length} organization{orgs.length === 1 ? "" : "s"} · manage plans, suspension, and impersonation.
        </p>
      </div>
      <PlatformConsole initial={orgs} />
    </div>
  );
}

import Link from "next/link";
import { ArrowLeft, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requireOrg, hasPermission } from "@/lib/rbac";
import { DedupService } from "@/domains/leads/dedupService";
import { OrgService } from "@/domains/organizations/service";
import { DuplicatesManager } from "@/components/leads/DuplicatesManager";
import { AutoMergeToggle } from "@/components/leads/AutoMergeToggle";

export default async function DuplicatesPage() {
  const [canMerge, isAdmin] = await Promise.all([
    hasPermission("leads.merge"),
    hasPermission("settings.manage"),
  ]);

  if (!canMerge && !isAdmin) {
    return (
      <div className="flex-1 space-y-6 p-4 pt-4 sm:p-8 sm:pt-6 max-w-2xl">
        <div className="flex items-center gap-3">
          <Link href="/leads">
            <Button variant="ghost" size="icon" aria-label="Go back"><ArrowLeft className="h-5 w-5" /></Button>
          </Link>
          <h2 className="text-2xl font-bold tracking-tight">Duplicate Leads</h2>
        </div>
        <div className="rounded-2xl border border-border bg-card p-6 text-center space-y-4">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-lg font-semibold">Access Restricted</h3>
            <p className="text-sm text-muted-foreground mt-1">
              You do not have permission to merge duplicate leads for this workspace. Contact an administrator for access.
            </p>
          </div>
          <div className="pt-2">
            <Link href="/leads">
              <Button variant="outline">Return to Leads</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const { organizationId } = await requireOrg();
  const [groups, org] = await Promise.all([
    DedupService.findDuplicateGroups(organizationId),
    OrgService.getOrganization(organizationId),
  ]);

  return (
    <div className="flex-1 space-y-6 p-4 pt-4 sm:p-8 sm:pt-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <Link href="/leads"><Button variant="ghost" size="icon" aria-label="Go back"><ArrowLeft className="h-5 w-5" /></Button></Link>
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Duplicate Leads</h2>
          <p className="text-sm text-muted-foreground">Leads sharing an email or phone. Merge keeps the first and moves all history onto it.</p>
        </div>
      </div>
      <AutoMergeToggle initial={(org?.autoMergeDuplicates ?? 0) === 1} />
      <DuplicatesManager initial={groups as any} />
    </div>
  );
}

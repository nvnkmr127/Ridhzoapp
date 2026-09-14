import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requireOrg } from "@/lib/rbac";
import { DedupService } from "@/domains/leads/dedupService";
import { OrgService } from "@/domains/organizations/service";
import { DuplicatesManager } from "@/components/leads/DuplicatesManager";
import { AutoMergeToggle } from "@/components/leads/AutoMergeToggle";

export default async function DuplicatesPage() {
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

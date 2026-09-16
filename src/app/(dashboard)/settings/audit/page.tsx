import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requireOrg, hasPermission } from "@/lib/rbac";
import { AuditService } from "@/domains/audit/service";
import { AuditLogTable } from "@/components/settings/AuditLogTable";

export default async function AuditPage() {
  if (!(await hasPermission("audit.view"))) redirect("/leads");
  const { organizationId } = await requireOrg();
  const { rows, nextCursor } = await AuditService.list(organizationId);

  return (
    <div className="flex-1 space-y-6 p-4 pt-4 sm:p-8 sm:pt-6">
      <div className="flex items-center gap-3">
        <Link href="/settings"><Button variant="ghost" size="icon" aria-label="Go back"><ArrowLeft className="h-5 w-5" /></Button></Link>
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Audit Log</h2>
          <p className="text-sm text-muted-foreground">A record of sensitive actions taken in your workspace.</p>
        </div>
      </div>

      <AuditLogTable
        initialRows={rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }))}
        initialNextCursor={nextCursor}
      />
    </div>
  );
}

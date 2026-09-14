import Link from "next/link";
import { Button } from "@/components/ui/button";
import { List } from "lucide-react";
import { LeadService } from "@/domains/leads/service";
import { requireOrg } from "@/lib/rbac";
import { KanbanBoard } from "@/components/leads/KanbanBoard";

export default async function KanbanPage() {
  const { organizationId } = await requireOrg();
  // Scalable per-stage initial batch loading (20 leads per column)
  const initialStages = await LeadService.listLeadsByStage(organizationId, 20);

  return (
    <div className="flex-1 space-y-4 p-4 pt-4 sm:p-8 sm:pt-6 h-full flex flex-col">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Pipeline Board</h2>
          <p className="text-sm text-muted-foreground">
            Drag and drop leads to update stage status.
          </p>
        </div>
        <Link href="/leads">
          <Button variant="outline">
            <List className="mr-2 h-4 w-4" /> List view
          </Button>
        </Link>
      </div>
      <KanbanBoard initialStages={initialStages} />
    </div>
  );
}

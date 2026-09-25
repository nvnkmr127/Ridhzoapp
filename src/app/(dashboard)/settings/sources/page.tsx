import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LeadSourceService, toClientSource } from "@/domains/leads/sourceService";
import { UserService } from "@/domains/users/service";
import { TeamService } from "@/domains/teams/service";
import { SourcesManager } from "@/components/sources/SourcesManager";

import { requireOrg, hasPermission } from "@/lib/rbac";
import { redirect } from "next/navigation";

export default async function LeadSourcesPage() {
  const { organizationId } = await requireOrg();
  // Sources carry webhook signing secrets — only people who manage sources may see them.
  if (!(await hasPermission("sources.manage"))) redirect("/settings");
  const [sources, failures, assignments, orgUsers, teams] = await Promise.all([
    LeadSourceService.getSources(organizationId),
    LeadSourceService.recentFailures(organizationId),
    LeadSourceService.getAssignments(organizationId),
    UserService.list(organizationId),
    TeamService.list(organizationId),
  ]);
  const leadCounts = await LeadSourceService.getLeadCounts(sources.map((s) => s.id), organizationId);

  const clientSources = sources.map(toClientSource);
  const users = orgUsers
    .filter((u) => u.isActive)
    .map((u) => ({ id: u.id, name: [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email }));

  return (
    <div className="flex-1 space-y-6 p-4 pt-4 sm:p-8 sm:pt-6">
      <div className="flex items-center gap-3">
        <Link href="/settings">
          <Button variant="ghost" size="icon" aria-label="Go back"><ArrowLeft className="h-5 w-5" /></Button>
        </Link>
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Where leads come from</h2>
          <p className="text-sm text-muted-foreground">Connect your forms and ad accounts, and choose who gets each new lead.</p>
        </div>
      </div>
      <SourcesManager
        key={organizationId}
        initialSources={clientSources}
        leadCounts={leadCounts}
        failures={failures}
        initialAssignments={assignments}
        users={users}
        teams={teams.map((t) => ({ id: t.id, name: t.name }))}
      />
    </div>
  );
}

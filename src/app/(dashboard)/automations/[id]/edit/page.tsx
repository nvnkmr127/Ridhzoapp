import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getAutomation } from "@/lib/actions/automations";
import { AutomationBuilder } from "@/components/automations/AutomationBuilder";
import { Button } from "@/components/ui/button";
import { requireOrg } from "@/lib/rbac";
import { LeadSourceService } from "@/domains/leads/sourceService";
import { SequenceService } from "@/domains/leads/sequenceService";

export default async function EditAutomationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const automation = await getAutomation(id);
  if (!automation) notFound();
  const { organizationId } = await requireOrg();
  const [sources, sequences] = await Promise.all([
    LeadSourceService.getSources(organizationId),
    SequenceService.list(organizationId),
  ]);

  return (
    <div className="flex-1 space-y-6 p-4 pt-4 sm:p-8 sm:pt-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon" aria-label="Go back">
          <Link href="/automations"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <h2 className="text-3xl font-bold tracking-tight">Edit automation</h2>
      </div>
      <AutomationBuilder
        initialData={automation}
        automationId={id}
        sources={sources.map((s) => ({ id: s.id, name: s.name }))}
        sequences={sequences.map((s) => ({ id: s.id, name: s.name }))}
      />
    </div>
  );
}

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LeadSourceService } from "@/domains/leads/sourceService";
import { SourcesManager } from "@/components/sources/SourcesManager";

export default async function LeadSourcesPage() {
  const sources = await LeadSourceService.getSources();
  const leadCounts = await LeadSourceService.getLeadCounts(sources.map((s) => s.id));

  return (
    <div className="flex-1 space-y-6 p-4 pt-4 sm:p-8 sm:pt-6">
      <div className="flex items-center gap-3">
        <Link href="/settings">
          <Button variant="ghost" size="icon" aria-label="Go back"><ArrowLeft className="h-5 w-5" /></Button>
        </Link>
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Lead Sources</h2>
          <p className="text-sm text-muted-foreground">Connect ad platforms and webhooks that feed leads into your CRM.</p>
        </div>
      </div>
      <SourcesManager initialSources={sources} leadCounts={leadCounts} />
    </div>
  );
}

import { RefreshCw } from "lucide-react";
import { ReengagementCadenceService } from "@/domains/leads/reengagementCadenceService";
import { SectionCard } from "./SectionCard";

// Server component: for a lead that's gone cold, suggest a multi-channel win-back cadence.
// Renders nothing for recently-contacted leads.
export async function ReengagementPlanCard({ leadId, organizationId }: { leadId: string; organizationId: string }) {
  let cadence;
  try {
    cadence = await ReengagementCadenceService.getLeadReengagementCadence(leadId, organizationId);
  } catch {
    return null;
  }
  if (cadence.daysInactive < 14 || cadence.recommendedCadence.length === 0) return null;

  return (
    <SectionCard
      icon={RefreshCw}
      title="Re-engagement plan"
      description={`Cold for ${cadence.daysInactive} days — suggested win-back cadence:`}
    >
      <ol className="space-y-2">
        {cadence.recommendedCadence.map((s) => (
          <li key={s.stepNumber} className="flex flex-wrap items-baseline gap-x-2 text-xs">
            <span className="text-muted-foreground tabular-nums">Day {s.dayOffset}</span>
            <span className="font-medium capitalize">{s.channel}</span>
            <span className="text-muted-foreground">— {s.actionTitle}</span>
          </li>
        ))}
      </ol>
    </SectionCard>
  );
}

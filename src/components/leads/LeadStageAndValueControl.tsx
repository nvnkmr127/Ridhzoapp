"use client";

// Pipeline stage picker for the lead profile. (Opportunity size was removed from the profile — not
// needed; the column and updateLeadStageAndValueAction still accept a value for other callers.)

import { useState } from "react";
import { Layers } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { updateLeadStageAndValueAction } from "@/lib/actions/leads";
import { useToast } from "@/hooks/use-toast";

interface PipelineStage {
  id: string;
  name: string;
}

interface LeadStageAndValueControlProps {
  leadId: string;
  stageId?: string | null;
  stages?: PipelineStage[];
}

export function LeadStageAndValueControl({
  leadId,
  stageId,
  stages = [],
}: LeadStageAndValueControlProps) {
  const [currentStage, setCurrentStage] = useState<string>(stageId || "none");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleStageChange = async (newStageId: string) => {
    const targetStage = newStageId === "none" ? null : newStageId;
    setCurrentStage(newStageId);
    setLoading(true);
    try {
      const res = await updateLeadStageAndValueAction(leadId, { stageId: targetStage });
      if (!res.ok) {
        toast({ title: "Failed to update stage", description: res.message, variant: "destructive" });
        return;
      }
      toast({ title: "Lead stage updated" });
    } catch {
      toast({ title: "Failed to update stage", description: "We couldn't reach the server. Please try again.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Lead Stage Selector */}
      <div>
        <label className="text-xs text-muted-foreground block mb-1 font-semibold uppercase tracking-wider">
          Pipeline stage
        </label>
        <p className="mb-1.5 text-[11px] text-muted-foreground">
          Where the deal is on your pipeline board. Status (at the top) says if the lead is open, won or lost.
        </p>
        <Select value={currentStage} onValueChange={handleStageChange} disabled={loading}>
          <SelectTrigger className="w-full h-9">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-muted-foreground" />
              <SelectValue placeholder="Click to select stage..." />
            </div>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No Stage Selected</SelectItem>
            {stages.map((st) => (
              <SelectItem key={st.id} value={st.id}>
                {st.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

    </div>
  );
}

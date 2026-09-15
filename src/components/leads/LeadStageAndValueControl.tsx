"use client";

import { useState } from "react";
import { DollarSign, Layers, Check, Edit2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { updateLeadStageAndValueAction } from "@/lib/actions/leads";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/format";

interface PipelineStage {
  id: string;
  name: string;
}

interface LeadStageAndValueControlProps {
  leadId: string;
  stageId?: string | null;
  expectedValue?: string | number | null;
  stages?: PipelineStage[];
  currency?: string;
  locale?: string;
}

export function LeadStageAndValueControl({
  leadId,
  stageId,
  expectedValue,
  stages = [],
  currency,
  locale,
}: LeadStageAndValueControlProps) {
  const [currentStage, setCurrentStage] = useState<string>(stageId || "none");
  const [val, setVal] = useState<string>(expectedValue ? String(expectedValue) : "");
  const [isEditingVal, setIsEditingVal] = useState(false);
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

  const handleSaveValue = async () => {
    setIsEditingVal(false);
    setLoading(true);
    try {
      const res = await updateLeadStageAndValueAction(leadId, { expectedValue: val ? val : null });
      if (!res.ok) {
        toast({ title: "Failed to update value", description: res.message, variant: "destructive" });
        return;
      }
      toast({ title: "Opportunity value updated" });
    } catch {
      toast({ title: "Failed to update value", description: "We couldn't reach the server. Please try again.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Lead Stage Selector */}
      <div>
        <label className="text-xs text-muted-foreground block mb-1 font-semibold uppercase tracking-wider">
          Lead Stage
        </label>
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

      {/* Opportunity Size Input */}
      <div>
        <label className="text-xs text-muted-foreground block mb-1 font-semibold uppercase tracking-wider">
          Opportunity Size
        </label>
        {isEditingVal ? (
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <DollarSign className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="number"
                value={val}
                onChange={(e) => setVal(e.target.value)}
                placeholder="Enter value (e.g. 5000)"
                className="pl-8 h-9"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveValue();
                }}
              />
            </div>
            <button
              onClick={handleSaveValue}
              className="p-2 rounded bg-primary text-primary-foreground hover:opacity-90 text-xs font-medium"
            >
              <Check className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div
            onClick={() => setIsEditingVal(true)}
            className="flex items-center justify-between p-2 px-3 border rounded-md bg-background hover:bg-muted/40 cursor-pointer text-sm"
          >
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className={val ? "font-semibold text-foreground" : "text-muted-foreground"}>
                {val ? formatCurrency(Number(val), { currency, locale }) : "Click to enter opportunity size..."}
              </span>
            </div>
            <Edit2 className="h-3.5 w-3.5 text-muted-foreground opacity-70" />
          </div>
        )}
      </div>
    </div>
  );
}

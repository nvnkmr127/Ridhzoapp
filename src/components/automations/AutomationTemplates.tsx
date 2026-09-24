"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { usePlan } from "@/components/billing/PlanGate";
import { createAutomationFromTemplate } from "@/lib/actions/automations";
import { AUTOMATION_TEMPLATES, type AutomationTemplateId } from "@/lib/automation/templates";

export function AutomationTemplates() {
  const router = useRouter();
  const { toast } = useToast();
  const { openUpgrade } = usePlan();
  const [pending, setPending] = React.useState<AutomationTemplateId | null>(null);

  async function use(id: AutomationTemplateId) {
    setPending(id);
    try {
      const res = await createAutomationFromTemplate(id);
      if (!res.ok) {
        if (res.code === "LIMIT") return openUpgrade(res.message);
        toast({ variant: "destructive", title: "Couldn't create automation", description: res.message });
        return;
      }
      toast({ title: "Automation created", description: "Review and activate it below." });
      router.refresh();
    } catch {
      toast({ variant: "destructive", title: "Couldn't create automation", description: "We couldn't reach the server. Please try again." });
    } finally {
      setPending(null);
    }
  }

  return (
    <div>
      <h3 className="text-sm font-medium text-muted-foreground mb-3">Start from a template</h3>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {AUTOMATION_TEMPLATES.map((t) => (
          <div key={t.id} className="border rounded-2xl p-4 bg-card flex flex-col gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-orange-500/10">
              <Zap className="h-4 w-4 text-orange-500" />
            </div>
            <div className="flex-1">
              <h4 className="font-medium text-sm">{t.name}</h4>
              <p className="text-xs text-muted-foreground mt-1">{t.description}</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={pending !== null}
              onClick={() => use(t.id)}
            >
              {pending === t.id ? "Adding…" : "Use template"}
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

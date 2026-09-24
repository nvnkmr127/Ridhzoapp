"use client";

import * as React from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { emitLeadAction, useLeadAction, type LeadUiAction } from "@/components/leads/leadEvents";

export type LeadTab = { value: string; label: React.ReactNode; content: React.ReactNode };

const trigger =
  "shrink-0 rounded-none border-b-2 border-transparent -mb-px px-3 sm:px-4 py-3 text-sm font-medium text-muted-foreground data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none";

// The lead's conversation/history tabs. Controlled, so the Next Best Action card can jump to the
// WhatsApp or Email tab and start an AI draft in one tap.
export function LeadWorkspaceTabs({ tabs, defaultValue }: { tabs: LeadTab[]; defaultValue: string }) {
  const [value, setValue] = React.useState(defaultValue);
  const ref = React.useRef<HTMLDivElement>(null);

  const onLeadAction = React.useCallback((a: LeadUiAction) => {
    if (a.type !== "compose") return;
    setValue(a.channel === "whatsapp" ? "whatsapp" : "emails");
    ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    // Wait for the tab's draft box to mount, then ask it to draft.
    setTimeout(() => emitLeadAction({ type: "ai-draft", channel: a.channel }), 60);
  }, []);
  useLeadAction(onLeadAction);

  return (
    <div ref={ref} className="scroll-mt-4 overflow-hidden rounded-2xl border border-border bg-card">
      <Tabs value={value} onValueChange={setValue} className="w-full">
        <div className="overflow-x-auto border-b border-border px-2 sm:px-4">
          <TabsList className="h-auto justify-start gap-0.5 bg-transparent p-0 sm:gap-1">
            {tabs.map((t) => (
              <TabsTrigger key={t.value} value={t.value} className={trigger}>
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        <div className="p-4 sm:p-6">
          {tabs.map((t) => (
            <TabsContent key={t.value} value={t.value} className="mt-0 space-y-4">
              {t.content}
            </TabsContent>
          ))}
        </div>
      </Tabs>
    </div>
  );
}

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
  const stripRef = React.useRef<HTMLDivElement>(null);
  // On phones the tab row scrolls sideways; a fade on the right shows there are more tabs
  // (it used to just cut off at "Follo…", hiding Files and Email).
  const [moreRight, setMoreRight] = React.useState(false);
  const [moreLeft, setMoreLeft] = React.useState(false);

  const updateFades = React.useCallback(() => {
    const el = stripRef.current;
    if (!el) return;
    setMoreLeft(el.scrollLeft > 4);
    setMoreRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  React.useEffect(() => {
    updateFades();
    window.addEventListener("resize", updateFades);
    return () => window.removeEventListener("resize", updateFades);
  }, [updateFades]);

  // Keep the selected tab fully visible.
  React.useEffect(() => {
    stripRef.current
      ?.querySelector<HTMLElement>(`[data-state="active"][role="tab"]`)
      ?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
  }, [value]);

  const onLeadAction = React.useCallback((a: LeadUiAction) => {
    if (a.type === "open-tab") {
      setValue(a.tab);
      ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    if (a.type !== "compose") return;
    setValue(a.channel === "whatsapp" ? "whatsapp" : "emails");
    ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    // Wait for the tab's composer to mount, then ask it to draft (or just focus it).
    setTimeout(() => emitLeadAction(a.ai ? { type: "ai-draft", channel: a.channel } : { type: "focus-composer", channel: a.channel, text: a.text }), 60);
  }, []);
  useLeadAction(onLeadAction);

  return (
    <div ref={ref} className="scroll-mt-4 overflow-hidden rounded-2xl border border-border bg-card">
      <Tabs value={value} onValueChange={setValue} className="w-full">
        <div className="relative border-b border-border">
          {moreLeft && <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-6 bg-gradient-to-r from-card to-transparent" />}
          {moreRight && <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-10 bg-gradient-to-l from-card to-transparent" />}
        <div ref={stripRef} onScroll={updateFades} className="overflow-x-auto px-2 [scrollbar-width:none] sm:px-4 [&::-webkit-scrollbar]:hidden">
          <TabsList className="h-auto justify-start gap-0.5 bg-transparent p-0 sm:gap-1">
            {tabs.map((t) => (
              <TabsTrigger key={t.value} value={t.value} className={trigger}>
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
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

"use client";

import * as React from "react";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { PlanLimits } from "@/domains/billing/planService";

type PlanCtx = { paid: boolean; openUpgrade: (reason?: string) => void };

const Ctx = React.createContext<PlanCtx>({ paid: true, openUpgrade: () => {} });

export const AI_CREDITS_REASON = "You've used all your AI credits for this month. Upgrade to keep drafting replies, recaps and sequences with AI.";

const n = (v: number) => (v === Infinity ? "Unlimited" : v.toLocaleString("en-IN"));

// Mounted once in the dashboard layout. A paid-feature click, an out-of-credits AI call or a LIMIT
// error from a server action calls openUpgrade(), which shows one shared "subscribe" dialog.
export function PlanProvider({
  paid,
  plans,
  children,
}: {
  paid: boolean;
  plans: { starter: PlanLimits; unlimited: PlanLimits };
  children: React.ReactNode;
}) {
  const [reason, setReason] = React.useState<string | null>(null);
  const openUpgrade = React.useCallback((r?: string) => setReason(r || AI_CREDITS_REASON), []);
  const value = React.useMemo(() => ({ paid, openUpgrade }), [paid, openUpgrade]);
  const { starter: s, unlimited: u } = plans;

  return (
    <Ctx.Provider value={value}>
      {children}
      <Dialog open={reason !== null} onOpenChange={(o) => !o && setReason(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Sparkles className="h-5 w-5" />
            </div>
            <DialogTitle>Upgrade to unlock this</DialogTitle>
            <DialogDescription>{reason}</DialogDescription>
          </DialogHeader>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li>
              <span className="font-medium text-foreground">Starter · {s.price}</span> — {n(s.aiCredits)} AI credits/month,{" "}
              {n(s.leads)} leads, {n(s.automations)} automations, {n(s.sequences)} sequences, {n(s.sources)} lead sources, {n(s.seats)} users
            </li>
            <li>
              <span className="font-medium text-foreground">Unlimited · {u.price}</span> — {n(u.aiCredits)} AI credits/month, unlimited
              leads, users, automations &amp; sources
            </li>
          </ul>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setReason(null)}>Not now</Button>
            <Button asChild onClick={() => setReason(null)}>
              <Link href="/settings/billing">See plans</Link>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Ctx.Provider>
  );
}

export const usePlan = () => React.useContext(Ctx);

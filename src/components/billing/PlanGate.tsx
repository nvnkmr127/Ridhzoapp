"use client";

import * as React from "react";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type PlanCtx = { aiAllowed: boolean; openUpgrade: (reason?: string) => void };

const Ctx = React.createContext<PlanCtx>({ aiAllowed: true, openUpgrade: () => {} });

export const AI_UPGRADE_REASON = "AI features — reply drafts, lead recaps, the assistant and AI sequences — are available on the Starter and Unlimited plans.";

// Mounted once in the dashboard layout. Free-plan clicks on a paid feature (or a LIMIT error from a
// server action) call openUpgrade(), which shows one shared "subscribe" dialog.
export function PlanProvider({ aiAllowed, prices, children }: { aiAllowed: boolean; prices: { starter: string; unlimited: string }; children: React.ReactNode }) {
  const [reason, setReason] = React.useState<string | null>(null);
  const openUpgrade = React.useCallback((r?: string) => setReason(r || AI_UPGRADE_REASON), []);
  const value = React.useMemo(() => ({ aiAllowed, openUpgrade }), [aiAllowed, openUpgrade]);

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
          <ul className="space-y-1 text-sm text-muted-foreground">
            <li><span className="font-medium text-foreground">Starter · {prices.starter}</span> — AI features, unlimited automations, sequences &amp; lead sources, 3 seats</li>
            <li><span className="font-medium text-foreground">Unlimited · {prices.unlimited}</span> — everything, unlimited leads &amp; seats</li>
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

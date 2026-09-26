"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Sparkles, Users, UserPlus, Zap, Crown, CreditCard, Info } from "lucide-react";
import Link from "next/link";
import { DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type UsageStats = {
  plan: string;
  seats: { current: number; max: number };
  leads: { current: number; max: number };
  aiCredits: { current: number; max: number };
};

const formatNumber = (num: number) => {
  if (num === Infinity) return "∞";
  return new Intl.NumberFormat("en-US").format(num);
};

function ProgressBar({ current, max }: { current: number; max: number }) {
  const percentage = Math.min(100, (current / (max === Infinity ? 1 : max)) * 100);
  const isWarning = percentage >= 80 && percentage < 95;
  const isCritical = percentage >= 95;

  const [width, setWidth] = React.useState(0);

  React.useEffect(() => {
    // Add a tiny delay to allow the dropdown to mount before animating
    const timer = setTimeout(() => {
      setWidth(percentage);
    }, 50);
    return () => clearTimeout(timer);
  }, [percentage]);

  return (
    <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
      <div 
        className={cn(
          "h-full transition-all duration-700 ease-out",
          isCritical ? "bg-destructive" : isWarning ? "bg-amber-500" : "bg-primary"
        )} 
        style={{ width: `${width}%` }} 
      />
    </div>
  );
}

export function UsageMenuSection({ usageStats }: { usageStats: UsageStats }) {
  if (!usageStats) return null;

  const isUnlimited = usageStats.plan === "unlimited" || usageStats.plan === "business";

  return (
    <TooltipProvider>
      <div className="p-2 space-y-3">
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium flex items-center gap-1.5 text-muted-foreground">
              <Users className="h-3.5 w-3.5" />
              Seats
            </span>
            <span className="text-muted-foreground font-medium">
              {formatNumber(usageStats.seats.current)} / {formatNumber(usageStats.seats.max)}
            </span>
          </div>
          <ProgressBar current={usageStats.seats.current} max={usageStats.seats.max} />
        </div>
        
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium flex items-center gap-1.5 text-muted-foreground">
              <UserPlus className="h-3.5 w-3.5" />
              Leads
            </span>
            <span className="text-muted-foreground font-medium">
              {formatNumber(usageStats.leads.current)} / {formatNumber(usageStats.leads.max)}
            </span>
          </div>
          <ProgressBar current={usageStats.leads.current} max={usageStats.leads.max} />
        </div>
        
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium flex items-center gap-1.5 text-muted-foreground">
              <Zap className="h-3.5 w-3.5" />
              AI Credits
              <Tooltip>
                <TooltipTrigger type="button" className="cursor-help" onClick={(e) => e.preventDefault()}>
                  <Info className="h-3 w-3 text-muted-foreground/70 hover:text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent side="left" className="w-48 text-xs bg-popover text-popover-foreground border-border shadow-md">
                  Used for AI lead scoring, email drafting, and automated insights. Resets monthly.
                </TooltipContent>
              </Tooltip>
            </span>
            <span className="text-muted-foreground font-medium">
              {formatNumber(usageStats.aiCredits.current)} / {formatNumber(usageStats.aiCredits.max)}
            </span>
          </div>
          <ProgressBar current={usageStats.aiCredits.current} max={usageStats.aiCredits.max} />
        </div>
        
        <div className="pt-2 border-t border-border space-y-2">
          {!isUnlimited ? (
            <Button 
              asChild 
              size="sm" 
              className="relative w-full h-8 text-xs gap-1.5 font-medium overflow-hidden group hover:shadow-md transition-shadow bg-gradient-to-r from-primary/90 to-primary hover:from-primary hover:to-primary/90"
            >
              <Link href="/settings/billing">
                <Sparkles className="h-3.5 w-3.5 animate-pulse text-amber-300" />
                <span className="relative z-10 text-primary-foreground font-semibold">Upgrade to Unlimited</span>
                <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-700 ease-in-out" />
              </Link>
            </Button>
          ) : (
            <div className="flex items-center justify-center gap-1.5 text-xs font-semibold text-amber-500 bg-amber-500/10 py-1.5 rounded-md border border-amber-500/20 shadow-sm">
              <Crown className="h-3.5 w-3.5" />
              Unlimited Plan Active
            </div>
          )}
          
          <Link href="/settings/billing" className="flex items-center justify-center gap-1.5 text-[10.5px] text-muted-foreground hover:text-foreground transition-colors py-0.5">
            <CreditCard className="h-3 w-3" />
            Manage Subscription
          </Link>
        </div>
      </div>
      <DropdownMenuSeparator />
    </TooltipProvider>
  );
}

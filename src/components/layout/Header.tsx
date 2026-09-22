"use client"
import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PlusCircle, Search, User, PieChart } from "lucide-react";
import { signOut } from "next-auth/react";
import Image from "next/image";
import Link from "next/link";
import { QuickAddLeadDrawer } from "@/components/leads/QuickAddLeadDrawer";
import { NotificationBell } from "@/components/layout/NotificationBell";
import { EnablePushButton } from "@/components/layout/EnablePushButton";
import { OfflineStatusIndicator } from "@/components/layout/OfflineStatusIndicator";
import { CommandPalette } from "@/components/layout/CommandPalette";
import { MobileSidebar } from "@/components/layout/MobileSidebar";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type UsageStats = {
  plan: string;
  seats: { current: number; max: number };
  leads: { current: number; max: number };
};

export function Header({
  isSuperAdmin = false,
  organizationId,
  usageStats,
}: {
  isSuperAdmin?: boolean;
  organizationId?: string;
  usageStats?: UsageStats | null;
}) {
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [shortcutLabel, setShortcutLabel] = React.useState("⌘K");

  // Cmd/Ctrl+K toggles the global command palette & detect operating system for shortcut badge.
  React.useEffect(() => {
    const isMac =
      typeof navigator !== "undefined" &&
      /(Mac|iPhone|iPod|iPad)/i.test(navigator.userAgent || navigator.platform || "");
    setShortcutLabel(isMac ? "⌘K" : "Ctrl+K");

    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="flex h-14 items-center justify-between border-b border-border px-4 lg:px-6 bg-background shrink-0">
      <CommandPalette open={searchOpen} onOpenChange={setSearchOpen} />
      <div className="flex items-center flex-1 gap-2">
        <MobileSidebar isSuperAdmin={isSuperAdmin} />
        <Link href="/leads" className="md:hidden flex items-center">
          <Image
            src="/logos/Ridhzo-Logo-Final_Horizontal-Light.png"
            alt="Ridhzo"
            width={95}
            height={26}
            className="h-6 w-auto object-contain"
            priority
          />
        </Link>
        {usageStats && usageStats.plan !== "free" && (
          <div className="hidden md:flex items-center ml-2">
            {usageStats.plan === "unlimited" || usageStats.plan === "business" ? (
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Unlimited</span>
            ) : (
              <Badge variant="secondary" className="uppercase text-[10px] px-1.5 py-0">
                {usageStats.plan}
              </Badge>
            )}
          </div>
        )}
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          className="relative w-full max-w-md hidden md:flex items-center rounded-md border border-border bg-card px-3 py-2 text-sm text-muted-foreground hover:bg-accent/50 transition-colors"
        >
          <Search className="mr-2 h-4 w-4" />
          Search leads, team members, or jump to…
          <kbd className="ml-auto text-xs bg-muted text-muted-foreground rounded px-1.5 py-0.5 font-mono">{shortcutLabel}</kbd>
        </button>
      </div>
      <div className="flex items-center gap-4">
        {usageStats && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="hidden md:flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-secondary-foreground hover:bg-secondary/80 cursor-default">
                  <PieChart className="h-4 w-4" />
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="w-48 p-3 space-y-2 bg-popover text-popover-foreground border border-border shadow-md">
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium">Seats</span>
                    <span className="text-muted-foreground">{usageStats.seats.current} / {usageStats.seats.max === Infinity ? "∞" : usageStats.seats.max}</span>
                  </div>
                  <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
                    <div className="h-full bg-primary" style={{ width: `${Math.min(100, (usageStats.seats.current / (usageStats.seats.max === Infinity ? 1 : usageStats.seats.max)) * 100)}%` }} />
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium">Leads</span>
                    <span className="text-muted-foreground">{usageStats.leads.current} / {usageStats.leads.max === Infinity ? "∞" : usageStats.leads.max}</span>
                  </div>
                  <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
                    <div className="h-full bg-primary" style={{ width: `${Math.min(100, (usageStats.leads.current / (usageStats.leads.max === Infinity ? 1 : usageStats.leads.max)) * 100)}%` }} />
                  </div>
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
        <OfflineStatusIndicator organizationId={organizationId} />
        <div className="hidden md:flex">
          <QuickAddLeadDrawer organizationId={organizationId}>
            <Button size="sm" className="gap-1">
              <PlusCircle className="h-4 w-4" />
              Quick Add
            </Button>
          </QuickAddLeadDrawer>
        </div>
        <EnablePushButton />
        <NotificationBell />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="secondary" size="icon" className="rounded-full">
              <User className="h-5 w-5" />
              <span className="sr-only">Toggle user menu</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>My Account</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/settings">Settings</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/profile">Profile</Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => signOut({ callbackUrl: "/login" })}>Logout</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

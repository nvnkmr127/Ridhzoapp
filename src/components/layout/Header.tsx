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
import { PlusCircle, Search, User, PieChart, Sparkles } from "lucide-react";
import { useT } from "@/components/LanguageProvider";
import { signOut, useSession } from "next-auth/react";
import { isPlaceholderEmail } from "@/lib/auth/googleLink";
import Image from "next/image";
import Link from "next/link";
import { QuickAddLeadDrawer } from "@/components/leads/QuickAddLeadDrawer";
import { NotificationBell } from "@/components/layout/NotificationBell";
import { OfflineStatusIndicator } from "@/components/layout/OfflineStatusIndicator";
import { CommandPalette } from "@/components/layout/CommandPalette";
import { MobileSidebar } from "@/components/layout/MobileSidebar";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { UsageMenuSection } from "@/components/layout/UsageMenuSection";

type UsageStats = {
  plan: string;
  seats: { current: number; max: number };
  leads: { current: number; max: number };
  aiCredits: { current: number; max: number };
};

export function Header({
  isSuperAdmin = false,
  organizationId,
  usageStats,
  allowed = [],
}: {
  allowed?: string[];
  isSuperAdmin?: boolean;
  organizationId?: string;
  usageStats?: UsageStats | null;
}) {
  const [searchOpen, setSearchOpen] = React.useState(false);
  const t = useT();
  const { data: session } = useSession() || {};
  const [shortcutLabel, setShortcutLabel] = React.useState("⌘K");

  const getUserInitials = (name?: string | null) => {
    if (!name) return null;
    const parts = name.split(" ").filter(Boolean);
    if (parts.length === 0) return null;
    if (parts.length === 1) return parts[0][0].toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };
  const initials = getUserInitials(session?.user?.name);

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
        <MobileSidebar isSuperAdmin={isSuperAdmin} plan={usageStats?.plan} allowed={allowed} />
        <div className="flex items-center gap-2">
          <Link href="/leads" className="flex items-center">
            {usageStats?.plan === "starter" ? (
              <Image
                src="/logos/Ridhzo-Logo-Final_Horizontal-Light-Starter.png"
                alt="Ridhzo Starter"
                width={120}
                height={26}
                className="h-6 w-auto object-contain md:hidden"
                priority
              />
            ) : usageStats?.plan === "unlimited" || usageStats?.plan === "business" ? (
              <Image
                src="/logos/Ridhzo-Logo-Final_Horizontal-Light-Unlimited.png"
                alt="Ridhzo Unlimited"
                width={130}
                height={26}
                className="h-6 w-auto object-contain md:hidden"
                priority
              />
            ) : (
              <Image
                src="/logos/Ridhzo-Logo-Final_Horizontal-Light.png"
                alt="Ridhzo"
                width={95}
                height={26}
                className="h-6 w-auto object-contain md:hidden"
                priority
              />
            )}
          </Link>
        </div>
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          className="relative w-full max-w-md hidden md:flex items-center rounded-md border border-border bg-card px-3 py-2 text-sm text-muted-foreground hover:bg-accent/50 transition-colors"
        >
          <Search className="mr-2 h-4 w-4" />
          {t("Search leads, team members, or jump to…")}
          <kbd suppressHydrationWarning className="ml-auto text-xs bg-muted text-muted-foreground rounded px-1.5 py-0.5 font-mono">{shortcutLabel}</kbd>
        </button>
      </div>
      <div className="flex items-center gap-4">

        <OfflineStatusIndicator organizationId={organizationId} />
        <div className="hidden md:flex">
          <QuickAddLeadDrawer organizationId={organizationId}>
            <Button size="sm" className="gap-1">
              <PlusCircle className="h-4 w-4" />
              {t("Quick Add")}
            </Button>
          </QuickAddLeadDrawer>
        </div>
        <NotificationBell />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="secondary" size="icon" className="rounded-full overflow-hidden">
              {initials ? (
                <span className="text-sm font-semibold text-primary">{initials}</span>
              ) : (
                <User className="h-5 w-5" />
              )}
              <span className="sr-only">Toggle user menu</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <div className="flex flex-col space-y-1.5 p-2">
              <p className="text-sm font-semibold leading-none">My Account</p>
              <div className="flex flex-col space-y-0.5">
                {session?.user?.name && <p className="text-sm font-medium">{session.user.name}</p>}
                <p className="text-xs leading-none text-muted-foreground truncate">
                  {session?.user?.email && !isPlaceholderEmail(session.user.email)
                    ? session.user.email
                    : session?.user?.phone || "No contact info"}
                </p>
              </div>
            </div>
            <DropdownMenuSeparator />
            {usageStats && <UsageMenuSection usageStats={usageStats} />}
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

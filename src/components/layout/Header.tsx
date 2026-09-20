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
import { PlusCircle, Search, User } from "lucide-react";
import { signOut } from "next-auth/react";
import Link from "next/link";
import { QuickAddLeadDrawer } from "@/components/leads/QuickAddLeadDrawer";
import { NotificationBell } from "@/components/layout/NotificationBell";
import { EnablePushButton } from "@/components/layout/EnablePushButton";
import { OfflineStatusIndicator } from "@/components/layout/OfflineStatusIndicator";
import { CommandPalette } from "@/components/layout/CommandPalette";
import { MobileSidebar } from "@/components/layout/MobileSidebar";

export function Header({ isSuperAdmin = false }: { isSuperAdmin?: boolean }) {
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
        <span className="md:hidden text-base font-semibold tracking-tight">Ridhzo</span>
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
        <OfflineStatusIndicator />
        <div className="hidden md:flex">
          <QuickAddLeadDrawer>
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

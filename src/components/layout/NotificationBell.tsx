"use client"
import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Bell } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { listNotificationsAction, unreadCountAction, markNotificationsReadAction } from "@/lib/actions/notifications"
import { playAlertSound } from "@/lib/alertSound"

type Notif = { id: string; title: string; body: string | null; leadId: string | null; readAt: Date | null };

export function NotificationBell() {
  const [count, setCount] = React.useState(0);
  const [items, setItems] = React.useState<Notif[]>([]);

  // Poll the unread badge — the "New Lead Alert" surfacing. 30s is plenty for a web CRM.
  // A rise in unread (not the first load) plays the user's chosen alert sound, and refreshes the page
  // under it: a new lead from a webhook, a call a rep logged on their phone, a missed call — the list
  // or lead the user is looking at shows it without a reload. Coming back to the tab does the same
  // (plenty can change on the phones meanwhile). A hidden tab doesn't poll.
  const router = useRouter();
  const last = React.useRef<number | null>(null);
  const lastRefresh = React.useRef(Date.now());
  React.useEffect(() => {
    const refresh = () => {
      lastRefresh.current = Date.now();
      router.refresh();
    };
    const tick = () =>
      unreadCountAction()
        .then((n) => {
          if (last.current != null && n > last.current) {
            void playAlertSound();
            refresh();
          }
          last.current = n;
          setCount(n);
        })
        .catch(() => {});
    tick();
    const t = setInterval(() => document.visibilityState === "visible" && tick(), 30_000);
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      tick();
      if (Date.now() - lastRefresh.current > 60_000) refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router]);

  async function onOpen(open: boolean) {
    if (!open) return;
    const rows = await listNotificationsAction().catch(() => []);
    setItems(rows as Notif[]);
    // Opening the panel clears the badge.
    if (count > 0) {
      await markNotificationsReadAction().catch(() => {});
      setCount(0);
      last.current = 0;
    }
  }

  return (
    <DropdownMenu onOpenChange={onOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary" size="icon" aria-label="Notifications" className="rounded-full relative">
          <Bell className="h-5 w-5" />
          {count > 0 && (
            <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-xs font-semibold text-foreground">
              {count > 9 ? "9+" : count}
            </span>
          )}
          <span className="sr-only">Notifications</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel>Notifications</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {items.length === 0 ? (
          <div className="px-3 py-6 text-center text-sm text-muted-foreground">You&apos;re all caught up.</div>
        ) : (
          items.map((n) => {
            const inner = (
              <div className={`px-3 py-2 ${n.readAt ? "" : "bg-muted"}`}>
                <div className="text-sm font-medium">{n.title}</div>
                {n.body && <div className="text-xs text-muted-foreground mt-0.5">{n.body}</div>}
              </div>
            );
            return n.leadId
              ? <Link key={n.id} href={`/leads/${n.leadId}`} className="block hover:bg-accent">{inner}</Link>
              : <div key={n.id}>{inner}</div>;
          })
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

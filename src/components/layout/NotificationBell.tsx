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

const POLL_MS = 30_000;
const CHANNEL = "ridhzo-notifications";

export function NotificationBell() {
  const [count, setCount] = React.useState(0);
  const [items, setItems] = React.useState<Notif[]>([]);
  const [hasMore, setHasMore] = React.useState(false);
  const [state, setState] = React.useState<"idle" | "loading" | "error">("idle");
  const [loadingMore, setLoadingMore] = React.useState(false);

  // Poll the unread badge — the "New Lead Alert" surfacing. A rise in unread (not the first load)
  // plays the user's chosen alert sound. Open tabs share one poller: whichever tab polls broadcasts
  // the count and the others skip their own tick. A hidden tab doesn't poll. Coming back to a tab
  // after a while re-renders the page under it (plenty can change on the phones meanwhile); lists
  // with their own change tokens (leads list, lead profile) refresh themselves without this.
  const router = useRouter();
  const last = React.useRef<number | null>(null);
  const lastShared = React.useRef(0);
  const lastRefresh = React.useRef(Date.now());
  const channel = React.useRef<BroadcastChannel | null>(null);

  const publish = React.useCallback((n: number) => {
    lastShared.current = Date.now();
    last.current = n;
    setCount(n);
    try { channel.current?.postMessage({ count: n }); } catch { /* channel closed */ }
  }, []);

  React.useEffect(() => {
    if (typeof BroadcastChannel !== "undefined") {
      channel.current = new BroadcastChannel(CHANNEL);
      channel.current.onmessage = (e: MessageEvent<{ count: number }>) => {
        lastShared.current = Date.now();
        last.current = e.data.count;
        setCount(e.data.count);
      };
    }
    const tick = (force = false) => {
      if (!force && Date.now() - lastShared.current < POLL_MS * 0.8) return; // another tab just polled
      unreadCountAction()
        .then((n) => {
          if (last.current != null && n > last.current) void playAlertSound();
          publish(n);
        })
        .catch(() => {});
    };
    tick(true);
    const t = setInterval(() => document.visibilityState === "visible" && tick(), POLL_MS);
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      tick();
      if (Date.now() - lastRefresh.current > 60_000) {
        lastRefresh.current = Date.now();
        router.refresh();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
      channel.current?.close();
      channel.current = null;
    };
  }, [router, publish]);

  // Mark exactly what was shown as read, and drop the badge by that many.
  async function markShown(rows: Notif[]) {
    const unread = rows.filter((n) => !n.readAt).map((n) => n.id);
    if (unread.length === 0) return;
    await markNotificationsReadAction(unread).catch(() => {});
    publish(Math.max(0, (last.current ?? 0) - unread.length));
  }

  async function onOpen(open: boolean) {
    if (!open) {
      // Rows shown this time now render as read next time.
      setItems((xs) => xs.map((n) => (n.readAt ? n : { ...n, readAt: new Date() })));
      return;
    }
    setState("loading");
    try {
      const res = await listNotificationsAction();
      setItems(res.items as Notif[]);
      setHasMore(res.hasMore);
      setState("idle");
      await markShown(res.items as Notif[]);
    } catch {
      setState("error");
    }
  }

  async function loadMore() {
    const cursor = items[items.length - 1]?.id;
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const res = await listNotificationsAction({ cursor });
      setItems((xs) => [...xs, ...(res.items as Notif[])]);
      setHasMore(res.hasMore);
      await markShown(res.items as Notif[]);
    } catch {
      setState("error");
    } finally {
      setLoadingMore(false);
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
      <DropdownMenuContent align="end" className="w-80 max-h-[70vh] overflow-y-auto">
        <DropdownMenuLabel>Notifications</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {state === "loading" && items.length === 0 ? (
          <div className="px-3 py-6 text-center text-sm text-muted-foreground">Loading…</div>
        ) : state === "error" && items.length === 0 ? (
          <div className="px-3 py-6 text-center text-sm text-muted-foreground">Couldn&apos;t load notifications. Close and reopen to try again.</div>
        ) : items.length === 0 ? (
          <div className="px-3 py-6 text-center text-sm text-muted-foreground">You&apos;re all caught up.</div>
        ) : (
          <>
            {items.map((n) => {
              const inner = (
                <div className={`px-3 py-2 ${n.readAt ? "" : "bg-muted"}`}>
                  <div className="text-sm font-medium">{n.title}</div>
                  {n.body && <div className="text-xs text-muted-foreground mt-0.5">{n.body}</div>}
                </div>
              );
              return n.leadId
                ? <Link key={n.id} href={`/leads/${n.leadId}`} className="block hover:bg-accent">{inner}</Link>
                : <div key={n.id}>{inner}</div>;
            })}
            {hasMore && (
              <button
                type="button"
                onClick={(e) => { e.preventDefault(); void loadMore(); }}
                disabled={loadingMore}
                className="w-full px-3 py-2 text-center text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-60"
              >
                {loadingMore ? "Loading…" : "Load older"}
              </button>
            )}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

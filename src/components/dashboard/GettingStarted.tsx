"use client";

import * as React from "react";
import Link from "next/link";
import { Network, UserPlus, Zap, ArrowRight, X, CheckCircle2 } from "lucide-react";

const DISMISS_KEY = "ridhzo_getting_started_dismissed";

export type SetupProgress = { source: boolean; lead: boolean; automation: boolean };

const STEPS = [
  { key: "source", icon: Network, title: "Connect a lead source", desc: "Link your website or Facebook ads so new leads land here instantly.", href: "/settings/sources" },
  { key: "lead", icon: UserPlus, title: "Add your first lead", desc: "Create one by hand or import a CSV to see the flow end to end.", href: "/leads" },
  { key: "automation", icon: Zap, title: "Turn on instant auto-reply", desc: "Use the “Welcome WhatsApp on new lead” automation so you’re first to respond.", href: "/automations" },
] as const;

// Setup checklist for a new org. Steps tick off from real data and the card disappears once all are
// done. While the workspace has no leads it can't be dismissed (it's the whole page then); after that
// the user can hide it, remembered per browser.
export function GettingStarted({ progress, dismissible = true }: { progress: SetupProgress; dismissible?: boolean }) {
  const [dismissed, setDismissed] = React.useState(dismissible);
  React.useEffect(() => {
    if (!dismissible) return setDismissed(false);
    try { setDismissed(localStorage.getItem(DISMISS_KEY) === "1"); } catch { setDismissed(false); }
  }, [dismissible]);

  const doneCount = STEPS.filter((s) => progress[s.key]).length;
  if (dismissed || doneCount === STEPS.length) return null;

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, "1"); } catch { /* private mode */ }
    setDismissed(true);
  };

  return (
    <div className="relative rounded-2xl border bg-card p-6">
      {dismissible && (
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss setup guide"
          className="absolute right-3 top-3 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      )}
      <div className="mb-1 text-lg font-medium">Get set up in a few minutes</div>
      <p className="mb-5 text-sm text-muted-foreground">
        {doneCount} of {STEPS.length} done — finish these to start replying to leads first.
      </p>
      <ol className="grid gap-3 sm:grid-cols-3">
        {STEPS.map((s, i) => {
          const done = progress[s.key];
          return (
            <li key={s.key}>
              <Link
                href={s.href}
                className={`group flex h-full items-start gap-3 rounded-xl border border-border p-4 transition-colors hover:border-foreground/30 hover:bg-muted/50 ${done ? "opacity-60" : ""}`}
              >
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${done ? "bg-emerald-500/10 text-emerald-600" : "bg-primary/10 text-primary"}`}>
                  {done ? <CheckCircle2 className="h-4 w-4" /> : <s.icon className="h-4 w-4" />}
                </div>
                <div className="min-w-0">
                  <div className={`flex items-center gap-1.5 font-medium ${done ? "line-through" : ""}`}>
                    <span className="text-muted-foreground">{i + 1}.</span> {s.title}
                    {!done && <ArrowRight className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100" />}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">{s.desc}</p>
                </div>
              </Link>
            </li>
          );
        })}
      </ol>
      <p className="mt-4 text-xs text-muted-foreground">
        Messages go out from your own WhatsApp by default. Using the WhatsApp Business API?{" "}
        <Link href="/settings" className="underline hover:text-foreground">Switch in Settings</Link>.
      </p>
    </div>
  );
}

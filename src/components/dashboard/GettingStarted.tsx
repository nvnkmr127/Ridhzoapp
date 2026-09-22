"use client";

import * as React from "react";
import Link from "next/link";
import { Network, MessageSquare, UserPlus, Zap, ArrowRight, X } from "lucide-react";

const DISMISS_KEY = "ridhzo_getting_started_dismissed";

const STEPS = [
  { icon: Network, title: "Connect a lead source", desc: "Link your website or Facebook ads so new leads land here instantly.", href: "/settings/sources" },
  { icon: MessageSquare, title: "Choose how you message", desc: "Personal WhatsApp (one-tap) or the Business API — pick in settings.", href: "/settings" },
  { icon: UserPlus, title: "Add your first lead", desc: "Create one by hand or import a CSV to see the flow end to end.", href: "/leads" },
  { icon: Zap, title: "Turn on instant auto-reply", desc: "Use the “Welcome WhatsApp on new lead” automation so you’re first to respond.", href: "/automations" },
] as const;

// Shown to a new-ish org during setup (the dashboard renders it while lead volume is still low).
// Keeps the first run to a few concrete actions, and stays dismissible so it doesn't linger once the
// user has found their feet — the choice is remembered per browser.
export function GettingStarted() {
  const [dismissed, setDismissed] = React.useState(true);
  React.useEffect(() => {
    try { setDismissed(localStorage.getItem(DISMISS_KEY) === "1"); } catch { setDismissed(false); }
  }, []);
  if (dismissed) return null;

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, "1"); } catch { /* private mode */ }
    setDismissed(true);
  };

  return (
    <div className="relative rounded-2xl border bg-card p-6">
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss setup guide"
        className="absolute right-3 top-3 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>
      <div className="mb-1 text-lg font-medium">Get set up in a few minutes</div>
      <p className="mb-5 text-sm text-muted-foreground">Four quick steps to your first one-tap follow-up.</p>
      <ol className="grid gap-3 sm:grid-cols-2">
        {STEPS.map((s, i) => (
          <li key={s.href}>
            <Link
              href={s.href}
              className="group flex h-full items-start gap-3 rounded-xl border border-border p-4 transition-colors hover:border-foreground/30 hover:bg-muted/50"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <s.icon className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 font-medium">
                  <span className="text-muted-foreground">{i + 1}.</span> {s.title}
                  <ArrowRight className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">{s.desc}</p>
              </div>
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}

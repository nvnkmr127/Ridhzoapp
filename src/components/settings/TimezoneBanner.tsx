"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Globe, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { setWorkspaceTimezoneAction } from "@/lib/actions/organizations";
import { useToast } from "@/hooks/use-toast";

const DISMISS_KEY = "ridhzo:tz-banner-dismissed";

// Shown to admins while the workspace is still on the default UTC. Meeting confirmations, reminders
// and the morning summary all use the workspace timezone, so UTC means wrong times for leads.
export function TimezoneBanner() {
  const router = useRouter();
  const { toast } = useToast();
  const [browserTz, setBrowserTz] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(DISMISS_KEY) === "1";
    } catch {}
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!dismissed && tz && tz !== "UTC" && !tz.startsWith("Etc/")) setBrowserTz(tz);
  }, []);

  if (!browserTz) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {}
    setBrowserTz(null);
  };

  async function apply() {
    if (!browserTz) return;
    setBusy(true);
    try {
      const res = await setWorkspaceTimezoneAction(browserTz);
      if (!res.ok) {
        toast({ variant: "destructive", title: "Timezone not changed", description: res.message });
        return;
      }
      toast({ title: `Workspace timezone set to ${browserTz}` });
      setBrowserTz(null);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm">
      <Globe className="h-4 w-4 shrink-0 text-amber-600" />
      <span className="min-w-0 flex-1">
        Your workspace timezone is <b>UTC</b>, so meeting times and reminders sent to leads will be off.
      </span>
      <Button size="sm" onClick={apply} disabled={busy}>Use {browserTz}</Button>
      <button type="button" aria-label="Dismiss" onClick={dismiss} className="rounded p-1 text-muted-foreground hover:text-foreground">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

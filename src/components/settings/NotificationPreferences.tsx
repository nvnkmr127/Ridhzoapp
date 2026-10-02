"use client";

import * as React from "react";
import { useToast } from "@/hooks/use-toast";
import { setEmailOptOutAction } from "@/lib/actions/notificationPrefs";
import { EMAIL_NOTIFICATION_TYPES } from "@/lib/notifications/emailTypes";

export function NotificationPreferences({ initialOptOut }: { initialOptOut: string[] }) {
  const { toast } = useToast();
  const [optOut, setOptOut] = React.useState<string[]>(initialOptOut);

  async function toggle(type: string, emailOn: boolean) {
    const next = emailOn ? optOut.filter((t) => t !== type) : [...optOut, type];
    const prev = optOut;
    setOptOut(next);
    try {
      const res = await setEmailOptOutAction(next);
      if (!res.ok) {
        setOptOut(prev);
        toast({ variant: "destructive", title: "Could not save", description: res.message });
      }
    } catch {
      setOptOut(prev);
      toast({ variant: "destructive", title: "Could not save", description: "Something went wrong. Check your connection, or you may not have permission for this, then try again." });
    }
  }

  return (
    <div className="bg-card p-6 rounded-2xl border border-border space-y-4">
      <div>
        <h3 className="font-semibold">Email notifications</h3>
        <p className="text-sm text-muted-foreground">You&apos;ll always see these in the in-app bell. Choose which also email you.</p>
      </div>
      <div className="divide-y">
        {EMAIL_NOTIFICATION_TYPES.map(({ type, label }) => {
          const emailOn = !optOut.includes(type);
          return (
            <label key={type} className="flex items-center justify-between py-2.5 cursor-pointer">
              <span className="text-sm text-muted-foreground">{label}</span>
              <input type="checkbox" checked={emailOn} onChange={(e) => toggle(type, e.target.checked)} className="h-4 w-4" />
            </label>
          );
        })}
      </div>
    </div>
  );
}

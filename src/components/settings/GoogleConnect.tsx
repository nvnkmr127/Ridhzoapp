"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { disconnectGoogleAction } from "@/lib/actions/integrations";
import { Calendar } from "lucide-react";

export function GoogleConnect({ connected, configured }: { connected: boolean; configured: boolean }) {
  const { toast } = useToast();
  const [isConnected, setConnected] = React.useState(connected);

  async function disconnect() {
    try {
      const res = await disconnectGoogleAction();
      if (!res.ok) {
        toast({ variant: "destructive", title: "Could not disconnect", description: res.message });
        return;
      }
      setConnected(false);
      toast({ title: "Google Calendar disconnected" });
    } catch {
      toast({ variant: "destructive", title: "Could not disconnect", description: "Something went wrong. Check your connection, or you may not have permission for this, then try again." });
    }
  }

  return (
    <div className="rounded-2xl border bg-card p-6 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <Calendar className="h-6 w-6 text-muted-foreground" />
        <div>
          <div className="font-semibold flex items-center gap-2">Google Calendar {isConnected && <Badge>Connected</Badge>}</div>
          <div className="text-sm text-muted-foreground">Booking requests create events on your calendar automatically.</div>
        </div>
      </div>
      {!configured ? (
        <span className="text-xs text-muted-foreground">Not configured</span>
      ) : isConnected ? (
        <Button variant="outline" onClick={disconnect}>Disconnect</Button>
      ) : (
        <a href="/api/integrations/google/connect"><Button>Connect</Button></a>
      )}
    </div>
  );
}

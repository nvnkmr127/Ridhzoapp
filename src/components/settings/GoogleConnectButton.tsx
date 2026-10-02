"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { disconnectGoogleAction } from "@/lib/actions/integrations";

export function GoogleConnectButton({ connected, configured }: { connected: boolean; configured: boolean }) {
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

  if (!configured) return <span className="text-xs text-muted-foreground">Set env keys</span>;
  if (isConnected) return <Button variant="outline" size="sm" onClick={disconnect}>Disconnect</Button>;
  return <a href="/api/integrations/google/connect"><Button size="sm">Connect</Button></a>;
}

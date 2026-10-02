"use client";

import * as React from "react";
import { MessageCircle, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { saveWhatsAppSettingsAction, disconnectWhatsAppAction, rotateWhatsAppInboundTokenAction } from "@/lib/actions/whatsappSettings";

type View = { enabled: boolean; hasApiKey: boolean; keyUnreadable: boolean; tenantId: string | null; inboundToken: string | null };

// Connect the workspace's own Watxio WhatsApp account: sends use it, replies arrive on the webhook URL below.
export function WhatsAppConnect({ initial, appUrl }: { initial: View; appUrl: string }) {
  const { toast } = useToast();
  const [confirm, confirmDialog] = useConfirm();
  const [view, setView] = React.useState(initial);
  const [apiKey, setApiKey] = React.useState("");
  const [tenantId, setTenantId] = React.useState(initial.tenantId ?? "");
  const [busy, setBusy] = React.useState(false);
  const webhookUrl = view.inboundToken ? `${appUrl}/api/webhooks/whatsapp/${view.inboundToken}` : null;

  async function call(fn: () => Promise<{ ok: true; data: View } | { ok: false; message: string }>, done: string) {
    setBusy(true);
    try {
      const res = await fn();
      if (!res.ok) { toast({ variant: "destructive", title: "Couldn't save", description: res.message }); return; }
      setView(res.data); setApiKey(""); toast({ title: done });
    } catch {
      toast({ variant: "destructive", title: "Something went wrong", description: "Check your connection, or you may not have permission for this, then try again." });
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-3 rounded-2xl border p-4">
      {confirmDialog}
      <p className="flex items-center gap-2 text-sm font-medium"><MessageCircle className="h-4 w-4" /> Your own WhatsApp account (Watxio)</p>
      <p className="text-xs text-muted-foreground">
        {view.enabled ? "Messages are sent from your account and replies come back to your workspace only." : "Using the shared Ridhzo WhatsApp number. Connect your own account to send from your number and keep replies private to your workspace."}
      </p>
      {view.keyUnreadable && <p role="alert" className="text-xs text-destructive">The stored key can no longer be read. Enter it again.</p>}
      <div className="grid gap-2 sm:grid-cols-2">
        <Input type="password" autoComplete="off" placeholder={view.hasApiKey ? "API key saved — leave blank to keep" : "Watxio API key"} value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
        <Input placeholder="Tenant id (only if Watxio gave you one)" value={tenantId} onChange={(e) => setTenantId(e.target.value)} />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={busy || (!apiKey.trim() && !view.hasApiKey)} onClick={() => call(() => saveWhatsAppSettingsAction({ apiKey, tenantId: tenantId || null }), "WhatsApp connected")}>
          {view.enabled ? "Save" : "Connect"}
        </Button>
        {view.enabled && (
          <Button size="sm" variant="outline" disabled={busy} onClick={async () => {
            if (await confirm({ title: "Disconnect your WhatsApp account?", description: "Sending falls back to the shared Ridhzo number, and replies to your own number stop arriving.", confirmLabel: "Disconnect", destructive: true })) await call(disconnectWhatsAppAction, "Disconnected");
          }}>Disconnect</Button>
        )}
      </div>
      {webhookUrl && (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Set this as the inbound webhook URL in Watxio:</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 break-all rounded border bg-card px-2 py-1.5 text-xs">{webhookUrl}</code>
            <Button size="sm" variant="outline" aria-label="Copy URL" onClick={() => { navigator.clipboard?.writeText(webhookUrl); toast({ title: "Copied" }); }}><Copy className="h-3.5 w-3.5" /></Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={async () => {
              if (await confirm({ title: "Rotate the webhook URL?", description: "The old URL stops working immediately — update it in Watxio.", confirmLabel: "Rotate", destructive: true })) await call(rotateWhatsAppInboundTokenAction, "New URL generated");
            }}>Rotate</Button>
          </div>
        </div>
      )}
    </div>
  );
}

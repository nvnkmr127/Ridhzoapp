"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { logLeadContactAction } from "@/lib/actions/messaging";
import { completeFollowUp } from "@/lib/actions/follow-ups";
import { buildDeepLink } from "@/lib/messaging/deeplink";
import { useToast } from "@/hooks/use-toast";


// One tap: open WhatsApp with the message prefilled, log it on the lead, and mark the follow-up done.
export function SendFollowUpButton({
  followUpId,
  leadId,
  leadName,
  phone,
  message,
  onDone,
}: {
  followUpId: string;
  leadId: string;
  leadName: string;
  phone: string | null | undefined;
  message: string;
  onDone?: () => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = React.useState(false);
  const link = buildDeepLink("whatsapp", { name: leadName, phone }, message);

  async function send() {
    if (!link) return;
    window.open(link, "_blank", "noopener,noreferrer");
    setBusy(true);
    try {
      const [logged, done] = await Promise.all([
        logLeadContactAction({ leadId, channel: "whatsapp", message }),
        completeFollowUp(followUpId),
      ]);
      if (!logged.ok || !done.ok) {
        toast({ variant: "destructive", title: "Opened WhatsApp, but couldn't update the follow-up", description: (!logged.ok ? logged.message : !done.ok ? done.message : undefined) });
        return;
      }
      toast({ title: "Opened in WhatsApp", description: "Logged on the lead and marked this follow-up done." });
      onDone?.();
      router.refresh();
    } catch {
      toast({ variant: "destructive", title: "Couldn't update the follow-up", description: "We couldn't reach the server. Please try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button size="sm" onClick={send} disabled={busy || !link} className="gap-1.5" title={link ? "Send this message from your WhatsApp" : "This lead has no phone number"}>
      <Send className="h-3.5 w-3.5" /> Send on WhatsApp
    </Button>
  );
}

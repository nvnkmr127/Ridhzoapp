"use client";

import * as React from "react";
import { MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { resendVerificationEmailAction } from "@/lib/actions/account";

// Shown to password sign-ups who haven't confirmed their address: sending, exports, API keys and inviting
// people stay locked until they click the emailed link.
export function VerifyEmailBanner({ email }: { email: string | null }) {
  const { toast } = useToast();
  const [busy, setBusy] = React.useState(false);
  const [sent, setSent] = React.useState(false);

  async function resend() {
    setBusy(true);
    try {
      const res = await resendVerificationEmailAction();
      if (!res.ok) { toast({ variant: "destructive", title: "Couldn't send", description: res.message }); return; }
      setSent(true);
      toast({ title: "Verification email sent", description: "Check your inbox (and spam)." });
    } catch {
      toast({ variant: "destructive", title: "Something went wrong", description: "Check your connection, or you may not have permission for this, then try again." });
    } finally { setBusy(false); }
  }

  return (
    <div role="status" className="flex flex-wrap items-center gap-3 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm">
      <MailCheck className="h-4 w-4 shrink-0 text-amber-600" />
      <span className="flex-1">Verify <b>{email}</b> to unlock sending messages, exporting leads, API keys and inviting teammates.</span>
      <Button size="sm" variant="outline" onClick={resend} disabled={busy || sent}>{sent ? "Sent — check your inbox" : "Resend email"}</Button>
    </div>
  );
}

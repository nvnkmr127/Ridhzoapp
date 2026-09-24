"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { MessageSquareReply } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { logLeadReplyAction } from "@/lib/actions/messaging";
import { useToast } from "@/hooks/use-toast";

// Personal WhatsApp mode can't see incoming messages. Pasting the lead's reply here puts it in the
// thread, stops running sequences, and lets the score and AI see that the lead is engaging.
export function LogReplyBox({ leadId }: { leadId: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [text, setText] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  async function save() {
    setSaving(true);
    try {
      const res = await logLeadReplyAction({ leadId, channel: "whatsapp", message: text });
      if (!res.ok) {
        toast({ variant: "destructive", title: "Reply not saved", description: res.message });
        return;
      }
      toast({ title: "Reply saved", description: "Added to the conversation. Any running sequence was stopped." });
      setText("");
      setOpen(false);
      router.refresh();
    } catch {
      toast({ variant: "destructive", title: "Reply not saved", description: "We couldn't reach the server. Please try again." });
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
        <MessageSquareReply className="h-3.5 w-3.5" /> They replied? Paste their message
      </button>
    );
  }
  return (
    <div className="space-y-2 rounded-lg border border-dashed border-border p-3">
      <p className="text-xs text-muted-foreground">Paste what the lead sent you on WhatsApp.</p>
      <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. Yes, can we visit on Saturday?" className="min-h-[70px]" autoFocus />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={saving}>
          Cancel
        </Button>
        <Button size="sm" onClick={save} disabled={saving || !text.trim()}>
          {saving ? "Saving…" : "Save reply"}
        </Button>
      </div>
    </div>
  );
}

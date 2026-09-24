"use client"
import * as React from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { sendWhatsAppAction, listTemplates } from "@/lib/actions/messaging"
import { draftLeadReplyAction } from "@/lib/actions/ai"
import { useToast } from "@/hooks/use-toast"
import { MessageCircle, Sparkles } from "lucide-react"
import { useRouter } from "next/navigation"
import { useLogContact } from "@/components/leads/useLogContact"
import { buildDeepLink, renderTemplate } from "@/lib/messaging/deeplink"

type Template = { id: string; name: string; body: string };

export function WhatsAppSendBox({
  leadId,
  hasPhone,
  mode = "bsp",
  phone = null,
  leadName = "",
  company = null,
}: {
  leadId: string;
  hasPhone: boolean;
  mode?: "personal" | "bsp";
  phone?: string | null;
  leadName?: string;
  company?: string | null;
}) {
  const { toast } = useToast();
  const logContact = useLogContact(leadId);
  const [templates, setTemplates] = React.useState<Template[]>([]);
  const [body, setBody] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const router = useRouter();
  const [drafting, setDrafting] = React.useState(false);

  // Load WhatsApp templates once for the one-tap picker.
  React.useEffect(() => {
    listTemplates("whatsapp").then((rows) => setTemplates(rows as Template[])).catch(() => {});
  }, []);

  function pickTemplate(id: string) {
    const t = templates.find((x) => x.id === id);
    if (t) setBody(t.body);
  }

  async function draft() {
    setDrafting(true);
    try {
      const { draft, ai } = await draftLeadReplyAction({ leadId });
      setBody(draft);
      toast({ title: ai ? "AI draft ready" : "Draft ready", description: "Review and edit before sending." });
    } catch {
      toast({ variant: "destructive", title: "Couldn't draft a message" });
    } finally {
      setDrafting(false);
    }
  }

  async function send() {
    // Personal mode: open WhatsApp with the message prefilled to send from the rep's own
    // number (Ridhzo-style). No BSP, no 24h-window limits — the rep taps send in WhatsApp.
    // Tokens are filled in here (the server only renders them for Business API sends), and the
    // message is logged so it shows in the thread and counts as contact.
    if (mode === "personal") {
      const lead = { name: leadName, phone, company };
      const text = renderTemplate(body, lead);
      window.open(buildDeepLink("whatsapp", lead, text) ?? `https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
      setBody("");
      await logContact({ channel: "whatsapp", message: text }, "Opened in WhatsApp — logged on the lead");
      return;
    }
    setSending(true);
    try {
      const res = await sendWhatsAppAction({ leadId, body });
      if (!res.ok) {
        // Surfaces the 24h-window / template-required message so the user knows what to do.
        toast({ variant: "destructive", title: "Not sent", description: res.message });
        return;
      }
      toast({ title: "WhatsApp sent", description: "Sent via the WhatsApp Business API." });
      setBody("");
      router.refresh();
    } catch {
      toast({ variant: "destructive", title: "Not sent", description: "We couldn't reach the server. Please try again." });
    } finally {
      setSending(false);
    }
  }

  if (!hasPhone) {
    return <div className="text-sm text-muted-foreground">Add a phone number to message this lead on WhatsApp.</div>;
  }

  return (
    <div className="space-y-3">
      {templates.length > 0 && (
        <Select onValueChange={pickTemplate}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Insert a template…" />
          </SelectTrigger>
          <SelectContent>
            {templates.map((t) => (
              <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      <Textarea
        placeholder="Type a WhatsApp message… tokens like {{first_name}} are filled in automatically."
        className="min-h-[100px]"
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
        <Button variant="outline" onClick={draft} disabled={drafting || sending} className="gap-2">
          <Sparkles className="h-4 w-4" />
          {drafting ? "Drafting…" : "Draft with AI"}
        </Button>
        <Button onClick={send} disabled={sending || body.trim().length === 0} className="gap-2">
          <MessageCircle className="h-4 w-4" />
          {mode === "personal" ? "Open in WhatsApp" : sending ? "Sending…" : "Send WhatsApp"}
        </Button>
      </div>
    </div>
  );
}

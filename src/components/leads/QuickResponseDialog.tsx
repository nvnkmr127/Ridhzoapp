"use client";

import { useState, useEffect } from "react";
import { Send, MessageSquare, Mail, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { listTemplates, sendWhatsAppAction, sendEmailAction } from "@/lib/actions/messaging";
import { useToast } from "@/hooks/use-toast";
import { useLogContact } from "@/components/leads/useLogContact";
import { buildDeepLink, renderTemplate } from "@/lib/messaging/deeplink";

interface QuickResponseDialogProps {
  leadId: string;
  leadName: string;
  email?: string | null;
  phone?: string | null;
  whatsappMode?: "personal" | "bsp";
}

export function QuickResponseDialog({ leadId, leadName, email, phone, whatsappMode = "personal" }: QuickResponseDialogProps) {
  const logContact = useLogContact(leadId);
  const [open, setOpen] = useState(false);
  const [channel, setChannel] = useState<"whatsapp" | "email">("whatsapp");
  const [templates, setTemplates] = useState<any[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      listTemplates()
        .then((res) => setTemplates(res))
        .catch(() => setTemplates([]));
    }
  }, [open]);

  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplateId(templateId);
    const tmpl = templates.find((t) => t.id === templateId);
    if (tmpl) {
      if (tmpl.channel === "email" || tmpl.channel === "whatsapp") {
        setChannel(tmpl.channel as "whatsapp" | "email");
      }
      setSubject(tmpl.subject || "");
      let text = tmpl.body || "";
      text = text.replace(/\{\{name\}\}/gi, leadName || "Client");
      setBody(text);
    }
  };

  const handleSend = async () => {
    if (!body.trim()) return;
    if (channel === "whatsapp" && !phone) {
      toast({ title: "Can't send", description: "This lead has no phone number on file.", variant: "destructive" });
      return;
    }
    if (channel === "email" && !email) {
      toast({ title: "Can't send", description: "This lead has no email address on file.", variant: "destructive" });
      return;
    }
    // Personal mode: WhatsApp goes out from the rep's own number via wa.me (the Business API send
    // refuses personal-mode orgs, which made this button always fail) — open it prefilled and log it.
    if (channel === "whatsapp" && whatsappMode === "personal") {
      const lead = { name: leadName, email, phone };
      const text = renderTemplate(body, lead);
      window.open(buildDeepLink("whatsapp", lead, text)!, "_blank", "noopener,noreferrer");
      setOpen(false);
      setBody("");
      setSubject("");
      await logContact({ channel: "whatsapp", message: text }, "Opened in WhatsApp — logged on the lead");
      return;
    }
    setSending(true);
    try {
      const res = channel === "whatsapp"
        ? await sendWhatsAppAction({ leadId, body })
        : await sendEmailAction({ leadId, subject: subject || `Update for ${leadName}`, body });
      if (!res.ok) {
        toast({ title: "Failed to send response", description: res.message, variant: "destructive" });
        return;
      }
      toast({ title: channel === "whatsapp" ? "WhatsApp response sent" : "Email response sent" });
      setOpen(false);
      setBody("");
      setSubject("");
    } catch {
      toast({
        title: "Failed to send response",
        description: "We couldn't reach the server. Please try again.",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="h-10 sm:h-9 gap-2 font-medium">
          <Send className="h-4 w-4" /> Quick reply
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Send className="h-5 w-5 text-primary" /> Send Quick Response
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Template Selector */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-1">
              Select Template
            </label>
            <Select value={selectedTemplateId} onValueChange={handleTemplateSelect}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Choose a quick response template..." />
              </SelectTrigger>
              <SelectContent>
                {templates.length === 0 ? (
                  <SelectItem value="none" disabled>
                    No saved templates
                  </SelectItem>
                ) : (
                  templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      [{t.channel.toUpperCase()}] {t.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Channel Selector */}
          <div className="flex items-center gap-3 border-t pt-3">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground shrink-0">
              Channel:
            </label>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant={channel === "whatsapp" ? "default" : "outline"}
                className="h-8 text-xs gap-1.5"
                onClick={() => setChannel("whatsapp")}
              >
                <MessageSquare className="h-3.5 w-3.5" /> WhatsApp
              </Button>
              <Button
                type="button"
                size="sm"
                variant={channel === "email" ? "default" : "outline"}
                className="h-8 text-xs gap-1.5"
                onClick={() => setChannel("email")}
              >
                <Mail className="h-3.5 w-3.5" /> Email
              </Button>
            </div>
          </div>

          {/* Email Subject if Email channel */}
          {channel === "email" && (
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-1">
                Subject
              </label>
              <Input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Enter email subject..."
                className="h-9"
              />
            </div>
          )}

          {/* Message Body */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-1">
              Message Content
            </label>
            <Textarea
              rows={5}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Type your message here..."
              className="text-sm"
            />
          </div>

          {/* Recipient status notice */}
          <div className="text-xs text-muted-foreground bg-muted/30 p-2.5 rounded border flex items-center justify-between">
            <span>Recipient:</span>
            <span className="font-semibold text-foreground">
              {channel === "whatsapp"
                ? phone || "No phone number"
                : email || "No email address"}
            </span>
          </div>

          {/* Send Button */}
          <Button
            onClick={handleSend}
            disabled={sending || !body.trim() || (channel === "whatsapp" ? !phone : !email)}
            className="w-full gap-2"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {channel === "whatsapp" && whatsappMode === "personal" ? "Open in WhatsApp" : `Send ${channel === "whatsapp" ? "WhatsApp" : "Email"} now`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

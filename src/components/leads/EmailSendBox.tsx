"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { sendEmailAction } from "@/lib/actions/messaging";
import { Mail } from "lucide-react";
import { AiDraftControls } from "@/components/leads/AiDraftControls";
import { useLogContact } from "@/components/leads/useLogContact";
import { useLeadAction, type LeadUiAction } from "@/components/leads/leadEvents";

export function EmailSendBox({ leadId, email }: { leadId: string; email: string | null }) {
  const { toast } = useToast();
  const [subject, setSubject] = React.useState("");
  const [body, setBody] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const subjectRef = React.useRef<HTMLInputElement>(null);
  const logContact = useLogContact(leadId);
  // Header "Email" button lands here — one place to write emails.
  const onLeadAction = React.useCallback((a: LeadUiAction) => {
    if (a.type === "focus-composer" && a.channel === "email") subjectRef.current?.focus();
  }, []);
  useLeadAction(onLeadAction);

  if (!email) return <div className="text-sm text-muted-foreground">This lead has no email address.</div>;

  async function send() {
    if (!subject.trim() || !body.trim()) return;
    setSending(true);
    try {
      const res = await sendEmailAction({ leadId, subject: subject.trim(), body: body.trim() });
      if (!res.ok) {
        toast({ variant: "destructive", title: "Could not send", description: res.message });
        return;
      }
      setSubject(""); setBody("");
      toast({ title: "Email sent", description: `Sent to ${email}` });
    } catch {
      toast({ variant: "destructive", title: "Could not send", description: "We couldn't reach the server. Please try again." });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-sm text-muted-foreground">
        <span>
          To: <span className="font-medium text-foreground">{email}</span>
        </span>
        {/* Sending from here keeps it on the lead's timeline; this is for reps who prefer their own mail app. */}
        <a
          href={`mailto:${email}${subject || body ? `?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}` : ""}`}
          onClick={() => logContact({ channel: "email" })}
          className="text-xs underline underline-offset-2 hover:text-foreground"
        >
          Use my email app instead
        </a>
      </div>
      <AiDraftControls
        leadId={leadId}
        channel="email"
        onDraft={({ draft, subject: s }) => {
          setBody(draft);
          if (s) setSubject(s);
        }}
        disabled={sending}
      />
      <Input ref={subjectRef} placeholder="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
      <textarea
        placeholder="Write your message…" value={body} onChange={(e) => setBody(e.target.value)} rows={6}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
      />
      <div className="flex justify-end">
        <Button onClick={send} disabled={sending || !subject.trim() || !body.trim()} className="gap-2">
          <Mail className="h-4 w-4" />{sending ? "Sending…" : "Send email"}
        </Button>
      </div>
    </div>
  );
}

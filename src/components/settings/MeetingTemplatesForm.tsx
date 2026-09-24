"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveMeetingTemplatesAction } from "@/lib/actions/meetings";
import { useToast } from "@/hooks/use-toast";

// Approved WhatsApp template names used for meeting confirmations/reminders when the lead hasn't
// messaged in the last 24h (Business API only allows templates then).
export function MeetingTemplatesForm({
  initial,
  bspMode,
}: {
  initial: { confirmTemplate: string | null; reminderTemplate: string | null; language: string };
  bspMode: boolean;
}) {
  const { toast } = useToast();
  const [f, setF] = React.useState({ confirmTemplate: initial.confirmTemplate ?? "", reminderTemplate: initial.reminderTemplate ?? "", language: initial.language });
  const [saving, setSaving] = React.useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await saveMeetingTemplatesAction(f);
      toast(res.ok ? { title: "Templates saved" } : { variant: "destructive", title: "Not saved", description: res.message });
    } catch {
      toast({ variant: "destructive", title: "Not saved", description: "We couldn't reach the server. Please try again." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-3 rounded-2xl border bg-card p-4">
      <div>
        <h3 className="text-sm font-semibold">WhatsApp templates for meetings</h3>
        <p className="text-xs text-muted-foreground">
          {bspMode
            ? "When a lead hasn't messaged you in the last 24 hours, WhatsApp only allows approved templates. Enter the names of templates you've had approved and meeting confirmations and reminders go out automatically."
            : "Only used when WhatsApp is set to Business API mode. In personal mode, reps send meeting messages from their own WhatsApp in one tap."}
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1">
          <span className="text-xs text-muted-foreground">Confirmation template name</span>
          <Input placeholder="meeting_confirmation" value={f.confirmTemplate} onChange={(e) => setF({ ...f, confirmTemplate: e.target.value })} />
        </label>
        <label className="space-y-1">
          <span className="text-xs text-muted-foreground">Reminder template name</span>
          <Input placeholder="meeting_reminder" value={f.reminderTemplate} onChange={(e) => setF({ ...f, reminderTemplate: e.target.value })} />
        </label>
        <label className="space-y-1">
          <span className="text-xs text-muted-foreground">Template language</span>
          <Input placeholder="en_US" value={f.language} onChange={(e) => setF({ ...f, language: e.target.value })} />
        </label>
      </div>
      <p className="text-xs text-muted-foreground">
        Write both templates with four variables: <code>{"{{1}}"}</code> first name, <code>{"{{2}}"}</code> meeting type,{" "}
        <code>{"{{3}}"}</code> date &amp; time, <code>{"{{4}}"}</code> place or join link. Example: &ldquo;Hi {"{{1}}"}, your {"{{2}}"} is on {"{{3}}"}. Details: {"{{4}}"}&rdquo;.
      </p>
      <div className="flex justify-end">
        <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save templates"}</Button>
      </div>
    </form>
  );
}

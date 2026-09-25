"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveMeetingTemplatesAction } from "@/lib/actions/meetings";
import { useToast } from "@/hooks/use-toast";

// Meta template language codes most used by Indian businesses. A saved code not listed stays selectable.
const LANGS = [
  { code: "en", name: "English" },
  { code: "en_US", name: "English (US)" },
  { code: "en_GB", name: "English (UK)" },
  { code: "hi", name: "Hindi" },
  { code: "te", name: "Telugu" },
  { code: "ta", name: "Tamil" },
  { code: "kn", name: "Kannada" },
  { code: "ml", name: "Malayalam" },
  { code: "mr", name: "Marathi" },
  { code: "gu", name: "Gujarati" },
  { code: "bn", name: "Bengali" },
];

// Approved WhatsApp template names used for meeting confirmations/reminders when the lead hasn't
// messaged in the last 24h (Business API only allows templates then). Shown only in Business API mode.
export function MeetingTemplatesForm({
  initial,
}: {
  initial: { confirmTemplate: string | null; reminderTemplate: string | null; language: string };
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
          When a customer hasn&apos;t messaged you in the last 24 hours, WhatsApp only allows approved templates. Enter the names of templates
          you&apos;ve had approved, and meeting confirmations and reminders go out automatically. Leave blank and your team sends them by hand.
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
          <span className="text-xs text-muted-foreground">Template language (must match the approved template)</span>
          <select
            value={f.language}
            onChange={(e) => setF({ ...f, language: e.target.value })}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            {(LANGS.some((l) => l.code === f.language) ? LANGS : [...LANGS, { code: f.language, name: f.language }]).map((l) => (
              <option key={l.code} value={l.code}>{l.name} ({l.code})</option>
            ))}
          </select>
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

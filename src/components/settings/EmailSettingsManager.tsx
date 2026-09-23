"use client";

import * as React from "react";
import { Mail, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { updateEmailSettingsAction, sendTestEmailAction } from "@/lib/actions/emailSettings";

type View = {
  fromName: string | null;
  fromEmail: string | null;
  smtpHost: string | null;
  smtpPort: number | null;
  smtpSecure: boolean;
  smtpUser: string | null;
  hasPassword: boolean;
  enabled: boolean;
};

export function EmailSettingsManager({ initial }: { initial: View }) {
  const { toast } = useToast();
  const [f, setF] = React.useState({
    fromName: initial.fromName ?? "",
    fromEmail: initial.fromEmail ?? "",
    smtpHost: initial.smtpHost ?? "",
    smtpPort: initial.smtpPort ? String(initial.smtpPort) : "587",
    smtpSecure: initial.smtpSecure,
    smtpUser: initial.smtpUser ?? "",
    smtpPassword: "", // never prefilled
    enabled: initial.enabled,
  });
  const [hasPassword, setHasPassword] = React.useState(initial.hasPassword);
  const [saving, setSaving] = React.useState(false);
  const [testing, setTesting] = React.useState(false);
  const set = (k: keyof typeof f) => (v: string | boolean) => setF((s) => ({ ...s, [k]: v }));

  async function save() {
    setSaving(true);
    try {
      const res = await updateEmailSettingsAction({
        fromName: f.fromName,
        fromEmail: f.fromEmail,
        smtpHost: f.smtpHost,
        smtpPort: f.smtpPort ? Number(f.smtpPort) : undefined,
        smtpSecure: f.smtpSecure,
        smtpUser: f.smtpUser,
        smtpPassword: f.smtpPassword || undefined,
        enabled: f.enabled,
      });
      if (!res.ok) {
        toast({ variant: "destructive", title: "Couldn't save", description: res.message });
        return;
      }
      setF((s) => ({ ...s, smtpPassword: "" }));
      setHasPassword(res.data.hasPassword);
      toast({ title: "Email settings saved" });
    } catch {
      toast({ variant: "destructive", title: "Couldn't save", description: "We couldn't reach the server. Please try again." });
    } finally {
      setSaving(false);
    }
  }

  async function test() {
    setTesting(true);
    try {
      const res = await sendTestEmailAction();
      if (!res.ok) {
        toast({ variant: "destructive", title: "Test failed", description: res.message });
        return;
      }
      toast({ title: "Test email sent", description: `Check ${res.data.sentTo}.` });
    } catch {
      toast({ variant: "destructive", title: "Test failed", description: "We couldn't reach the server. Please try again." });
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border p-5 space-y-4">
        <p className="text-sm font-medium flex items-center gap-2"><Mail className="h-4 w-4" /> Sender</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>From name</Label>
            <Input value={f.fromName} onChange={(e) => set("fromName")(e.target.value)} placeholder="Acme Sales" />
          </div>
          <div>
            <Label>From email</Label>
            <Input value={f.fromEmail} onChange={(e) => set("fromEmail")(e.target.value)} placeholder="sales@acme.com" autoCapitalize="none" />
          </div>
        </div>
      </div>

      <div className="rounded-2xl border p-5 space-y-4">
        <p className="text-sm font-medium">SMTP server</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Host</Label>
            <Input value={f.smtpHost} onChange={(e) => set("smtpHost")(e.target.value)} placeholder="smtp.acme.com" autoCapitalize="none" />
          </div>
          <div>
            <Label>Port</Label>
            <Input value={f.smtpPort} onChange={(e) => set("smtpPort")(e.target.value)} placeholder="587" inputMode="numeric" />
          </div>
          <div>
            <Label>Username</Label>
            <Input value={f.smtpUser} onChange={(e) => set("smtpUser")(e.target.value)} placeholder="apikey / user@acme.com" autoCapitalize="none" />
          </div>
          <div>
            <Label>Password</Label>
            <PasswordInput
              value={f.smtpPassword}
              onChange={(e) => set("smtpPassword")(e.target.value)}
              placeholder={hasPassword ? "•••••••• (leave blank to keep)" : "SMTP password"}
              autoCapitalize="none"
            />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={f.smtpSecure} onChange={(e) => set("smtpSecure")(e.target.checked)} />
          Use TLS (SSL) — on for port 465, off for 587/STARTTLS
        </label>
      </div>

      <div className="rounded-2xl border p-5 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">Use my SMTP server</p>
          <p className="text-xs text-muted-foreground">When off, emails send via the built-in transport.</p>
        </div>
        <label className="relative inline-flex cursor-pointer items-center">
          <input type="checkbox" className="peer sr-only" checked={f.enabled} onChange={(e) => set("enabled")(e.target.checked)} />
          <div className="h-6 w-11 rounded-full bg-muted peer-checked:bg-primary transition-colors" />
          <div className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-background transition-transform peer-checked:translate-x-5" />
        </label>
      </div>

      <div className="flex items-center gap-2">
        <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        <Button variant="outline" onClick={test} disabled={testing} className="gap-2">
          <Send className="h-4 w-4" /> {testing ? "Sending…" : "Send test email"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        The password is encrypted at rest and never shown again. Test sends to your own account email
        using the saved settings — do this before turning the toggle on.
      </p>
    </div>
  );
}

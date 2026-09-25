"use client";

import * as React from "react";
import { Mail, Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { StatusMessage, type Status } from "@/components/ui/status-message";
import { useToast } from "@/hooks/use-toast";
import { updateEmailSettingsAction, sendTestEmailAction, removeEmailSettingsAction } from "@/lib/actions/emailSettings";
import type { EmailSettingsView } from "@/domains/organizations/emailSettingsService";

// Common providers: fills host + port. TLS mode follows the port, so nothing else to pick.
const PRESETS = [
  { label: "Google Workspace", host: "smtp.gmail.com", port: 587 },
  { label: "Microsoft 365", host: "smtp.office365.com", port: 587 },
  { label: "Zoho", host: "smtp.zoho.com", port: 587 },
  { label: "SendGrid", host: "smtp.sendgrid.net", port: 587 },
];

function toForm(v: EmailSettingsView) {
  return {
    fromName: v.fromName ?? "",
    fromEmail: v.fromEmail ?? "",
    replyTo: v.replyTo ?? "",
    smtpHost: v.smtpHost ?? "",
    smtpPort: v.smtpPort ? String(v.smtpPort) : "587",
    smtpUser: v.smtpUser ?? "",
    smtpPassword: "", // never prefilled
    enabled: v.enabled,
  };
}
type Form = ReturnType<typeof toForm>;

const when = (d: Date | string) => new Date(d).toLocaleString();

function Field({ id, label, error, hint, children }: { id: string; label: string; error?: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? <p id={`${id}-error`} className="text-xs text-destructive">{error}</p> : hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function EmailSettingsManager({ initial }: { initial: EmailSettingsView }) {
  const { toast } = useToast();
  const [view, setView] = React.useState(initial);
  const [f, setF] = React.useState(() => toForm(initial));
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [status, setStatus] = React.useState<Status>(null);
  const [busy, setBusy] = React.useState<null | "save" | "test" | "remove">(null);
  const set = (k: keyof Form) => (v: string | boolean) => {
    setF((s) => ({ ...s, [k]: v }));
    setErrors((e) => ({ ...e, [k]: "" }));
  };
  const input = (k: keyof Form) => ({
    id: k,
    value: f[k] as string,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => set(k)(e.target.value),
    "aria-invalid": !!errors[k] || undefined,
    "aria-describedby": errors[k] ? `${k}-error` : undefined,
  });
  const payload = () => ({ ...f, smtpPassword: f.smtpPassword || undefined });

  function applyView(v: EmailSettingsView) {
    setView(v);
    setF(toForm(v));
    setErrors({});
  }

  async function run<T extends { view: EmailSettingsView }>(
    kind: "save" | "test" | "remove",
    call: () => Promise<{ ok: true; data: T } | { ok: false; message: string; fieldErrors?: Record<string, string> }>,
    success: (d: T) => string,
  ) {
    setBusy(kind);
    setStatus(null);
    try {
      const res = await call();
      if (!res.ok) {
        setErrors(res.fieldErrors ?? {});
        setStatus({ kind: "error", text: res.message });
        return;
      }
      applyView(res.data.view);
      toast({ title: success(res.data) });
    } catch {
      setStatus({ kind: "error", text: "We couldn't reach the server. Please try again." });
    } finally {
      setBusy(null);
    }
  }

  const save = () =>
    run("save", () => updateEmailSettingsAction(payload()), (d) => (d.tested ? "Test email sent and settings saved" : "Email settings saved"));
  const test = () => run("test", () => sendTestEmailAction(payload()), (d) => `Test email sent to ${d.sentTo} — settings saved`);
  const remove = () => {
    if (!window.confirm("Remove your SMTP settings? Emails will go from Ridhzo's default address.")) return;
    run("remove", () => removeEmailSettingsAction(), () => "SMTP settings removed");
  };

  const port = Number(f.smtpPort);
  const configured = !!(view.smtpHost || view.hasPassword || view.passwordUnreadable);

  return (
    <div className="space-y-5">
      <StatusMessage status={status} />

      {/* Current state, so the admin knows whether mail is actually going out through their server. */}
      {view.lastError ? (
        <StatusMessage status={{ kind: "error", text: `Last send failed${view.lastErrorAt ? ` (${when(view.lastErrorAt)})` : ""}: ${view.lastError}` }} />
      ) : view.passwordUnreadable ? (
        <StatusMessage status={{ kind: "error", text: "The saved password can no longer be read. Re-enter it and save." }} />
      ) : view.enabled ? (
        <StatusMessage status={{ kind: "success", text: `Active: lead emails are sent from ${view.fromEmail}${view.verifiedAt ? `. Last tested ${when(view.verifiedAt)}` : ""}.` }} />
      ) : null}

      <div className="rounded-2xl border p-5 space-y-4">
        <p className="text-sm font-medium flex items-center gap-2"><Mail className="h-4 w-4" /> Sender</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="fromName" label="From name" error={errors.fromName}>
            <Input {...input("fromName")} placeholder="Acme Sales" />
          </Field>
          <Field id="fromEmail" label="From email" error={errors.fromEmail}>
            <Input {...input("fromEmail")} type="email" placeholder="sales@acme.com" autoCapitalize="none" />
          </Field>
          <Field id="replyTo" label="Reply-to (optional)" error={errors.replyTo} hint="Where lead replies go, if not the from email.">
            <Input {...input("replyTo")} type="email" placeholder="team@acme.com" autoCapitalize="none" />
          </Field>
        </div>
        <p className="text-xs text-muted-foreground">
          Use an address on a domain your mail server is allowed to send for (SPF/DKIM), or messages may land in spam.
        </p>
      </div>

      <div className="rounded-2xl border p-5 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium mr-auto">SMTP server</p>
          {PRESETS.map((p) => (
            <Button key={p.label} type="button" variant="outline" size="sm" onClick={() => { set("smtpHost")(p.host); set("smtpPort")(String(p.port)); }}>
              {p.label}
            </Button>
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="smtpHost" label="Host" error={errors.smtpHost}>
            <Input {...input("smtpHost")} placeholder="smtp.acme.com" autoCapitalize="none" />
          </Field>
          <Field id="smtpPort" label="Port" error={errors.smtpPort} hint={port === 465 ? "465 uses SSL/TLS." : "Uses STARTTLS. Use 465 for SSL/TLS."}>
            <Input {...input("smtpPort")} placeholder="587" inputMode="numeric" />
          </Field>
          <Field id="smtpUser" label="Username" error={errors.smtpUser}>
            <Input {...input("smtpUser")} placeholder="apikey / user@acme.com" autoCapitalize="none" />
          </Field>
          <Field id="smtpPassword" label="Password" error={errors.smtpPassword} hint="Encrypted and never shown again.">
            <PasswordInput
              {...input("smtpPassword")}
              placeholder={view.hasPassword ? "•••••••• (leave blank to keep)" : "SMTP password"}
              autoCapitalize="none"
              autoComplete="new-password"
            />
          </Field>
        </div>
      </div>

      <div className="rounded-2xl border p-5 flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium">Send from my SMTP server</p>
          <p className="text-xs text-muted-foreground">
            Covers emails to leads (manual emails, sequences, meeting confirmations), new-lead alerts and daily summaries.
            When off, they go from Ridhzo&apos;s default address. Turning it on sends you a test email first.
          </p>
        </div>
        <Switch label="Send from my SMTP server" checked={f.enabled} onChange={(v) => set("enabled")(v)} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={save} disabled={!!busy}>{busy === "save" ? "Saving…" : "Save"}</Button>
        <Button variant="outline" onClick={test} disabled={!!busy} className="gap-2">
          <Send className="h-4 w-4" /> {busy === "test" ? "Sending…" : "Send test email"}
        </Button>
        {configured && (
          <Button variant="ghost" onClick={remove} disabled={!!busy} className="gap-2 ml-auto text-destructive">
            <Trash2 className="h-4 w-4" /> {busy === "remove" ? "Removing…" : "Remove"}
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        The test uses what&apos;s in the form (unsaved changes included), sends to your own account email, and saves the settings if it works.
      </p>
    </div>
  );
}

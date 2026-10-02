"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { beginAdminMfaEnrollAction, confirmAdminMfaEnrollAction, verifyAdminMfaAction } from "@/lib/actions/adminMfa";

// Shown instead of the platform console until the operator has passed two-factor this session.
export function AdminMfaGate({ enrolled }: { enrolled: boolean }) {
  const router = useRouter();
  const [setup, setSetup] = React.useState<{ secret: string; uri: string } | null>(null);
  const [code, setCode] = React.useState("");
  const [msg, setMsg] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function start() {
    setBusy(true); setMsg(null);
    try {
      const r = await beginAdminMfaEnrollAction();
      if (r.ok) setSetup(r.data); else setMsg(r.message);
    } catch { setMsg("Couldn't start setup. Please try again."); }
    finally { setBusy(false); }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      const r = setup ? await confirmAdminMfaEnrollAction(code) : await verifyAdminMfaAction(code);
      if (r.ok) { router.refresh(); return; }
      setMsg(r.message);
    } catch { setMsg("Couldn't verify the code. Please try again."); }
    finally { setBusy(false); }
  }

  return (
    <div className="mx-auto mt-16 max-w-md space-y-4 rounded-2xl border border-border bg-card p-8">
      <div className="flex items-center gap-2 text-lg font-semibold"><ShieldCheck className="h-5 w-5" /> Platform two-factor</div>
      {!enrolled && !setup ? (
        <>
          <p className="text-sm text-muted-foreground">The platform console needs an authenticator app (Google Authenticator, 1Password, Authy). Set it up now — it takes a minute.</p>
          <Button onClick={start} disabled={busy}>Set up authenticator</Button>
        </>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          {setup && (
            <div className="space-y-2 text-sm">
              <p className="text-muted-foreground">Add this account to your authenticator app, using this key (or open the link on your phone):</p>
              <code className="block break-all rounded bg-muted p-2 text-xs">{setup.secret}</code>
              <a className="text-xs underline" href={setup.uri}>Open in authenticator</a>
              <p className="text-muted-foreground">Then enter the 6-digit code it shows.</p>
            </div>
          )}
          {!setup && <p className="text-sm text-muted-foreground">Enter the 6-digit code from your authenticator app.</p>}
          <Input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} placeholder="123456" aria-label="Authenticator code" />
          {msg && <p role="alert" className="text-sm text-destructive">{msg}</p>}
          <Button type="submit" disabled={busy || code.length !== 6}>{setup ? "Turn on and continue" : "Verify"}</Button>
        </form>
      )}
      {!enrolled && !setup && msg && <p role="alert" className="text-sm text-destructive">{msg}</p>}
    </div>
  );
}

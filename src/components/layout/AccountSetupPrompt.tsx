"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { CheckCircle2, ChevronDown, Circle, Mail, KeyRound, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusMessage, type Status } from "@/components/ui/status-message";
import { requestEmailVerificationAction, startGoogleLinkAction, changePasswordAction } from "@/lib/actions/account";

type Item = "email" | "password";
const SNOOZE_MS = 3 * 24 * 60 * 60 * 1000; // dismissed → ask again in 3 days, until everything is set up

// Non-blocking bottom card for accounts registered with a mobile number: add an email (verified by
// link), set a password, connect Google. All three attach to this same account — none creates a new one.
export function AccountSetupPrompt({ userId, status, pendingEmail }: { userId: string; status: { email: boolean; password: boolean; google: boolean }; pendingEmail: string | null }) {
  const router = useRouter();
  const key = `account-setup-dismissed:${userId}`;
  const [visible, setVisible] = useState(false);
  const [open, setOpen] = useState<Item | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Status>(null);
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");

  useEffect(() => {
    try {
      const at = Number(localStorage.getItem(key));
      setVisible(!at || Date.now() - at > SNOOZE_MS);
    } catch {
      setVisible(true);
    }
  }, [key]);

  if (!visible) return null;
  const done = Object.values(status).filter(Boolean).length;
  const dismiss = () => {
    try { localStorage.setItem(key, String(Date.now())); } catch {}
    setVisible(false);
  };
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setMsg(null);
    try { await fn(); } catch { setMsg({ kind: "error", text: "Something went wrong. Check your connection, or you may not have permission for this, then try again." }); } finally { setBusy(false); }
  };

  const sendEmail = () => run(async () => {
    const res = await requestEmailVerificationAction({ email });
    if (!res.ok) return setMsg({ kind: "error", text: res.message });
    setMsg({ kind: "success", text: `Verification link sent to ${res.data.email}. It's valid for 24 hours.` });
    setEmail("");
    router.refresh();
  });

  const savePassword = () => run(async () => {
    if (pw.length < 6) return setMsg({ kind: "error", text: "Password must be at least 6 characters." });
    if (pw !== pw2) return setMsg({ kind: "error", text: "Passwords don't match." });
    const res = await changePasswordAction({ newPassword: pw });
    if (!res.ok) return setMsg({ kind: "error", text: res.message });
    setPw(""); setPw2(""); setOpen(null);
    setMsg({ kind: "success", text: "Password saved. You can now log in with your mobile number and password." });
    router.refresh();
  });

  const connectGoogle = () => run(async () => {
    await startGoogleLinkAction();
    await signIn("google", { callbackUrl: "/profile?linked=google" });
  });

  const row = (item: Item, label: string, ok: boolean, Icon: typeof Mail, hint?: string) => (
    <button
      type="button"
      disabled={ok}
      onClick={() => { setOpen(open === item ? null : item); setMsg(null); }}
      aria-expanded={open === item}
      className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-muted disabled:cursor-default disabled:hover:bg-transparent"
    >
      {ok ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" /> : <Circle className="h-4 w-4 shrink-0 text-muted-foreground" />}
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="flex-1">{label}{hint && !ok ? <span className="block text-xs text-amber-600">{hint}</span> : null}</span>
      {ok ? <span className="text-xs text-emerald-600">Done</span> : <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open === item ? "rotate-180" : ""}`} />}
    </button>
  );

  return (
    <div role="dialog" aria-label="Complete your account setup" className="fixed inset-x-3 bottom-3 z-40 sm:inset-x-auto sm:bottom-4 sm:left-1/2 sm:w-[26rem] sm:-translate-x-1/2">
      <div className="max-h-[80dvh] overflow-y-auto rounded-2xl border border-border bg-card p-4 shadow-lg">
        <div className="flex items-start gap-2">
          <div className="flex-1">
            <p className="text-sm font-semibold">Complete your account setup</p>
            <p className="text-xs text-muted-foreground">Add your email and set a password so you have more ways to access your account.</p>
          </div>
          <button type="button" aria-label="Dismiss" onClick={dismiss} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-2 flex items-center gap-2" aria-label={`${done} of 3 steps done`}>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-primary transition-all" style={{ width: `${(done / 3) * 100}%` }} />
          </div>
          <span className="text-xs text-muted-foreground">{done} of 3</span>
        </div>

        <div className="mt-2">
          {row("email", "Add email", status.email, Mail, pendingEmail ? `Verification pending: ${pendingEmail}` : undefined)}
          {open === "email" && !status.email && (
            <div className="space-y-2 px-2 pb-2">
              <div className="flex gap-2">
                <Input type="email" aria-label="Email address" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
                <Button size="sm" className="h-10" onClick={sendEmail} disabled={busy || !email.includes("@")}>
                  {pendingEmail ? "Resend" : "Verify"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">We'll email a link. The email is added once you click it.</p>
            </div>
          )}
          {row("password", "Set password", status.password, KeyRound)}
          {open === "password" && !status.password && (
            <div className="space-y-2 px-2 pb-2">
              <Input type="password" aria-label="New password" placeholder="New password (6+ characters)" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" />
              <Input type="password" aria-label="Confirm password" placeholder="Confirm password" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" />
              <Button size="sm" className="w-full" onClick={savePassword} disabled={busy || !pw || !pw2}>Save password</Button>
            </div>
          )}
          <div className="flex items-center gap-2 px-2 py-2 text-sm">
            {status.google ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" /> : <Circle className="h-4 w-4 shrink-0 text-muted-foreground" />}
            <span className="flex-1">Google login</span>
            {status.google ? <span className="text-xs text-emerald-600">Done</span> : (
              <Button variant="outline" size="sm" onClick={connectGoogle} disabled={busy}>Continue with Google</Button>
            )}
          </div>
        </div>
        <StatusMessage status={msg} />
      </div>
    </div>
  );
}

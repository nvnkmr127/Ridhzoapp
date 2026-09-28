"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { StatusMessage, type Status } from "@/components/ui/status-message";
import { changePasswordAction } from "@/lib/actions/account";

// hasPassword = the user chose a password before; then the current one is required to change it.
export function PasswordForm({ hasPassword }: { hasPassword: boolean }) {
  const router = useRouter();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState<Status>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (next !== confirm) return setMsg({ kind: "error", text: "New passwords don't match." });
    setBusy(true);
    setMsg(null);
    try {
      const res = await changePasswordAction({ currentPassword: current, newPassword: next });
      if (!res.ok) return setMsg({ kind: "error", text: res.message });
      setCurrent("");
      setNext("");
      setConfirm("");
      setMsg({ kind: "success", text: hasPassword ? "Password changed." : "Password set. You can now log in with your email and password." });
      router.refresh();
    } catch {
      setMsg({ kind: "error", text: "We couldn't reach the server. Check your connection and try again." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="bg-card p-6 rounded-2xl border border-border space-y-4">
      <div>
        <h2 className="text-lg font-semibold">{hasPassword ? "Change password" : "Set a password"}</h2>
        {!hasPassword && (
          <p className="text-sm text-muted-foreground">You signed up with Google or WhatsApp. Set a password to also log in with your email.</p>
        )}
      </div>
      <StatusMessage status={msg} />
      {hasPassword && (
        <div className="space-y-1.5">
          <Label htmlFor="current-password">Current password</Label>
          <PasswordInput id="current-password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="new-password">New password</Label>
          <PasswordInput id="new-password" autoComplete="new-password" minLength={6} maxLength={72} value={next} onChange={(e) => setNext(e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="confirm-password">Confirm new password</Label>
          <PasswordInput id="confirm-password" autoComplete="new-password" minLength={6} maxLength={72} value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
        </div>
      </div>
      <Button type="submit" disabled={busy}>{hasPassword ? "Change password" : "Set password"}</Button>
    </form>
  );
}

"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { StatusMessage, type Status } from "@/components/ui/status-message";
import { acceptInvitationAction } from "@/lib/actions/invitations";

export function AcceptInviteForm({ token, email }: { token: string; email: string }) {
  const router = useRouter();
  // Inline rather than a toast: toasts vanish, and on success the user is sent to /login anyway.
  const [status, setStatus] = React.useState<Status>(null);
  const [firstName, setFirstName] = React.useState("");
  const [lastName, setLastName] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus(null);
    if (password.length < 6) {
      setStatus({ kind: "error", text: "Password must be at least 6 characters." });
      return;
    }
    setSaving(true);
    try {
      const res = await acceptInvitationAction({ token, password, firstName: firstName || undefined, lastName: lastName || undefined });
      if (!res.ok) {
        setStatus({ kind: "error", text: res.message || "We couldn't accept this invite. Please try again." });
        return;
      }
      setStatus({ kind: "success", text: "Account created. Taking you to log in…" });
      router.push("/login?notice=invite-accepted");
    } catch {
      setStatus({ kind: "error", text: "We couldn't reach the server. Check your connection and try again." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <StatusMessage status={status} />
      <div className="space-y-1">
        <Label>Email</Label>
        <div className="text-sm bg-muted rounded-md px-3 py-2 text-muted-foreground">{email}</div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1"><Label htmlFor="fn">First name</Label><Input id="fn" value={firstName} onChange={(e) => setFirstName(e.target.value)} /></div>
        <div className="space-y-1"><Label htmlFor="ln">Last name</Label><Input id="ln" value={lastName} onChange={(e) => setLastName(e.target.value)} /></div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="pw">Choose a password</Label>
        <PasswordInput id="pw" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min 6 characters" required />
      </div>
      <Button type="submit" className="w-full" disabled={saving || status?.kind === "success"}>
        {saving ? "Creating account…" : "Accept invitation"}
      </Button>
    </form>
  );
}

"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { StatusMessage } from "@/components/ui/status-message";
import { resetPasswordAction } from "@/lib/actions/auth";

export function ResetPasswordForm({ token, email }: { token: string; email: string }) {
  const router = useRouter();
  const [password, setPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setSaving(true);
    try {
      const res = await resetPasswordAction({ token, password });
      if (!res.ok) {
        setError(res.message || "We couldn't update your password. Please try again.");
        return;
      }
      setSuccess(true);
      setTimeout(() => {
        router.push("/login?notice=password-reset");
      }, 2500);
    } catch {
      setError("We couldn't reach the server. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  if (success) {
    return (
      <div className="space-y-4 text-center">
        <StatusMessage className="text-left" status={{ kind: "success", text: "Password updated. Taking you to log in…" }} />
        <Button asChild className="w-full">
          <Link href="/login">Log in now</Link>
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <StatusMessage status={error ? { kind: "error", text: error } : null} />

      <div className="space-y-1">
        <Label>Account</Label>
        <div className="text-sm bg-muted rounded-md px-3 py-2 text-muted-foreground">{email}</div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">New Password</Label>
        <PasswordInput
          id="password"
          placeholder="Min 6 characters"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoFocus
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirmPassword">Confirm New Password</Label>
        <PasswordInput
          id="confirmPassword"
          placeholder="Re-enter password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
        />
      </div>

      <Button type="submit" className="w-full" disabled={saving || password.length < 6}>
        {saving ? "Resetting password…" : "Reset Password"}
      </Button>

      <p className="text-center text-sm text-muted-foreground pt-2">
        Remember your password?{" "}
        <Link href="/login" className="text-foreground underline font-medium">
          Log in
        </Link>
      </p>
    </form>
  );
}

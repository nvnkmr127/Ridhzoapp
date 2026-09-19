"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { requestPasswordResetAction } from "@/lib/actions/auth";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email || !email.includes("@")) {
      setError("Please enter a valid email address.");
      return;
    }

    setLoading(true);
    try {
      const res = await requestPasswordResetAction({ email });
      if (!res.ok) {
        setError(res.message || "Failed to request password reset.");
        return;
      }
      setSubmitted(true);
    } catch {
      setError("Failed to connect to server. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-dvh w-full items-center justify-center bg-muted py-10 px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-2xl font-bold">Forgot password</CardTitle>
          <p className="text-sm text-muted-foreground">
            Enter your email and we will send you a reset link
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <div className="space-y-2">
              <Alert variant="destructive">{error}</Alert>
              <Button asChild variant="outline" size="sm" className="w-full">
                <Link href="/signup">Create a new account</Link>
              </Button>
            </div>
          )}

          {submitted ? (
            <div className="space-y-4 text-center">
              <div className="rounded-lg bg-green-50 dark:bg-green-950/40 p-4 border border-green-200 dark:border-green-800 text-sm text-green-800 dark:text-green-200 leading-relaxed">
                We have sent instructions to reset your password to <span className="font-semibold">{email}</span>. Please check your inbox.
              </div>
              <p className="text-xs text-muted-foreground">
                Don&apos;t see the email? Check your spam folder or wait a couple of minutes.
              </p>
              <Button asChild variant="outline" className="w-full">
                <Link href="/login">Back to log in</Link>
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email address</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoFocus
                  required
                />
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Sending reset link…" : "Send reset link"}
              </Button>

              <p className="text-center text-sm text-muted-foreground pt-2">
                Remember your password?{" "}
                <Link href="/login" className="text-foreground underline font-medium">
                  Log in
                </Link>
              </p>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

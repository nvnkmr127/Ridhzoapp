"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { StatusMessage } from "@/components/ui/status-message";
import { requestPasswordResetAction } from "@/lib/actions/auth";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Only "no account with this email" should offer signup — not network or server failures.

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
        setError(res.message || "We couldn't send the reset link. Please try again.");
        return;
      }
      setSubmitted(true);
    } catch {
      setError("We couldn't reach the server. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-dvh w-full items-center justify-center bg-muted py-10 px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 text-center">
          <div className="flex justify-center pb-2">
            <Image
              src="/logos/Ridhzo-Logo-Final_Horizontal-Light.png"
              alt="Ridhzo"
              width={140}
              height={44}
              className="h-9 w-auto object-contain"
              priority
            />
          </div>
          <CardTitle className="text-2xl font-bold">Forgot password</CardTitle>
          <p className="text-sm text-muted-foreground">
            Enter your email and we will send you a reset link
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <div className="space-y-2">
              <StatusMessage status={{ kind: "error", text: error }} />
            </div>
          )}

          {submitted ? (
            <div className="space-y-4 text-center">
              <StatusMessage
                className="text-left"
                status={{ kind: "success", text: `If ${email} has a Ridhzo account, we've sent a reset link. It's valid for 1 hour.` }}
              />
              <p className="text-xs text-muted-foreground">
                Don&apos;t see it? Check spam or wait a couple of minutes. Signed up with WhatsApp? Log in with WhatsApp OTP instead —
                or <Link href="/signup" className="underline">create an account</Link>.
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

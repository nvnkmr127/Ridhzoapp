"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useState, useEffect } from "react";
import { signupAction } from "@/lib/actions/auth";
import { sendFirebasePhoneOtp, confirmFirebasePhoneOtp } from "@/lib/firebase/client";
import type { ConfirmationResult } from "firebase/auth";
import { captureAttribution, getStoredAttribution } from "@/lib/tracking/utm";

const signupSchema = z.object({
  orgName: z.string().min(1, "Workspace name is required"),
  firstName: z.string().min(1, "Your name is required"),
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "At least 6 characters"),
});

type SignupValues = z.infer<typeof signupSchema>;

export default function SignupPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);

  useEffect(() => {
    captureAttribution();
  }, []);

  // Phone OTP state
  const [phoneOrgName, setPhoneOrgName] = useState("");
  const [phoneName, setPhoneName] = useState("");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);
  const [phoneLoading, setPhoneLoading] = useState(false);

  const form = useForm<SignupValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: { orgName: "", firstName: "", email: "", password: "" },
  });

  const onEmailSubmit = async (data: SignupValues) => {
    setError(null);
    try {
      const attribution = getStoredAttribution() ?? undefined;
      const res = await signupAction({ ...data, attribution });
      if (!res.ok) {
        setError(res.message);
        return;
      }
    } catch {
      setError("We couldn't reach the server. Please try again.");
      return;
    }
    // Sign in immediately so the new session carries the org.
    const result = await signIn("credentials", {
      redirect: false,
      email: data.email,
      password: data.password,
    });
    if (result?.error) {
      router.push("/login");
    } else {
      router.push("/leads");
    }
  };

  const handleGoogleSignUp = async () => {
    setError(null);
    setGoogleLoading(true);
    try {
      await signIn("google", { callbackUrl: "/leads" });
    } catch {
      setError("Could not initiate Google sign up.");
      setGoogleLoading(false);
    }
  };

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!phoneName.trim()) {
      setError("Please enter your name.");
      return;
    }

    const clean = phone.trim();
    if (!clean || clean.length < 10) {
      setError("Please enter a valid 10-digit mobile number.");
      return;
    }

    const formatted = clean.startsWith("+")
      ? clean
      : `+91${clean.replace(/^0+/, "")}`;

    setPhoneLoading(true);
    try {
      const res = await sendFirebasePhoneOtp(formatted, "recaptcha-signup-container");
      setConfirmationResult(res);
    } catch (err: any) {
      console.error("[phone-signup] sendOtp error:", err);
      setError(err?.message || "Failed to send SMS OTP. Please verify your phone number.");
    } finally {
      setPhoneLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!confirmationResult) return;
    if (otp.trim().length !== 6) {
      setError("Please enter the 6-digit OTP sent to your phone.");
      return;
    }

    setPhoneLoading(true);
    try {
      const { idToken, phoneNumber } = await confirmFirebasePhoneOtp(confirmationResult, otp.trim());
      const result = await signIn("phone-otp", {
        redirect: false,
        idToken,
        phoneNumber,
        name: phoneName.trim(),
        orgName: phoneOrgName.trim() || `${phoneName.trim()}'s Workspace`,
      });

      if (result?.error) {
        setError("Account creation failed. Please try again.");
      } else {
        router.push("/leads");
      }
    } catch (err: any) {
      console.error("[phone-signup] verifyOtp error:", err);
      setError(err?.message || "Invalid or expired OTP. Please try again.");
    } finally {
      setPhoneLoading(false);
    }
  };

  return (
    <div className="flex min-h-dvh w-full items-center justify-center bg-muted py-10 px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-2xl font-bold">Create your workspace</CardTitle>
          <p className="text-sm text-muted-foreground">Start closing leads faster with Ridhzo</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && <Alert variant="destructive">{error}</Alert>}

          {/* Google One-Click Sign Up */}
          <Button
            type="button"
            variant="outline"
            className="w-full flex items-center justify-center gap-3 h-11"
            onClick={handleGoogleSignUp}
            disabled={googleLoading}
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
              />
              <path
                fill="#34A853"
                d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"
              />
              <path
                fill="#FBBC05"
                d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
              />
              <path
                fill="#EA4335"
                d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
              />
            </svg>
            {googleLoading ? "Connecting to Google…" : "Sign up with Google"}
          </Button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">Or continue with</span>
            </div>
          </div>

          <Tabs defaultValue="phone" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="phone">Mobile OTP</TabsTrigger>
              <TabsTrigger value="email">Email</TabsTrigger>
            </TabsList>

            {/* Mobile OTP Tab */}
            <TabsContent value="phone" className="space-y-4 pt-2">
              <div id="recaptcha-signup-container" />
              {!confirmationResult ? (
                <form onSubmit={handleSendOtp} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="signup-phone-org">Workspace name</Label>
                    <Input
                      id="signup-phone-org"
                      placeholder="Acme Real Estate (optional)"
                      value={phoneOrgName}
                      onChange={(e) => setPhoneOrgName(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="signup-phone-name">Your Name</Label>
                    <Input
                      id="signup-phone-name"
                      placeholder="Jane Doe"
                      value={phoneName}
                      onChange={(e) => setPhoneName(e.target.value)}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="signup-phone">Mobile Number</Label>
                    <div className="flex">
                      <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-input bg-muted text-muted-foreground text-sm">
                        +91
                      </span>
                      <Input
                        id="signup-phone"
                        type="tel"
                        placeholder="98765 43210"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        className="rounded-l-none"
                        required
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      We will send a 6-digit verification code via SMS.
                    </p>
                  </div>

                  <Button type="submit" className="w-full" disabled={phoneLoading}>
                    {phoneLoading ? "Sending SMS OTP…" : "Send OTP"}
                  </Button>
                </form>
              ) : (
                <form onSubmit={handleVerifyOtp} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="signup-otp">Enter 6-Digit OTP</Label>
                    <Input
                      id="signup-otp"
                      type="text"
                      maxLength={6}
                      placeholder="123456"
                      value={otp}
                      onChange={(e) => setOtp(e.target.value)}
                      className="text-center tracking-widest text-lg font-bold"
                      autoFocus
                    />
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>Code sent to {phone}</span>
                      <button
                        type="button"
                        onClick={() => {
                          setConfirmationResult(null);
                          setOtp("");
                        }}
                        className="underline hover:text-foreground"
                      >
                        Change number
                      </button>
                    </div>
                  </div>

                  <Button type="submit" className="w-full" disabled={phoneLoading}>
                    {phoneLoading ? "Creating workspace…" : "Verify & Create Workspace"}
                  </Button>
                </form>
              )}
            </TabsContent>

            {/* Email Tab */}
            <TabsContent value="email" className="space-y-4 pt-2">
              <form onSubmit={form.handleSubmit(onEmailSubmit)} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="orgName">Workspace name</Label>
                  <Input id="orgName" placeholder="Acme Sales" {...form.register("orgName")} />
                  {form.formState.errors.orgName && (
                    <p className="text-sm text-destructive">{form.formState.errors.orgName.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="firstName">Your name</Label>
                  <Input id="firstName" placeholder="Jane Doe" {...form.register("firstName")} />
                  {form.formState.errors.firstName && (
                    <p className="text-sm text-destructive">{form.formState.errors.firstName.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Work email</Label>
                  <Input id="email" type="email" placeholder="m@example.com" {...form.register("email")} />
                  {form.formState.errors.email && (
                    <p className="text-sm text-destructive">{form.formState.errors.email.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input id="password" type="password" {...form.register("password")} />
                  {form.formState.errors.password && (
                    <p className="text-sm text-destructive">{form.formState.errors.password.message}</p>
                  )}
                </div>

                <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
                  {form.formState.isSubmitting ? "Creating…" : "Create workspace"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>

          <p className="text-center text-sm text-muted-foreground pt-2">
            Already have an account?{" "}
            <Link href="/login" className="text-foreground underline font-medium">
              Log in
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

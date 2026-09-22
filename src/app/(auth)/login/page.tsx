"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useEffect, useState } from "react";
import { sendWhatsAppOtpAction } from "@/lib/actions/auth";

const DEV = process.env.NODE_ENV === "development";
const DEV_EMAIL = process.env.NEXT_PUBLIC_DEV_LOGIN_EMAIL || "admin@acme.com";
const DEV_PASSWORD = process.env.NEXT_PUBLIC_DEV_LOGIN_PASSWORD || "password123";

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

type LoginValues = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);

  // Phone OTP state
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [phoneLoading, setPhoneLoading] = useState(false);

  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = async (data: LoginValues) => {
    setError(null);
    try {
      const result = await signIn("credentials", {
        redirect: false,
        email: data.email,
        password: data.password,
      });

      if (result?.error) {
        setError("Invalid email or password. Please try again.");
      } else {
        router.push("/");
      }
    } catch {
      setError("An unexpected error occurred. Please try again.");
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setGoogleLoading(true);
    try {
      await signIn("google", { callbackUrl: "/" });
    } catch {
      setError("Could not initiate Google sign in.");
      setGoogleLoading(false);
    }
  };

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
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
      const res = await sendWhatsAppOtpAction({ phone: formatted, purpose: "login" });
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setOtpSent(true);
    } catch (err: any) {
      console.error("[phone-login] sendOtp error:", err);
      setError(err?.message || "Failed to send WhatsApp OTP. Please check your number.");
    } finally {
      setPhoneLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (otp.trim().length !== 6) {
      setError("Please enter the 6-digit OTP sent to your WhatsApp.");
      return;
    }

    const clean = phone.trim();
    const formatted = clean.startsWith("+") ? clean : `+91${clean.replace(/^0+/, "")}`;

    setPhoneLoading(true);
    try {
      const result = await signIn("phone-otp", {
        redirect: false,
        phoneNumber: formatted,
        otp: otp.trim(),
      });

      if (result?.error) {
        setError("Invalid or expired OTP. Please try again.");
      } else {
        router.push("/");
      }
    } catch (err: any) {
      console.error("[phone-login] verifyOtp error:", err);
      setError(err?.message || "Invalid or expired OTP. Please try again.");
    } finally {
      setPhoneLoading(false);
    }
  };

  const devLogin = async () => {
    setError(null);
    const result = await signIn("credentials", { redirect: false, email: DEV_EMAIL, password: DEV_PASSWORD });
    if (result?.error) setError("Dev auto-login failed — is the DB seeded (npm run db:seed)?");
    else router.push("/");
  };

  useEffect(() => {
    if (DEV && process.env.NEXT_PUBLIC_DEV_AUTOLOGIN === "1") devLogin();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-muted p-4">
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
          <CardTitle className="text-2xl font-bold">Welcome back</CardTitle>
          <p className="text-sm text-muted-foreground">Sign in to your Ridhzo account</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Google One-Click Login */}
          <Button
            type="button"
            variant="outline"
            className="w-full flex items-center justify-center gap-3 h-11"
            onClick={handleGoogleSignIn}
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
            {googleLoading ? "Connecting to Google…" : "Continue with Google"}
          </Button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">Or sign in with</span>
            </div>
          </div>

          <Tabs defaultValue="phone" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="phone">WhatsApp OTP</TabsTrigger>
              <TabsTrigger value="email">Email</TabsTrigger>
            </TabsList>

            {/* WhatsApp OTP Tab */}
            <TabsContent value="phone" className="space-y-4 pt-2">
              {!otpSent ? (
                <form onSubmit={handleSendOtp} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="phone">Mobile Number</Label>
                    <div className="flex">
                      <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-input bg-muted text-muted-foreground text-sm">
                        +91
                      </span>
                      <Input
                        id="phone"
                        type="tel"
                        placeholder="98765 43210"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        className="rounded-l-none"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      We will send a 6-digit verification code via WhatsApp.
                    </p>
                  </div>

                  <Button type="submit" className="w-full" disabled={phoneLoading}>
                    {phoneLoading ? "Sending WhatsApp OTP…" : "Send WhatsApp OTP"}
                  </Button>
                </form>
              ) : (
                <form onSubmit={handleVerifyOtp} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="otp">Enter 6-Digit OTP</Label>
                    <Input
                      id="otp"
                      type="text"
                      maxLength={6}
                      placeholder="123456"
                      value={otp}
                      onChange={(e) => setOtp(e.target.value)}
                      className="text-center tracking-widest text-lg font-bold"
                      autoFocus
                    />
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>Code sent to WhatsApp ({phone})</span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={phoneLoading}
                          onClick={handleSendOtp}
                          className="underline hover:text-foreground"
                        >
                          Resend
                        </button>
                        <span>·</span>
                        <button
                          type="button"
                          onClick={() => {
                            setOtpSent(false);
                            setOtp("");
                          }}
                          className="underline hover:text-foreground"
                        >
                          Change
                        </button>
                      </div>
                    </div>
                  </div>

                  <Button type="submit" className="w-full" disabled={phoneLoading}>
                    {phoneLoading ? "Verifying…" : "Verify & Log in"}
                  </Button>
                </form>
              )}
            </TabsContent>

            {/* Email + Password Tab */}
            <TabsContent value="email" className="space-y-4 pt-2">
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="m@example.com"
                    {...form.register("email")}
                  />
                  {form.formState.errors.email && (
                    <p className="text-sm text-destructive">{form.formState.errors.email.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">Password</Label>
                    <Link
                      href="/forgot-password"
                      className="text-xs text-muted-foreground hover:text-foreground underline"
                    >
                      Forgot password?
                    </Link>
                  </div>
                  <Input
                    id="password"
                    type="password"
                    {...form.register("password")}
                  />
                  {form.formState.errors.password && (
                    <p className="text-sm text-destructive">{form.formState.errors.password.message}</p>
                  )}
                </div>

                <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
                  {form.formState.isSubmitting ? "Logging in..." : "Login"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>

          {DEV && (
            <Button type="button" variant="outline" size="sm" className="w-full" onClick={devLogin}>
              Sign in as demo admin (dev)
            </Button>
          )}

          <p className="text-center text-sm text-muted-foreground pt-2">
            Don&apos;t have an account?{" "}
            <Link href="/signup" className="text-foreground underline font-medium">
              Create workspace
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

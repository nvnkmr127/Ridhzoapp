"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusMessage, type Status } from "@/components/ui/status-message";
import { sendWhatsAppOtpAction, requestPasswordResetAction } from "@/lib/actions/auth";
import { linkPhoneAction, startGoogleLinkAction } from "@/lib/actions/account";
import { useCooldown } from "@/hooks/use-cooldown";
import { COUNTRY_CODES } from "@/lib/countryCodes";


// Lets one account log in every way (Google, email + password, WhatsApp OTP) so users who come back
// with a different method land in the same workspace instead of a new empty one.

export function LoginMethods({ email, phone, notice }: { email: string | null; phone: string | null; notice?: Status }) {
  const router = useRouter();
  const [msg, setMsg] = useState<Status>(notice ?? null);
  const [busy, setBusy] = useState(false);

  const [countryCode, setCountryCode] = useState("+91");
  const [number, setNumber] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [resendIn, setResendIn] = useCooldown();
  const fullPhone = number.trim().startsWith("+") ? number.trim() : `${countryCode}${number.trim().replace(/^0+/, "")}`;

  // Runs an action with the busy lock held; a network failure shows a message instead of leaving the
  // buttons stuck disabled.
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
    } catch {
      setMsg({ kind: "error", text: "We couldn't reach the server. Check your connection and try again." });
    } finally {
      setBusy(false);
    }
  };

  const connectGoogle = () =>
    run(async () => {
      await startGoogleLinkAction();
      setMsg({ kind: "info", text: "Opening Google…" });
      await signIn("google", { callbackUrl: "/profile?linked=google" });
    });

  const sendPasswordLink = () =>
    run(async () => {
      if (!email) return;
      const res = await requestPasswordResetAction({ email });
      setMsg(res.ok ? { kind: "success", text: `We emailed a link to ${email} to set your password. It's valid for 1 hour.` } : { kind: "error", text: res.message });
    });

  const sendOtp = () => {
    if (number.replace(/\D/g, "").length < 6) return setMsg({ kind: "error", text: "Please enter a valid mobile number." });
    return run(async () => {
      const res = await sendWhatsAppOtpAction({ phone: fullPhone, purpose: "link" });
      if (!res.ok) return setMsg({ kind: "error", text: res.message });
      setOtpSent(true);
      setResendIn(45);
      setMsg({ kind: "success", text: `Code sent to WhatsApp on ${fullPhone}. It's valid for 5 minutes.` });
    });
  };

  const verifyOtp = () =>
    run(async () => {
      const res = await linkPhoneAction({ phone: fullPhone, otp });
      if (!res.ok) return setMsg({ kind: "error", text: res.message });
      setMsg({ kind: "success", text: `WhatsApp login added. You can now log in with ${fullPhone}.` });
      router.refresh();
    });

  return (
    <div className="bg-card p-6 rounded-2xl border border-border space-y-5">
      <div>
        <h2 className="text-lg font-semibold">How you log in</h2>
        <p className="text-sm text-muted-foreground">Add more ways so you can always get back into this workspace.</p>
      </div>

      <StatusMessage status={msg} />

      <div className="space-y-2">
        <div className="font-medium">Google or email &amp; password</div>
        {email ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" /> {email}
            </p>
            <Button variant="outline" size="sm" onClick={sendPasswordLink} disabled={busy}>
              Set or reset password
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">Not added yet.</p>
            <Button variant="outline" size="sm" onClick={connectGoogle} disabled={busy}>
              Connect Google
            </Button>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <div className="font-medium">WhatsApp OTP</div>
        {phone ? (
          <p className="flex items-center gap-2 text-sm">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" /> {phone}
          </p>
        ) : !otpSent ? (
          <div className="flex flex-wrap gap-2">
            <div className="flex flex-1 min-w-[220px]">
              <select
                aria-label="Country code"
                value={countryCode}
                onChange={(e) => setCountryCode(e.target.value)}
                className="rounded-l-md border border-r-0 border-input bg-muted text-muted-foreground text-sm px-2 focus:outline-none"
              >
                {COUNTRY_CODES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <Input
                type="tel"
                aria-label="Mobile number"
                placeholder="98765 43210"
                value={number}
                onChange={(e) => setNumber(e.target.value)}
                className="rounded-l-none"
              />
            </div>
            <Button size="sm" className="h-10" onClick={sendOtp} disabled={busy}>
              Send WhatsApp OTP
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <Label htmlFor="link-otp">Enter the 6-digit code sent to {fullPhone}</Label>
            <div className="flex flex-wrap gap-2">
              <Input
                id="link-otp"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="123456"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                className="w-40 text-center tracking-widest font-bold"
                autoFocus
              />
              <Button size="sm" className="h-10" onClick={verifyOtp} disabled={busy || otp.length !== 6}>
                Verify &amp; add
              </Button>
            </div>
            <div className="flex gap-2 text-xs text-muted-foreground">
              <button
                type="button"
                onClick={sendOtp}
                disabled={busy || resendIn > 0}
                className="underline hover:text-foreground disabled:no-underline disabled:opacity-60"
              >
                {resendIn > 0 ? `Resend in ${resendIn}s` : "Resend"}
              </button>
              <span>·</span>
              <button type="button" onClick={() => { setOtpSent(false); setOtp(""); }} className="underline hover:text-foreground">
                Change
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

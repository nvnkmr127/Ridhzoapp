"use client";

import Link from "next/link";
import { useState } from "react";
import { UserCircle, X } from "lucide-react";
import { isPlaceholderEmail } from "@/lib/auth/googleLink";

// Members can join with just an email, just a mobile number, or Google — nudge them to fill in
// what's missing so they can sign in every way (and never get locked out). Hidden for this visit once dismissed.
export function ProfileGapsBanner({ email, phone }: { email: string | null; phone: string | null }) {
  const [hidden, setHidden] = useState(false);
  const noEmail = !email || isPlaceholderEmail(email);
  const missing = [noEmail && "your email (or connect Google for faster sign-in)", !phone && "your mobile number (to sign in with a WhatsApp code)"].filter(Boolean);
  if (hidden || !missing.length) return null;
  return (
    <div role="status" className="flex items-center gap-3 border-b bg-primary/5 px-4 py-2 text-sm">
      <UserCircle className="h-4 w-4 shrink-0 text-primary" />
      <p className="flex-1">
        Finish setting up your account: add {missing.join(" and ")}.{" "}
        <Link href="/profile" className="font-medium underline underline-offset-2">Add now</Link>
      </p>
      <button type="button" aria-label="Dismiss" onClick={() => setHidden(true)} className="text-muted-foreground hover:text-foreground">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

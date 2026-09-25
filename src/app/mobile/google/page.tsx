"use client";

import { Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";

// Opened by the mobile app in an in-app browser: starts Google sign-in, which returns to
// /api/v1/auth/google/finish to hand a one-time code back to the app.
function Start() {
  const challenge = useSearchParams().get("challenge") ?? "";

  useEffect(() => {
    if (!/^[A-Za-z0-9_-]{43}$/.test(challenge)) return;
    signIn("google", { callbackUrl: `/api/v1/auth/google/finish?challenge=${challenge}` }, { prompt: "select_account" });
  }, [challenge]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6 text-sm text-muted-foreground">
      {/^[A-Za-z0-9_-]{43}$/.test(challenge) ? "Opening Google…" : "Invalid sign-in link. Go back to the app and try again."}
    </main>
  );
}

export default function MobileGoogleSignIn() {
  return (
    <Suspense>
      <Start />
    </Suspense>
  );
}

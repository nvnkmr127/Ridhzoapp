import Link from "next/link";
import Image from "next/image";
import { consumeEmailVerification } from "@/lib/auth/emailVerify";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusMessage } from "@/components/ui/status-message";

export const dynamic = "force-dynamic";

const ERRORS = {
  invalid: "This verification link is invalid, already used, or older than 24 hours. Request a new one from your account.",
  taken: "This email is already used by another Ridhzo account, so it can't be added here. Use a different email.",
  "has-email": "This account already has an email address.",
} as const;

export default async function VerifyEmailPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const result = await consumeEmailVerification(token);
  return (
    <div className="flex min-h-dvh w-full items-center justify-center bg-muted py-10 px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 text-center">
          <div className="flex justify-center pb-2">
            <Image src="/logos/Ridhzo-Logo-Final_Horizontal-Light.png" alt="Ridhzo" width={140} height={44} className="h-9 w-auto object-contain" priority />
          </div>
          <CardTitle className="text-2xl font-bold">{result.ok ? "Email verified" : "Couldn't verify email"}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-center">
          <StatusMessage
            className="text-left"
            status={result.ok ? { kind: "success", text: `${result.email} is now a way to log in to your account.` } : { kind: "error", text: ERRORS[result.reason] }}
          />
          <Button asChild className="w-full">
            <Link href="/">Go to Ridhzo</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

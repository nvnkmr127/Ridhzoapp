import Link from "next/link";
import { verifyResetTokenAction } from "@/lib/actions/auth";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default async function ResetPasswordPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const result = await verifyResetTokenAction(token);

  return (
    <div className="flex min-h-dvh w-full items-center justify-center bg-muted py-10 px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-2xl font-bold">Reset your password</CardTitle>
          <p className="text-sm text-muted-foreground">
            Choose a new, secure password for your account
          </p>
        </CardHeader>
        <CardContent>
          {result.valid && result.email ? (
            <ResetPasswordForm token={token} email={result.email} />
          ) : (
            <div className="space-y-4 text-center">
              <div className="rounded-lg bg-red-50 dark:bg-red-950/40 p-4 border border-red-200 dark:border-red-800 text-sm text-red-800 dark:text-red-200">
                This password reset link is invalid or has expired.
              </div>
              <Button asChild className="w-full">
                <Link href="/forgot-password">Request a new reset link</Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

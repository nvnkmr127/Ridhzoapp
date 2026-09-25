import { requireAuth } from "@/lib/rbac";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { Button } from "@/components/ui/button";
import { getEmailOptOutAction } from "@/lib/actions/notificationPrefs";
import { NotificationPreferences } from "@/components/settings/NotificationPreferences";
import { AlertSoundPicker } from "@/components/settings/AlertSoundPicker";
import { LanguagePicker } from "@/components/settings/LanguagePicker";
import { isLang } from "@/lib/i18n";
import { LoginMethods } from "@/components/settings/LoginMethods";
import { isPlaceholderEmail } from "@/lib/auth/googleLink";

// Result of the "Connect Google" round trip (set by the signIn callback in lib/auth.ts).
const LINK_NOTICES = {
  google: { kind: "success", text: "Google connected. You can now log in with Google too." },
  "google-taken": { kind: "error", text: "That Google account already belongs to another Ridhzo workspace. Log in with it there, or pick a different Google account." },
  "google-mismatch": { kind: "error", text: "This account already has an email. Log in with Google using that same address." },
} as const;

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  let session;
  try {
    session = await requireAuth();
  } catch {
    redirect("/login");
  }

  const [emailOptOut, [me], params] = await Promise.all([
    getEmailOptOutAction(),
    db.select({ email: users.email, phone: users.phone, language: users.language }).from(users).where(eq(users.id, session.user.id)).limit(1),
    searchParams,
  ]);
  const email = me && !isPlaceholderEmail(me.email) ? me.email : null;
  const linkKey = (params.linked ?? params.link) as keyof typeof LINK_NOTICES | undefined;

  return (
    <div className="p-4 sm:p-8 max-w-4xl mx-auto space-y-6">
      <h1 className="text-3xl font-bold">Your profile</h1>
      <div className="bg-card p-6 rounded-2xl border border-border space-y-2">
        <p><strong>Name:</strong> {session.user?.name || "—"}</p>
        <p><strong>Email:</strong> {email || "—"}</p>
        {me?.phone && <p><strong>Phone:</strong> {me.phone}</p>}
      </div>

      <LoginMethods email={email} phone={me?.phone ?? null} notice={linkKey ? LINK_NOTICES[linkKey] : undefined} />

      <NotificationPreferences initialOptOut={emailOptOut} />
      <LanguagePicker initial={isLang(me?.language) ? me.language : "en"} />
      <AlertSoundPicker />
      <form action="/api/auth/signout" method="POST">
        <Button variant="outline" type="submit">Logout</Button>
      </form>
    </div>
  );
}

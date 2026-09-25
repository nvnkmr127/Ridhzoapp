import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { CHALLENGE_RE, signGoogleCode } from "@/lib/mobileAuth";

const APP_REDIRECT = "ridhzo://auth";

// Google sign-in landed (web session cookie is set): hand the app a 2-minute code bound to its challenge.
export async function GET(req: NextRequest) {
  const challenge = req.nextUrl.searchParams.get("challenge") ?? "";
  if (!CHALLENGE_RE.test(challenge)) return NextResponse.redirect(`${APP_REDIRECT}?error=invalid_request`);
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return NextResponse.redirect(`${APP_REDIRECT}?error=not_signed_in`);
  return NextResponse.redirect(`${APP_REDIRECT}?code=${encodeURIComponent(signGoogleCode(userId, challenge))}`);
}

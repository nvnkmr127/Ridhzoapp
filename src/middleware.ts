import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

export async function middleware(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) {
    const signInUrl = new URL("/login", req.url);
    signInUrl.searchParams.set("callbackUrl", req.nextUrl.pathname);
    return NextResponse.redirect(signInUrl);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/admin/:path*",
    "/assistant/:path*",
    "/leads/:path*",
    "/automations/:path*",
    "/sequences/:path*",
    "/insights/:path*",
    "/follow-ups/:path*",
    "/my-dashboard/:path*",
    "/profile/:path*",
    "/settings/:path*",
  ],
};

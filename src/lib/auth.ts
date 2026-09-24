import { NextAuthOptions, DefaultSession, DefaultUser } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      roleId: string | null;
      organizationId: string | null;
      isSuperAdmin: boolean;
      phone?: string | null;
    } & DefaultSession["user"];
  }

  interface User extends DefaultUser {
    id: string;
    roleId: string | null;
    organizationId: string | null;
    isSuperAdmin: boolean;
    phone?: string | null;
  }
}

import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { db } from "@/db";
import { users, organizations } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { cookies } from "next/headers";
import { RateLimiter } from "@/lib/rate-limit";
import { GOOGLE_LINK_COOKIE, PHONE_EMAIL_DOMAIN, isPlaceholderEmail, readGoogleLinkToken } from "@/lib/auth/googleLink";

async function consumeGoogleLinkCookie(): Promise<string | null> {
  try {
    const jar = await cookies();
    const userId = readGoogleLinkToken(jar.get(GOOGLE_LINK_COOKIE)?.value);
    if (jar.get(GOOGLE_LINK_COOKIE)) jar.delete(GOOGLE_LINK_COOKIE);
    return userId;
  } catch {
    return null; // not in a request scope
  }
}

// How long a session stays valid without re-authenticating (NextAuth's own JWT default — made
// explicit here rather than left implicit).
const SESSION_MAX_AGE_SEC = 30 * 24 * 60 * 60;

// How often the jwt() callback below re-checks the user's live role/org/active status against the
// database. A JWT strategy means the token itself is normally never re-validated once issued — a
// demoted, reassigned, or deleted user's session would otherwise keep working, with its original
// permissions, for the full 30-day token lifetime. Throttled rather than checked on every request:
// requireOrg() already runs on every page load, so an unthrottled DB read here would double that
// cost against a remote database for no benefit at sub-minute granularity.
const SESSION_REFRESH_INTERVAL_MS = 60_000;

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt", maxAge: SESSION_MAX_AGE_SEC },
  providers: [
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? [
          GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            allowDangerousEmailAccountLinking: true,
          }),
        ]
      : []),
    CredentialsProvider({
      id: "phone-otp",
      name: "Phone OTP",
      credentials: {
        idToken: { label: "Firebase ID Token", type: "text" },
        phoneNumber: { label: "Phone Number", type: "text" },
        otp: { label: "OTP Code", type: "text" },
        name: { label: "Full Name", type: "text" },
        orgName: { label: "Workspace Name", type: "text" },
      },
      async authorize(credentials) {
        const phone = (credentials?.phoneNumber || "").trim();
        if (!phone) return null;

        let verified = false;

        // 1. WhatsApp OTP via Watxio
        if (credentials?.otp) {
          const { verifyPhoneOtp } = await import("@/lib/auth/phoneOtp");
          const result = await verifyPhoneOtp(phone, credentials.otp);
          // Surfaced to the client as result.error so it can say "request a new code" instead of "invalid".
          if (result === "locked") throw new Error("OTP_LOCKED");
          if (result !== "ok") return null;
          verified = true;
        }
        // 2. Legacy fallback: Firebase ID Token
        else if (credentials?.idToken) {
          const { verifyFirebaseIdToken } = await import("@/lib/auth/firebaseTokenVerifier");
          try {
            const res = await verifyFirebaseIdToken(credentials.idToken);
            if (!res.phoneNumber || res.phoneNumber === phone) verified = true;
          } catch (err) {
            console.error("[phone-auth] verification failed:", err);
            return null;
          }
        }

        if (!verified) return null;

        let [existingUser] = await db
          .select()
          .from(users)
          .where(and(eq(users.phone, phone), isNull(users.deletedAt)))
          .limit(1);

        if (!existingUser) {
          const { OrgService, slugify } = await import("@/domains/organizations/service");
          const { signupTrial } = await import("@/domains/billing/planService");
          const adminRole = await OrgService.ensureSystemRoles();
          const cleanDigits = phone.replace(/[^0-9]/g, "");
          const baseName = credentials?.name?.trim() || `User ${cleanDigits.slice(-4)}`;
          const workspaceName = credentials?.orgName?.trim() || `${baseName}'s Workspace`;
          const slug = `${slugify(workspaceName)}-${Math.random().toString(36).slice(2, 7)}`;
          const randomPasswordHash = await bcrypt.hash(crypto.randomUUID(), 10);
          const syntheticEmail = `${cleanDigits}${PHONE_EMAIL_DOMAIN}`;

          const [newOrg] = await db
            .insert(organizations)
            .values({ name: workspaceName, slug, ...signupTrial() })
            .returning();

          const nameParts = baseName.split(/\s+/);
          const firstName = nameParts[0] || baseName;
          const lastName = nameParts.slice(1).join(" ") || undefined;

          const [created] = await db
            .insert(users)
            .values({
              organizationId: newOrg.id,
              email: syntheticEmail,
              phone,
              firstName,
              lastName,
              passwordHash: randomPasswordHash,
              roleId: adminRole?.id ?? null,
              isActive: true,
            })
            .returning();

          existingUser = created;
        }

        if (!existingUser) return null;
        // Identity is proven at this point, so it's safe to say why sign-in is refused (surfaced as
        // result.error on the client instead of a misleading "invalid code").
        if (!existingUser.isActive) throw new Error("ACCOUNT_DISABLED");

        if (existingUser.organizationId && !existingUser.isSuperAdmin) {
          const { OrgService } = await import("@/domains/organizations/service");
          const isSuspended = await OrgService.isSuspended(existingUser.organizationId);
          if (isSuspended) throw new Error("ACCOUNT_SUSPENDED");
        }

        return {
          id: existingUser.id,
          email: existingUser.email,
          name: [existingUser.firstName, existingUser.lastName].filter(Boolean).join(" ") || phone,
          roleId: existingUser.roleId,
          organizationId: existingUser.organizationId,
          isSuperAdmin: existingUser.isSuperAdmin,
          phone: existingUser.phone,
        };
      },
    }),
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, req) {
        const parsed = z
          .object({
            email: z.string().trim().email(),
            password: z.string().min(1),
          })
          .safeParse(credentials);

        if (!parsed.success) return null;

        const email = parsed.data.email.trim().toLowerCase();
        const { password } = parsed.data;

        // Brute-force guard: per account and per client IP, before touching bcrypt.
        const fwd = (req?.headers as Record<string, string | undefined> | undefined)?.["x-forwarded-for"];
        const ip = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(",")[0]?.trim() || "unknown";
        const [byEmail, byIp] = await Promise.all([
          RateLimiter.checkLimit(`auth:login:email:${email}`, 8, 15 * 60),
          RateLimiter.checkLimit(`auth:login:ip:${ip}`, 40, 15 * 60),
        ]);
        if (!byEmail.success || !byIp.success) throw new Error("RATE_LIMITED");

        const [user] = await db
          .select()
          .from(users)
          .where(and(eq(users.email, email), isNull(users.deletedAt)))
          .limit(1);

        if (!user) return null;

        const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
        if (!isPasswordValid) return null;
        // Only after the password checks out, so these never reveal whether an email is registered.
        if (!user.isActive) throw new Error("ACCOUNT_DISABLED");

        // Block sign-in for a suspended org (super-admins are exempt — they operate cross-tenant).
        if (user.organizationId && !user.isSuperAdmin) {
          const [org] = await db
            .select({ suspendedAt: organizations.suspendedAt })
            .from(organizations)
            .where(eq(organizations.id, user.organizationId))
            .limit(1);
          if (org?.suspendedAt) throw new Error("ACCOUNT_SUSPENDED");
        }

        return {
          id: user.id,
          email: user.email,
          name: [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email,
          roleId: user.roleId,
          organizationId: user.organizationId,
          isSuperAdmin: user.isSuperAdmin,
          phone: user.phone,
        };
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === "google") {
        const email = user.email?.toLowerCase();
        if (!email) return false;

        let [existingUser] = await db
          .select()
          .from(users)
          .where(and(eq(users.email, email), isNull(users.deletedAt)))
          .limit(1);

        // "Connect Google" from Profile: attach this Google email to the logged-in user rather than
        // signing in as / creating someone else.
        const linkUserId = await consumeGoogleLinkCookie();
        if (linkUserId) {
          if (existingUser && existingUser.id !== linkUserId) return "/profile?link=google-taken";
          if (!existingUser) {
            const [linkUser] = await db
              .select()
              .from(users)
              .where(and(eq(users.id, linkUserId), isNull(users.deletedAt)))
              .limit(1);
            if (!linkUser) return false;
            // Only a phone-only account (placeholder email) can take a Google email; a real email is
            // already its Google login.
            if (!isPlaceholderEmail(linkUser.email)) return "/profile?link=google-mismatch";
            [existingUser] = await db
              .update(users)
              .set({ email, updatedAt: new Date() })
              .where(eq(users.id, linkUser.id))
              .returning();
          }
        }

        if (!existingUser) {
          const { OrgService, slugify } = await import("@/domains/organizations/service");
          const { signupTrial } = await import("@/domains/billing/planService");
          const adminRole = await OrgService.ensureSystemRoles();
          const baseName = user.name || email.split("@")[0] || "My";
          const orgName = `${baseName}'s Workspace`;
          const slug = `${slugify(baseName)}-${Math.random().toString(36).slice(2, 7)}`;
          const randomPasswordHash = await bcrypt.hash(crypto.randomUUID(), 10);

          const [newOrg] = await db
            .insert(organizations)
            .values({ name: orgName, slug, ...signupTrial() })
            .returning();

          const nameParts = (user.name || "").trim().split(/\s+/);
          const firstName = nameParts[0] || baseName;
          const lastName = nameParts.slice(1).join(" ") || undefined;

          const [created] = await db
            .insert(users)
            .values({
              organizationId: newOrg.id,
              email,
              firstName,
              lastName,
              passwordHash: randomPasswordHash,
              roleId: adminRole?.id ?? null,
              isActive: true,
            })
            .returning();

          existingUser = created;
        }

        if (!existingUser.isActive) return "/login?error=ACCOUNT_DISABLED";

        if (existingUser.organizationId && !existingUser.isSuperAdmin) {
          const { OrgService } = await import("@/domains/organizations/service");
          const isSuspended = await OrgService.isSuspended(existingUser.organizationId);
          if (isSuspended) return "/login?error=ACCOUNT_SUSPENDED";
        }

        user.id = existingUser.id;
        user.roleId = existingUser.roleId;
        user.organizationId = existingUser.organizationId;
        user.isSuperAdmin = existingUser.isSuperAdmin;
        user.phone = existingUser.phone;
        return true;
      }
      return true;
    },
    async jwt({ token, user, account }) {
      if (account?.provider === "google" && (user?.email || token.email)) {
        const email = ((user?.email || token.email) as string).toLowerCase();
        const [dbUser] = await db
          .select({
            id: users.id,
            roleId: users.roleId,
            organizationId: users.organizationId,
            isSuperAdmin: users.isSuperAdmin,
            phone: users.phone,
          })
          .from(users)
          .where(and(eq(users.email, email), isNull(users.deletedAt)))
          .limit(1);

        if (dbUser) {
          token.id = dbUser.id;
          token.roleId = dbUser.roleId;
          token.organizationId = dbUser.organizationId;
          token.isSuperAdmin = dbUser.isSuperAdmin;
          token.phone = dbUser.phone;
          token.refreshedAt = Date.now();
          // Stable sign-in time (never updated on later refreshes) — the baseline a super-admin's
          // "revoke sessions" is compared against. token.iat can't be used: NextAuth re-stamps it
          // on every re-encode, which would make an old token look newer than the revocation.
          token.authAt = (token.authAt as number | undefined) ?? Date.now();
          return token;
        }
      }

      if (user) {
        token.id = user.id;
        token.roleId = user.roleId;
        token.organizationId = user.organizationId;
        token.isSuperAdmin = user.isSuperAdmin;
        token.phone = user.phone;
        token.refreshedAt = Date.now();
        token.authAt = Date.now();
        return token;
      }

      // Throttled liveness + role/org re-check (see SESSION_REFRESH_INTERVAL_MS above). A user who
      // is demoted, reassigned to another org, deactivated, or (soft-)deleted after signing in has
      // their session's effective access closed within one interval instead of up to 30 days.
      const refreshedAt = (token.refreshedAt as number | undefined) ?? 0;
      if (token.id && Date.now() - refreshedAt > SESSION_REFRESH_INTERVAL_MS) {
        const [u] = await db
          .select({
            firstName: users.firstName,
            lastName: users.lastName,
            email: users.email,
            roleId: users.roleId,
            organizationId: users.organizationId,
            isSuperAdmin: users.isSuperAdmin,
            isActive: users.isActive,
            deletedAt: users.deletedAt,
            phone: users.phone,
          })
          .from(users)
          .where(eq(users.id, token.id as string))
          .limit(1);
        // Honor a super-admin "revoke sessions": if the user or their org was revoked AFTER this
        // session was issued, close it. Checked inside the same throttled window (not every request).
        let revoked = false;
        try {
          const { SessionService } = await import("@/domains/platform/sessionService");
          revoked = await SessionService.isRevoked(
            token.id as string,
            (u?.organizationId ?? token.organizationId) as string | undefined,
            token.authAt as number | undefined,
          );
        } catch {
          // Revocation store unreachable — don't lock everyone out on a transient config-read error.
        }
        if (!u || u.isActive === false || u.deletedAt || revoked) {
          // Fail closed: requireOrg() redirects to /login when organizationId is null, and every
          // permission check refuses without a roleId — this doesn't force a client-side sign-out,
          // but it stops the session from acting as anyone from the next request onward.
          token.roleId = null;
          token.organizationId = null;
          token.isSuperAdmin = false;
          token.phone = null;
        } else {
          token.name = [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email;
          token.roleId = u.roleId;
          token.organizationId = u.organizationId;
          token.isSuperAdmin = u.isSuperAdmin;
          token.phone = u.phone;
        }
        token.refreshedAt = Date.now();
      }
      return token;
    },
    async session({ session, token }) {
      if (token) {
        const rawName = (typeof token.name === "string" ? token.name : session.user?.name) ?? "";
        const cleanName = rawName.replace(/\s+null\b|\bnull\s+|\bnull\b/g, "").trim();

        session.user = {
          ...session.user,
          id: token.id as string,
          name: cleanName || session.user?.email || null,
          roleId: token.roleId as string,
          organizationId: (token.organizationId as string) ?? null,
          isSuperAdmin: Boolean(token.isSuperAdmin),
          phone: (token.phone as string) ?? null,
        };
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
    // Failed Google/OAuth sign-ins land back on the login form (with ?error=) instead of NextAuth's
    // bare built-in error page.
    error: "/login",
  },
};

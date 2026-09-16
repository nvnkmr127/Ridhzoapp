import { NextAuthOptions, DefaultSession, DefaultUser } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      roleId: string | null;
      organizationId: string | null;
      isSuperAdmin: boolean;
    } & DefaultSession["user"];
  }

  interface User extends DefaultUser {
    id: string;
    roleId: string | null;
    organizationId: string | null;
    isSuperAdmin: boolean;
  }
}

import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { db } from "@/db";
import { users, organizations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";

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
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const parsed = z
          .object({
            email: z.string().email(),
            password: z.string().min(1),
          })
          .safeParse(credentials);

        if (!parsed.success) return null;

        const { email, password } = parsed.data;

        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.email, email))
          .limit(1);

        if (!user || !user.isActive) return null;

        const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
        if (!isPasswordValid) return null;

        // Block sign-in for a suspended org (super-admins are exempt — they operate cross-tenant).
        if (user.organizationId && !user.isSuperAdmin) {
          const [org] = await db
            .select({ suspendedAt: organizations.suspendedAt })
            .from(organizations)
            .where(eq(organizations.id, user.organizationId))
            .limit(1);
          if (org?.suspendedAt) return null;
        }

        return {
          id: user.id,
          email: user.email,
          name: `${user.firstName} ${user.lastName}`,
          roleId: user.roleId,
          organizationId: user.organizationId,
          isSuperAdmin: user.isSuperAdmin,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.roleId = user.roleId;
        token.organizationId = user.organizationId;
        token.isSuperAdmin = user.isSuperAdmin;
        token.refreshedAt = Date.now();
        return token;
      }

      // Throttled liveness + role/org re-check (see SESSION_REFRESH_INTERVAL_MS above). A user who
      // is demoted, reassigned to another org, deactivated, or (soft-)deleted after signing in has
      // their session's effective access closed within one interval instead of up to 30 days.
      const refreshedAt = (token.refreshedAt as number | undefined) ?? 0;
      if (token.id && Date.now() - refreshedAt > SESSION_REFRESH_INTERVAL_MS) {
        const [u] = await db
          .select({ roleId: users.roleId, organizationId: users.organizationId, isSuperAdmin: users.isSuperAdmin, isActive: users.isActive, deletedAt: users.deletedAt })
          .from(users)
          .where(eq(users.id, token.id as string))
          .limit(1);
        if (!u || u.isActive === false || u.deletedAt) {
          // Fail closed: requireOrg() redirects to /login when organizationId is null, and every
          // permission check refuses without a roleId — this doesn't force a client-side sign-out,
          // but it stops the session from acting as anyone from the next request onward.
          token.roleId = null;
          token.organizationId = null;
          token.isSuperAdmin = false;
        } else {
          token.roleId = u.roleId;
          token.organizationId = u.organizationId;
          token.isSuperAdmin = u.isSuperAdmin;
        }
        token.refreshedAt = Date.now();
      }
      return token;
    },
    async session({ session, token }) {
      if (token) {
        session.user = {
          ...session.user,
          id: token.id as string,
          roleId: token.roleId as string,
          organizationId: (token.organizationId as string) ?? null,
          isSuperAdmin: Boolean(token.isSuperAdmin),
        };
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
};

import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { mobileSession } from "@/lib/mobileAuth";

// Issue the mobile {token, user} for an already-verified user id, or a refusal reason.
export async function issueMobileSession(userId: string) {
  const [user] = await db.select().from(users).where(and(eq(users.id, userId), isNull(users.deletedAt))).limit(1);
  if (!user || !user.organizationId) return { error: "No Ridhzo workspace is linked to this account.", status: 403 } as const;
  if (!user.isActive) return { error: "This account has been disabled. Contact your admin.", status: 403 } as const;
  const { OrgService } = await import("@/domains/organizations/service");
  if (await OrgService.isSuspended(user.organizationId)) {
    return { error: "This workspace has been suspended. Contact support.", status: 403 } as const;
  }
  return { session: mobileSession({ ...user, organizationId: user.organizationId }) };
}

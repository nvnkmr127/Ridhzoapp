import { NextRequest, NextResponse } from "next/server";
import { and, asc, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import { followUps, leads } from "@/db/schema";
import { authorizeApiRequest } from "@/lib/apiAuth";

// The signed-in user's follow-ups — ones they created or on leads they own (same as the web
// Follow-ups page), skipping deleted leads: every pending one (by due date) plus the 50 most
// recently finished.
export async function GET(req: NextRequest) {
  const auth = await authorizeApiRequest(req);
  if ("error" in auth) return auth.error;
  if (!auth.userId) return NextResponse.json({ data: [] }); // API-key requests have no user scope

  const mine = and(
    eq(leads.organizationId, auth.organizationId),
    or(eq(followUps.userId, auth.userId), eq(leads.ownerId, auth.userId)),
    isNull(leads.deletedAt),
  );
  const cols = {
    id: followUps.id,
    title: followUps.title,
    type: followUps.type,
    status: followUps.status,
    dueAt: followUps.dueAt,
    leadId: leads.id,
    leadName: leads.name,
    leadPhone: leads.phone,
  };

  const [pending, done] = await Promise.all([
    db.select(cols).from(followUps).innerJoin(leads, eq(followUps.leadId, leads.id))
      .where(and(mine, eq(followUps.status, "pending"))).orderBy(asc(followUps.dueAt)).limit(500),
    db.select(cols).from(followUps).innerJoin(leads, eq(followUps.leadId, leads.id))
      .where(and(mine, inArray(followUps.status, ["completed", "cancelled"]))).orderBy(desc(followUps.updatedAt)).limit(50),
  ]);

  return NextResponse.json({ data: [...pending, ...done] });
}

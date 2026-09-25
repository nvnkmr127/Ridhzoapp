import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { leadAttachments } from "@/db/schema";
import { authorizeApiRequest } from "@/lib/apiAuth";
import { canEditLeads, idOk, leadForApi, readOnly } from "@/lib/meetingsApi";
import { ActivityService } from "@/domains/activities/service";
import { deleteAttachment } from "@/lib/storage/attachments";

// Remove a file from a lead.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeApiRequest(req);
  if ("error" in auth) return auth.error;
  const { id } = await params;
  const notFound = () => NextResponse.json({ error: "File not found" }, { status: 404 });
  if (!idOk(id)) return notFound();
  const [a] = await db.select().from(leadAttachments).where(eq(leadAttachments.id, id)).limit(1);
  if (!a || a.organizationId !== auth.organizationId || !(await leadForApi(auth, a.leadId))) return notFound();
  if (!(await canEditLeads(auth))) return readOnly();

  await db.delete(leadAttachments).where(eq(leadAttachments.id, id));
  await deleteAttachment(a.fileUrl).catch(() => {});
  await ActivityService.addActivity({ leadId: a.leadId, userId: auth.userId, type: "attachment_deleted", content: `Removed attachment: ${a.fileName}` });
  return NextResponse.json({ data: { deleted: true } });
}

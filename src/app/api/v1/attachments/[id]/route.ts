import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { leadAttachments } from "@/db/schema";
import { authorizeApiRequest } from "@/lib/apiAuth";
import { canEditLeads, idOk, leadForApi, readOnly } from "@/lib/meetingsApi";
import { ActivityService } from "@/domains/activities/service";
import { deleteAttachment } from "@/lib/storage/attachments";
import { signAttachmentLink } from "@/lib/mobileAuth";

// A fresh 10-minute download link, fetched when the rep taps the file (a link baked into a cached
// profile would have expired by then).
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeApiRequest(req);
  if ("error" in auth) return auth.error;
  if (!auth.userId) return NextResponse.json({ error: "A user session is required" }, { status: 403 });
  const { id } = await params;
  if (!idOk(id)) return NextResponse.json({ error: "File not found" }, { status: 404 });
  const [a] = await db.select({ leadId: leadAttachments.leadId, organizationId: leadAttachments.organizationId }).from(leadAttachments).where(eq(leadAttachments.id, id)).limit(1);
  if (!a || a.organizationId !== auth.organizationId || !(await leadForApi(auth, a.leadId))) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
  return NextResponse.json({ data: { url: `${req.nextUrl.origin}/api/attachments/${id}?${signAttachmentLink(id, auth.userId)}` } });
}

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

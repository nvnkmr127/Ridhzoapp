import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { leadAttachments } from "@/db/schema";
import { authorizeApiRequest } from "@/lib/apiAuth";
import { canEditLeads, leadForApi, leadNotFound, readOnly } from "@/lib/meetingsApi";
import { ActivityService } from "@/domains/activities/service";
import { contentTypeFor, saveAttachment, ALLOWED_TYPES } from "@/lib/storage/attachments";

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

// Upload a file to the lead (multipart form: file, optional fileName). Same rules as the web.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeApiRequest(req);
  if ("error" in auth) return auth.error;
  if (!auth.userId) return NextResponse.json({ error: "A user session is required" }, { status: 403 });
  const { id } = await params;
  if (!(await leadForApi(auth, id))) return leadNotFound();
  if (!(await canEditLeads(auth))) return readOnly();

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: "Please choose a file to upload." }, { status: 422 });
  if (file.size > MAX_UPLOAD_BYTES) return NextResponse.json({ error: "File exceeds the 25MB limit." }, { status: 422 });
  const contentType = contentTypeFor(file.name);
  if (!contentType) {
    return NextResponse.json({ error: `This file type isn't supported. Allowed: ${Object.keys(ALLOWED_TYPES).join(", ")}.` }, { status: 422 });
  }

  try {
    const fileUrl = await saveAttachment(auth.organizationId, file.name, Buffer.from(await file.arrayBuffer()), contentType);
    const custom = form?.get("fileName");
    const fileName = ((typeof custom === "string" && custom.trim()) || file.name || "attachment").slice(0, 255);
    const [attachment] = await db
      .insert(leadAttachments)
      .values({ leadId: id, organizationId: auth.organizationId, fileName, fileUrl, fileSize: file.size, fileType: contentType, uploadedById: auth.userId })
      .returning();
    await ActivityService.addActivity({ leadId: id, userId: auth.userId, type: "attachment", content: `Uploaded file: ${fileName}` });
    return NextResponse.json({ data: { id: attachment.id, fileName, fileType: contentType, fileSize: file.size } }, { status: 201 });
  } catch (e: any) {
    if (e?.code === "VALIDATION") return NextResponse.json({ error: e.message }, { status: 422 });
    const { logError } = await import("@/lib/log");
    const ref = logError("api/v1/leads/[id]/attachments", e, { leadId: id });
    return NextResponse.json({ error: "Could not upload the file.", ref }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { leadAttachments } from "@/db/schema";
import { authorizeApiRequest } from "@/lib/apiAuth";
import { withIdempotency } from "@/lib/idempotency";
import { canEditLeads, leadForApi, leadNotFound, readOnly } from "@/lib/meetingsApi";
import { ActivityService } from "@/domains/activities/service";
import { contentTypeFor, saveAttachment, ALLOWED_TYPES, bytesMatchExtension } from "@/lib/storage/attachments";

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

// Upload a file to the lead (multipart form: file, optional fileName). Same rules as the web.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeApiRequest(req);
  if ("error" in auth) return auth.error;
  if (!auth.userId) return NextResponse.json({ error: "A user session is required" }, { status: 403 });
  const { id } = await params;
  if (!(await leadForApi(auth, id))) return leadNotFound();
  if (!(await canEditLeads(auth))) return readOnly();

  // The app's offline queue retries uploads: the same Idempotency-Key stores the file once.
  return withIdempotency(req, auth, `attachment:${id}`, async () => {
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: "Please choose a file to upload." }, { status: 422 });
  if (file.size > MAX_UPLOAD_BYTES) return NextResponse.json({ error: "File exceeds the 25MB limit." }, { status: 422 });
  const contentType = contentTypeFor(file.name);
  if (!contentType) {
    return NextResponse.json({ error: `This file type isn't supported. Allowed: ${Object.keys(ALLOWED_TYPES).join(", ")}.` }, { status: 422 });
  }

  try {
    // Same upload rules as the web: storage cap, and the bytes must match the extension.
    const { UsageService, UsageLimitError } = await import("@/domains/billing/usageService");
    try { await UsageService.assertCanStore(auth.organizationId, file.size); }
    catch (e) { if (e instanceof UsageLimitError) return NextResponse.json({ error: e.message }, { status: 402 }); throw e; }
    const bytes = Buffer.from(await file.arrayBuffer());
    if (!bytesMatchExtension(file.name, bytes.subarray(0, 4100))) {
      return NextResponse.json({ error: "This file's contents don't match its type, so it was not uploaded." }, { status: 422 });
    }
    const fileUrl = await saveAttachment(auth.organizationId, file.name, bytes, contentType);
    const custom = form?.get("fileName");
    const fileName = ((typeof custom === "string" && custom.trim()) || file.name || "attachment").slice(0, 255);
    const [attachment] = await db
      .insert(leadAttachments)
      .values({ leadId: id, organizationId: auth.organizationId, fileName, fileUrl, fileSize: file.size, fileType: contentType, uploadedById: auth.userId })
      .returning();
    await ActivityService.addActivity({ organizationId: auth.organizationId, leadId: id, userId: auth.userId, type: "attachment", content: `Uploaded file: ${fileName}` });
    return NextResponse.json({ data: { id: attachment.id, fileName, fileType: contentType, fileSize: file.size } }, { status: 201 });
  } catch (e: any) {
    if (e?.code === "VALIDATION") return NextResponse.json({ error: e.message }, { status: 422 });
    const { logError } = await import("@/lib/log");
    const ref = logError("api/v1/leads/[id]/attachments", e, { leadId: id });
    return NextResponse.json({ error: "Could not upload the file.", ref }, { status: 500 });
  }
  });
}

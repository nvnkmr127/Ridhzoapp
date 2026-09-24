import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { leadAttachments } from "@/db/schema";
import { requireOrg } from "@/lib/rbac";
import { assertLeadAccess } from "@/lib/leads/access";
import { INLINE_TYPES, isStoredRef, openAttachment } from "@/lib/storage/attachments";

// The only way to read a lead attachment: signed-in, same workspace, and allowed to open the lead.
// Served with a fixed content type, nosniff and a sandbox CSP so a file can never run as the app.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.guid().safeParse(id).success) return new NextResponse("Not found", { status: 404 });
  const { userId, organizationId } = await requireOrg();

  const [a] = await db
    .select()
    .from(leadAttachments)
    .where(and(eq(leadAttachments.id, id), eq(leadAttachments.organizationId, organizationId)))
    .limit(1);
  if (!a) return new NextResponse("Not found", { status: 404 });
  try {
    await assertLeadAccess(a.leadId, { userId, organizationId });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }

  // A link the rep attached (not a stored file): send them there — http(s) only.
  if (!isStoredRef(a.fileUrl)) {
    return /^https?:\/\//i.test(a.fileUrl) ? NextResponse.redirect(a.fileUrl) : new NextResponse("Not found", { status: 404 });
  }

  const file = await openAttachment(a.fileUrl);
  if (!file) return new NextResponse("File is no longer available", { status: 410 });

  const type = a.fileType && a.fileType !== "text/html" ? a.fileType : "application/octet-stream";
  const inline = req.nextUrl.searchParams.get("download") !== "1" && INLINE_TYPES.has(type);
  const name = encodeURIComponent(a.fileName).replace(/['()]/g, escape);
  return new NextResponse(file.stream, {
    headers: {
      "Content-Type": type,
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${name}`,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox; default-src 'none'; img-src 'self'; style-src 'unsafe-inline'",
      "Cache-Control": "private, no-store",
      ...(file.size ? { "Content-Length": String(file.size) } : {}),
    },
  });
}

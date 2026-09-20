"use server";

import { db } from "@/db";
import { leadAttachments } from "@/db/schema/activities";
import { requireOrg, assertWritable } from "@/lib/rbac";
import { eq, and, desc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { ActivityService } from "@/domains/activities/service";
import { assertLeadInOrg } from "@/domains/leads/ownership";
import { z } from "zod";
import { writeFile, mkdir, unlink } from "node:fs/promises";
import path from "node:path";
import { ok, fail, actionFail, zodFieldErrors } from "@/lib/actions/result";

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25 MB max

const addAttachmentSchema = z.object({
  leadId: z.string().uuid(),
  fileName: z.string().min(1, "File name is required"),
  fileUrl: z.string().min(1, "Valid URL or file path is required"),
  fileSize: z.number().optional(),
  fileType: z.string().optional(),
});

export async function uploadAttachmentAction(formData: FormData) {
  const { userId, organizationId } = await assertWritable();

  const file = formData.get("file") as File | null;
  const leadId = formData.get("leadId") as string | null;
  const customFileName = formData.get("fileName") as string | null;

  if (!file || !(file instanceof File) || !leadId) {
    return fail("VALIDATION", "Please select a file to upload.");
  }

  if (file.size === 0) {
    return fail("VALIDATION", "The selected file is empty.");
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return fail("VALIDATION", "File exceeds maximum size limit of 25MB.");
  }

  try {
    await assertLeadInOrg(leadId, organizationId);

    const uploadsDir = path.join(process.cwd(), "public", "uploads", "attachments");
    await mkdir(uploadsDir, { recursive: true });

    const ext = path.extname(file.name) || "";
    const sanitizedBase = path.basename(file.name, ext).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 50);
    const uniqueFileName = `${Date.now()}-${sanitizedBase || "file"}${ext}`;
    const filePath = path.join(uploadsDir, uniqueFileName);

    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(filePath, buffer);

    const fileUrl = `/uploads/attachments/${uniqueFileName}`;
    const fileName = (customFileName?.trim() || file.name || "attachment").slice(0, 255);
    const fileSize = file.size;
    const fileType = file.type || "application/octet-stream";

    const [attachment] = await db
      .insert(leadAttachments)
      .values({
        leadId,
        organizationId,
        fileName,
        fileUrl,
        fileSize,
        fileType,
        uploadedById: userId,
      })
      .returning();

    await ActivityService.addActivity({
      leadId,
      userId,
      type: "attachment",
      content: `Uploaded file: ${fileName}`,
    });

    revalidatePath(`/leads/${leadId}`);
    return ok(attachment);
  } catch (e) {
    return actionFail(e);
  }
}

export async function addAttachmentAction(input: z.infer<typeof addAttachmentSchema>) {
  const { userId, organizationId } = await assertWritable();

  const parsed = addAttachmentSchema.safeParse(input);
  if (!parsed.success) {
    return fail("VALIDATION", "Please provide a valid file name and URL.", zodFieldErrors(parsed.error));
  }

  try {
    await assertLeadInOrg(parsed.data.leadId, organizationId);

    const [attachment] = await db
      .insert(leadAttachments)
      .values({
        leadId: parsed.data.leadId,
        organizationId,
        fileName: parsed.data.fileName,
        fileUrl: parsed.data.fileUrl,
        fileSize: parsed.data.fileSize,
        fileType: parsed.data.fileType,
        uploadedById: userId,
      })
      .returning();

    await ActivityService.addActivity({
      leadId: parsed.data.leadId,
      userId,
      type: "attachment",
      content: `Attached file: ${parsed.data.fileName}`,
    });

    revalidatePath(`/leads/${parsed.data.leadId}`);
    return ok(attachment);
  } catch (e) {
    return actionFail(e);
  }
}

export async function getAttachmentsAction(leadId: string) {
  const { organizationId } = await requireOrg();
  await assertLeadInOrg(leadId, organizationId);

  return db
    .select()
    .from(leadAttachments)
    .where(and(eq(leadAttachments.leadId, leadId), eq(leadAttachments.organizationId, organizationId)))
    .orderBy(desc(leadAttachments.createdAt));
}

export async function deleteAttachmentAction(attachmentId: string, leadId: string) {
  const { userId, organizationId } = await assertWritable();
  try {
    await assertLeadInOrg(leadId, organizationId);

    const [deleted] = await db
      .delete(leadAttachments)
      .where(
        and(
          eq(leadAttachments.id, attachmentId),
          eq(leadAttachments.leadId, leadId),
          eq(leadAttachments.organizationId, organizationId)
        )
      )
      .returning();

    if (!deleted) return fail("NOT_FOUND", "This attachment was already removed.");

    if (deleted.fileUrl.startsWith("/uploads/attachments/")) {
      try {
        const localPath = path.join(process.cwd(), "public", deleted.fileUrl);
        await unlink(localPath).catch(() => {});
      } catch {}
    }

    await ActivityService.addActivity({
      leadId,
      userId,
      type: "attachment_deleted",
      content: `Removed attachment: ${deleted.fileName}`,
    });
    revalidatePath(`/leads/${leadId}`);
    return ok(deleted);
  } catch (e) {
    return actionFail(e);
  }
}

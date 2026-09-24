"use server";

import { assertLeadAccess } from "@/lib/leads/access";
import { db } from "@/db";
import { leadAttachments } from "@/db/schema/activities";
import { requireOrg, assertWritable } from "@/lib/rbac";
import { eq, and, desc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { ActivityService } from "@/domains/activities/service";
import { z } from "zod";
import { contentTypeFor, deleteAttachment, saveAttachment, ALLOWED_TYPES } from "@/lib/storage/attachments";
import { ok, fail, actionFail, zodFieldErrors } from "@/lib/actions/result";

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25 MB max

const addAttachmentSchema = z.object({
  leadId: z.guid(),
  fileName: z.string().min(1, "File name is required"),
  // An external link only (uploads go through uploadAttachmentAction). http(s) only — a
  // `javascript:` URL here would run code when a teammate clicks the attachment.
  fileUrl: z.string().trim().url("Enter a valid link").refine((v) => /^https?:\/\//i.test(v), "Link must start with http:// or https://"),
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
    await assertLeadAccess(leadId, { userId, organizationId });

    const contentType = contentTypeFor(file.name);
    if (!contentType) {
      return fail("VALIDATION", `This file type isn't supported. Allowed: ${Object.keys(ALLOWED_TYPES).join(", ")}.`);
    }
    const fileUrl = await saveAttachment(organizationId, file.name, Buffer.from(await file.arrayBuffer()), contentType);
    const fileName = (customFileName?.trim() || file.name || "attachment").slice(0, 255);
    const fileSize = file.size;
    const fileType = contentType;

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
    await assertLeadAccess(parsed.data.leadId, { userId, organizationId });

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
  const { userId, organizationId } = await requireOrg();
  await assertLeadAccess(leadId, { userId, organizationId });

  return db
    .select()
    .from(leadAttachments)
    .where(and(eq(leadAttachments.leadId, leadId), eq(leadAttachments.organizationId, organizationId)))
    .orderBy(desc(leadAttachments.createdAt));
}

export async function deleteAttachmentAction(attachmentId: string, leadId: string) {
  const { userId, organizationId } = await assertWritable();
  try {
    await assertLeadAccess(leadId, { userId, organizationId });

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

    await deleteAttachment(deleted.fileUrl);

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

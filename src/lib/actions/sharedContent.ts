"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireOrg, assertWritable } from "@/lib/rbac";
import { ContentSharingService } from "@/domains/leads/contentSharingService";
import { ok, fail, actionFail } from "@/lib/actions/result";

const createSchema = z.object({
  leadId: z.string().uuid(),
  title: z.string().min(1).max(255),
  targetUrl: z.string().max(2048).optional(),
  bodyText: z.string().max(5000).optional(),
  imageUrl: z.string().max(2048).optional(),
});

export async function createShareAction(data: unknown) {
  const { organizationId, userId } = await assertWritable();
  const parsed = createSchema.safeParse(data);
  if (!parsed.success) {
    return fail("VALIDATION", "Please provide a title for what you're sharing.");
  }
  const { leadId, title, targetUrl, bodyText, imageUrl } = parsed.data;

  const body = bodyText?.trim() || undefined;
  const link = targetUrl?.trim() || undefined;
  const image = imageUrl?.trim() || undefined;

  if (!link && !body) return fail("VALIDATION", "Add a link or a message to share.");

  // http(s) links only — blocks javascript:/data: open-redirects on the public page.
  let normalizedLink: string | null = null;
  if (link) {
    normalizedLink = ContentSharingService.normalizeUrl(link);
    if (!normalizedLink) return fail("VALIDATION", "Enter a valid web link (http:// or https://).", { targetUrl: "Must be a valid http(s) link." });
  }
  let normalizedImage: string | null = null;
  if (image) {
    normalizedImage = ContentSharingService.normalizeUrl(image);
    if (!normalizedImage) return fail("VALIDATION", "Enter a valid image URL (http:// or https://).", { imageUrl: "Must be a valid http(s) link." });
  }

  try {
    const share = await ContentSharingService.createShare({
      organizationId,
      leadId,
      ownerId: userId,
      title,
      targetUrl: normalizedLink,
      bodyText: body ?? null,
      imageUrl: normalizedImage,
    });
    revalidatePath(`/leads/${leadId}`);
    return ok(share);
  } catch (e) {
    return actionFail(e);
  }
}

export async function listSharesAction(leadId: string) {
  await requireOrg();
  return ContentSharingService.listForLead(leadId);
}

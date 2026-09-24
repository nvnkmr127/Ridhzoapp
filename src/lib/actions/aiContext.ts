"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireOrg, requirePermission } from "@/lib/rbac";
import { OrgService } from "@/domains/organizations/service";
import { generateText, aiEnabled } from "@/lib/ai/client";
import { ok, fail, actionFail } from "@/lib/actions/result";
import { PlanService } from "@/domains/billing/planService";

const MAX_BYTES = 10 * 1024 * 1024; // business docs are small; cap the upload
const MAX_CHARS = 8000; // extracted text ceiling before it hits the editor

const extractSchema = z.object({
  base64: z.string().min(1),
  fileName: z.string().min(1).max(255),
});

// Extracts plain text from an uploaded PDF / DOCX / TXT so the tenant can seed their AI business
// context from a document instead of typing it. Parsing runs server-side (Vercel); the browser
// only sends the file bytes as base64.
export async function extractDocTextAction(input: z.infer<typeof extractSchema>) {
  await requireOrg();
  const parsed = extractSchema.safeParse(input);
  if (!parsed.success) return fail("VALIDATION", "Invalid file payload.");

  const buffer = Buffer.from(parsed.data.base64, "base64");
  if (buffer.length === 0) return fail("VALIDATION", "That file appears to be empty.");
  if (buffer.length > MAX_BYTES) return fail("VALIDATION", "File too large — max 10 MB.");

  const ext = parsed.data.fileName.toLowerCase().split(".").pop() ?? "";
  try {
    let text = "";
    if (ext === "pdf") {
      const { PDFParse } = await import("pdf-parse");
      const parser = new PDFParse({ data: new Uint8Array(buffer) });
      text = (await parser.getText()).text;
      await parser.destroy();
    } else if (ext === "docx") {
      const mammoth = await import("mammoth");
      text = (await mammoth.extractRawText({ buffer })).value;
    } else if (ext === "txt" || ext === "md" || ext === "text") {
      text = buffer.toString("utf8");
    } else {
      return fail("VALIDATION", "Unsupported file type. Use PDF, DOCX, or TXT.");
    }
    text = text
      .replace(/^\s*--\s*\d+\s*of\s*\d+\s*--\s*$/gm, "") // pdf-parse v2 page markers
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
      .slice(0, MAX_CHARS);
    if (!text) return fail("VALIDATION", "Couldn't read any text from that file.");
    return ok({ text });
  } catch (e) {
    return actionFail(e);
  }
}

const improveSchema = z.object({ draft: z.string().max(MAX_CHARS) });

const IMPROVE_SYSTEM = `You turn a business owner's rough notes into a concise "business profile" for an AI sales assistant to use when representing this business to leads.
Cover, in a few short plain sentences: what the business sells, who its customers are, its key products/services or programs, and its tone of voice.
Use ONLY what the notes say — never invent offerings, prices, guarantees, or claims. Omit anything not stated. No preamble, no markdown headings, no bullet symbols. Output only the profile text, under 300 words.`;

// Rewrites the tenant's raw notes into a clean, structured business profile using the AI Gateway.
export async function improveAiContextAction(input: z.infer<typeof improveSchema>) {
  const { organizationId } = await requireOrg();
  const parsed = improveSchema.safeParse(input);
  if (!parsed.success) return fail("VALIDATION", "Text is too long to improve.");
  const clean = parsed.data.draft.trim();
  if (!clean) return fail("VALIDATION", "Add some text first, then improve it.");
  if (!aiEnabled()) return fail("SERVER", "AI isn't configured on this environment.");
  if (!(await PlanService.useAiCredit(organizationId))) {
    return fail("LIMIT", "You've used all your AI credits for this month. Upgrade for more.");
  }

  const improved = await generateText(IMPROVE_SYSTEM, clean, 500);
  if (!improved) {
    await PlanService.refundAiCredit(organizationId);
    return fail("SERVER", "Couldn't improve the text right now — try again.");
  }
  return ok({ improved: improved.slice(0, 4000) });
}

const saveSchema = z.object({ text: z.string() });

// Persists just the business-context field, so the popup can save on its own without the full
// settings form. updateOrganization takes a partial, so this touches only ai_context.
export async function saveAiContextAction(input: z.infer<typeof saveSchema>) {
  const { organizationId } = await requirePermission("settings.manage");
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return fail("VALIDATION", "Invalid text.");
  const text = parsed.data.text.trim().slice(0, 4000);
  try {
    await OrgService.updateOrganization(organizationId, { aiContext: text || null });
    revalidatePath("/settings");
    return ok({ text });
  } catch (e) {
    return actionFail(e);
  }
}

"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireOrg, requirePermission } from "@/lib/rbac";
import { OrgService } from "@/domains/organizations/service";
import { generateText, aiEnabled } from "@/lib/ai/client";
import { ok, fail, actionFail } from "@/lib/actions/result";
import { PlanService } from "@/domains/billing/planService";
import { and, desc, eq, count } from "drizzle-orm";
import { db } from "@/db";
import { aiKnowledgeDocs, leadSources, organizations, users } from "@/db/schema";
import { AuditService } from "@/domains/audit/service";
import { businessPreamble } from "@/lib/ai/leadBrief";
import {
  FIELD_MAX, KNOWLEDGE_DOC_MAX, NOTES_MAX, PROFILE_FIELDS, TONES, normalizeProfile, pickKnowledge, type AiProfile,
} from "@/lib/ai/businessProfile";

const MAX_BYTES = 10 * 1024 * 1024; // business docs are small; cap the upload
const MAX_CHARS = KNOWLEDGE_DOC_MAX; // extracted text ceiling; the notes box itself holds NOTES_MAX

const extractSchema = z.object({
  base64: z.string().min(1),
  fileName: z.string().min(1).max(255),
});

// Extracts plain text from an uploaded PDF / DOCX / TXT so the tenant can seed their AI business
// context from a document instead of typing it. Parsing runs server-side (Vercel); the browser
// only sends the file bytes as base64.
export async function extractDocTextAction(input: z.infer<typeof extractSchema>) {
  await requirePermission("settings.manage");
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
      .trim();
    text = text.slice(0, MAX_CHARS);
    if (!text) return fail("VALIDATION", "Couldn't read any text from that file.");
    return ok({ text, truncated: text.length >= MAX_CHARS });
  } catch (e) {
    return actionFail(e);
  }
}

const field = (key: string) => {
  const label = PROFILE_FIELDS.find((f) => f.key === key)?.label ?? key;
  return z.string().max(FIELD_MAX, `"${label}" is too long (max ${FIELD_MAX} characters).`).optional();
};
const profileSchema = z.object({
  sells: field("sells"),
  customers: field("customers"),
  areas: field("areas"),
  different: field("different"),
  faqs: field("faqs"),
  never: field("never"),
  tone: z.enum(Object.keys(TONES) as [keyof typeof TONES]).optional(),
  emoji: z.boolean().optional(),
  signoff: z.string().max(80).optional(),
  replyLanguage: z.string().max(40).optional(),
});
const contextSchema = z.object({
  profile: profileSchema,
  notes: z.string().max(NOTES_MAX, `Other notes are too long (max ${NOTES_MAX} characters). Move long material to Knowledge.`),
});
type ContextInput = z.input<typeof contextSchema>;
const firstIssue = (e: z.ZodError) => e.issues[0]?.message ?? "Check the text and try again.";

const IMPROVE_SYSTEM = `You organise a business owner's rough notes into a business profile that an AI sales assistant uses when talking to leads.
Return ONLY a JSON object with these string keys (omit a key when the notes say nothing about it):
"sells" (products/services with prices), "customers", "areas" (service areas, branches, timings), "different" (what makes them different),
"faqs" (common questions with answers, one "Q: … A: …" per line), "never" (things the assistant must never say or must hand over to a person),
"notes" (anything useful that fits nowhere else).
Use ONLY facts stated in the input — never invent offerings, prices, guarantees or claims. Keep each value short and plain.`;

// Sorts the tenant's notes (and any fields already filled) into the structured profile using the AI Gateway.
export async function improveAiContextAction(input: ContextInput) {
  const { organizationId } = await requirePermission("settings.manage");
  const parsed = contextSchema.extend({ notes: z.string().max(KNOWLEDGE_DOC_MAX) }).safeParse(input);
  if (!parsed.success) return fail("VALIDATION", firstIssue(parsed.error));
  const { profile, notes } = parsed.data;
  const draft = [...PROFILE_FIELDS.filter((f) => profile[f.key]?.trim()).map((f) => `${f.label}: ${profile[f.key]}`), notes.trim()].filter(Boolean).join("\n\n");
  if (!draft) return fail("VALIDATION", "Add some text first, then let AI sort it.");
  if (!aiEnabled()) return fail("SERVER", "AI isn't configured on this environment.");
  if (!(await PlanService.consumeAiCredit(organizationId))) {
    return fail("LIMIT", "You've used all your AI credits for this month. Upgrade for more.");
  }

  const raw = await generateText(IMPROVE_SYSTEM, draft.slice(0, 20_000), 1500);
  let out: Record<string, unknown> | null = null;
  try {
    out = raw ? JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)) : null;
  } catch {
    out = null;
  }
  if (!out) {
    await PlanService.refundAiCredit(organizationId);
    return fail("SERVER", "Couldn't sort the text right now — try again.");
  }
  // Keep the tenant's voice settings; only the fact fields are rewritten.
  const improved: AiProfile = { ...normalizeProfile({ ...profile, ...out }), tone: profile.tone, emoji: profile.emoji, signoff: profile.signoff, replyLanguage: profile.replyLanguage };
  return ok({ profile: improved, notes: typeof out.notes === "string" ? out.notes.trim().slice(0, NOTES_MAX) : "" });
}

const HISTORY_KEEP = 6; // the current version + 5 to go back to

// Saves the structured profile + free notes, and records the version so it can be restored.
export async function saveAiContextAction(input: ContextInput) {
  const { organizationId, userId } = await requirePermission("settings.manage");
  const parsed = contextSchema.safeParse(input);
  if (!parsed.success) return fail("VALIDATION", firstIssue(parsed.error));
  const profile = normalizeProfile(parsed.data.profile);
  const notes = parsed.data.notes.trim() || null;
  try {
    const [[org], [me]] = await Promise.all([
      db.select({ aiProfile: organizations.aiProfile, aiContext: organizations.aiContext, history: organizations.aiContextHistory })
        .from(organizations).where(eq(organizations.id, organizationId)).limit(1),
      db.select({ firstName: users.firstName, lastName: users.lastName, email: users.email }).from(users).where(eq(users.id, userId)).limit(1),
    ]);
    const by = me ? [me.firstName, me.lastName].filter(Boolean).join(" ") || me.email || "Unnamed" : null;
    let history = org?.history ?? [];
    // First save after this feature shipped: keep the old free text as a version to go back to.
    if (!history.length && (org?.aiContext || Object.keys(org?.aiProfile ?? {}).length)) {
      history = [{ at: new Date(0).toISOString(), by: null, profile: org!.aiProfile, notes: org!.aiContext }];
    }
    history = [{ at: new Date().toISOString(), by, profile, notes }, ...history].slice(0, HISTORY_KEEP);

    const [updated] = await db.update(organizations)
      .set({ aiProfile: profile, aiContext: notes, aiContextHistory: history, updatedAt: new Date() })
      .where(eq(organizations.id, organizationId))
      .returning({ updatedAt: organizations.updatedAt });
    // Content stays out of the audit trail (free text); the version history holds it.
    await AuditService.log({ organizationId, userId, action: "settings.ai_context_update", entityType: "organization", entityId: organizationId, metadata: { fields: Object.keys(profile), notes: !!notes } });
    revalidatePath("/settings");
    return ok({ profile, notes: notes ?? "", history, updatedAt: updated?.updatedAt ? new Date(updated.updatedAt).toISOString() : null });
  } catch (e) {
    return actionFail(e);
  }
}

// ---- Website import ----------------------------------------------------------------------------

const htmlToText = (html: string) =>
  html
    .replace(/<(script|style|noscript|svg|nav|footer)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\/(p|div|li|h[1-6]|br|tr|section)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .replace(/\n{2,}/g, "\n\n")
    .trim();

// Reads the text of the tenant's website homepage. The URL is tenant-supplied and fetched from our
// server, so every hop (redirects followed by hand) must resolve to a public address.
export async function importWebsiteAction(input: { url: string }) {
  await requirePermission("settings.manage");
  let url = String(input.url ?? "").trim();
  if (!url) return fail("VALIDATION", "Add your website address first.");
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  const { assertPublicHttpUrl } = await import("@/lib/webhooks/ssrf");
  try {
    let res: Response | null = null;
    for (let hop = 0; hop < 4; hop++) {
      await assertPublicHttpUrl(url);
      res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(8000), headers: { "user-agent": "RidhzoBot/1.0 (+business profile import)", accept: "text/html" } });
      const next = res.status >= 300 && res.status < 400 ? res.headers.get("location") : null;
      if (!next) break;
      url = new URL(next, url).toString();
      res = null;
    }
    if (!res) return fail("VALIDATION", "That website redirects too many times.");
    if (!res.ok) return fail("VALIDATION", `The website answered with an error (HTTP ${res.status}).`);
    if (!(res.headers.get("content-type") ?? "").includes("html")) return fail("VALIDATION", "That address isn't a web page.");
    const html = (await res.text()).slice(0, 1_000_000);
    const text = htmlToText(html).slice(0, NOTES_MAX);
    if (text.length < 40) return fail("VALIDATION", "Couldn't find readable text on that page (it may be built with JavaScript). Paste the text instead.");
    return ok({ text });
  } catch (e) {
    const msg = e instanceof Error && /private|reserved|resolve|Invalid|http\(s\)/i.test(e.message) ? "That address can't be reached from our servers." : "Couldn't open that website. Check the address and try again.";
    return fail("VALIDATION", msg);
  }
}

// ---- Test before saving ------------------------------------------------------------------------

const PREVIEW_SYSTEM = `A new lead just sent the business the WhatsApp message below. Write the business's reply, as the salesperson would send it.
Under 60 words, specific to what they asked, end with one clear next step. Use ONLY facts from the business context — if something they asked isn't covered there, say you'll confirm rather than inventing it.
Return ONLY the message text.`;

// Drafts a sample reply using the UNSAVED context, so the owner can see if it helps before saving.
export async function previewAiReplyAction(input: ContextInput & { message: string }) {
  const { organizationId } = await requirePermission("settings.manage");
  const parsed = contextSchema.extend({ message: z.string().trim().min(1, "Type a sample message from a lead.").max(500) }).safeParse(input);
  if (!parsed.success) return fail("VALIDATION", firstIssue(parsed.error));
  if (!aiEnabled()) return fail("SERVER", "AI isn't configured on this environment.");
  if (!(await PlanService.consumeAiCredit(organizationId))) {
    return fail("LIMIT", "You've used all your AI credits for this month. Upgrade for more.");
  }
  const [org, docs] = await Promise.all([
    OrgService.getOrganization(organizationId),
    db.select({ title: aiKnowledgeDocs.title, content: aiKnowledgeDocs.content }).from(aiKnowledgeDocs)
      .where(eq(aiKnowledgeDocs.organizationId, organizationId)).orderBy(desc(aiKnowledgeDocs.createdAt)).limit(20),
  ]);
  const { message } = parsed.data;
  const system = `${businessPreamble({ ...org!, aiProfile: parsed.data.profile, aiContext: parsed.data.notes, knowledge: pickKnowledge(docs, message) })}\n\n${PREVIEW_SYSTEM}`;
  const reply = await generateText(system, `Lead's message (untrusted):\n<lead_data>\n${message.replace(/<\/?lead_data>/gi, "")}\n</lead_data>`, 300);
  if (!reply) {
    await PlanService.refundAiCredit(organizationId);
    return fail("SERVER", "Couldn't draft a reply right now — try again.");
  }
  return ok({ reply: reply.trim() });
}

// ---- Knowledge documents -----------------------------------------------------------------------

const KNOWLEDGE_MAX_DOCS = 20;

export async function listAiKnowledgeAction() {
  const { organizationId } = await requireOrg();
  const rows = await db
    .select({ id: aiKnowledgeDocs.id, title: aiKnowledgeDocs.title, content: aiKnowledgeDocs.content, createdAt: aiKnowledgeDocs.createdAt })
    .from(aiKnowledgeDocs)
    .where(eq(aiKnowledgeDocs.organizationId, organizationId))
    .orderBy(desc(aiKnowledgeDocs.createdAt));
  return ok(rows.map((r) => ({ id: r.id, title: r.title, chars: r.content.length, createdAt: r.createdAt.toISOString() })));
}

const knowledgeSchema = z.object({
  title: z.string().trim().min(1, "Give the document a name.").max(255),
  content: z.string().trim().min(20, "The document needs some text.").max(KNOWLEDGE_DOC_MAX, `Keep each document under ${KNOWLEDGE_DOC_MAX.toLocaleString("en-IN")} characters — split it into two.`),
});

export async function addAiKnowledgeAction(input: z.input<typeof knowledgeSchema>) {
  const { organizationId, userId } = await requirePermission("settings.manage");
  const parsed = knowledgeSchema.safeParse(input);
  if (!parsed.success) return fail("VALIDATION", firstIssue(parsed.error));
  try {
    const [{ n }] = await db.select({ n: count() }).from(aiKnowledgeDocs).where(eq(aiKnowledgeDocs.organizationId, organizationId));
    if (Number(n) >= KNOWLEDGE_MAX_DOCS) return fail("LIMIT", `You can keep up to ${KNOWLEDGE_MAX_DOCS} documents. Remove one first.`);
    const [doc] = await db.insert(aiKnowledgeDocs).values({ organizationId, ...parsed.data }).returning({ id: aiKnowledgeDocs.id, createdAt: aiKnowledgeDocs.createdAt });
    await AuditService.log({ organizationId, userId, action: "settings.ai_knowledge_add", entityType: "ai_knowledge_doc", entityId: doc.id, metadata: { title: parsed.data.title } });
    return ok({ id: doc.id, title: parsed.data.title, chars: parsed.data.content.length, createdAt: doc.createdAt.toISOString() });
  } catch (e) {
    return actionFail(e);
  }
}

export async function deleteAiKnowledgeAction(id: string) {
  const { organizationId, userId } = await requirePermission("settings.manage");
  const parsed = z.guid().safeParse(id);
  if (!parsed.success) return fail("VALIDATION", "Invalid document.");
  const [gone] = await db.delete(aiKnowledgeDocs)
    .where(and(eq(aiKnowledgeDocs.id, parsed.data), eq(aiKnowledgeDocs.organizationId, organizationId)))
    .returning({ title: aiKnowledgeDocs.title });
  if (!gone) return fail("NOT_FOUND", "That document was already removed.");
  await AuditService.log({ organizationId, userId, action: "settings.ai_knowledge_delete", entityType: "ai_knowledge_doc", entityId: parsed.data, metadata: { title: gone.title } });
  return ok({ id: parsed.data });
}

// ---- Per-source context ------------------------------------------------------------------------

export async function listSourceAiContextAction() {
  const { organizationId } = await requireOrg();
  const rows = await db
    .select({ id: leadSources.id, name: leadSources.name, aiContext: leadSources.aiContext })
    .from(leadSources)
    .where(and(eq(leadSources.organizationId, organizationId), eq(leadSources.isActive, 1)))
    .orderBy(leadSources.name);
  return ok(rows.map((r) => ({ ...r, aiContext: r.aiContext ?? "" })));
}

export async function saveSourceAiContextAction(input: { id: string; text: string }) {
  const { organizationId, userId } = await requirePermission("settings.manage");
  const parsed = z.object({ id: z.guid(), text: z.string().max(FIELD_MAX, `Keep it under ${FIELD_MAX} characters.`) }).safeParse(input);
  if (!parsed.success) return fail("VALIDATION", firstIssue(parsed.error));
  const text = parsed.data.text.trim() || null;
  const [row] = await db.update(leadSources).set({ aiContext: text })
    .where(and(eq(leadSources.id, parsed.data.id), eq(leadSources.organizationId, organizationId)))
    .returning({ id: leadSources.id });
  if (!row) return fail("NOT_FOUND", "That lead source no longer exists.");
  await AuditService.log({ organizationId, userId, action: "settings.source_ai_context_update", entityType: "lead_source", entityId: row.id, metadata: { set: !!text } });
  return ok({ id: row.id, text: text ?? "" });
}

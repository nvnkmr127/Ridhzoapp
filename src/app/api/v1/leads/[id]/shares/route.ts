import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authorizeApiRequest } from "@/lib/apiAuth";
import { canEditLeads, leadForApi, leadNotFound, readOnly } from "@/lib/meetingsApi";
import { ContentSharingService } from "@/domains/leads/contentSharingService";

const schema = z.object({
  title: z.string().trim().min(1).max(200),
  targetUrl: z.string().trim().max(2000).optional(),
  bodyText: z.string().trim().max(5000).optional(),
});

// Create a tracked share link (brochure, price list…) — you see when the lead opens it.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeApiRequest(req);
  if ("error" in auth) return auth.error;
  if (!auth.userId) return NextResponse.json({ error: "A user session is required" }, { status: 403 });
  const { id } = await params;
  if (!(await leadForApi(auth, id))) return leadNotFound();
  if (!(await canEditLeads(auth))) return readOnly();
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Please give it a title." }, { status: 422 });
  const { title, targetUrl, bodyText } = parsed.data;
  if (!targetUrl && !bodyText) return NextResponse.json({ error: "Add a link or a message to share." }, { status: 422 });
  // http(s) only — blocks javascript:/data: links on the public page.
  const link = targetUrl ? ContentSharingService.normalizeUrl(targetUrl) : null;
  if (targetUrl && !link) return NextResponse.json({ error: "Enter a valid web link (http:// or https://)." }, { status: 422 });

  const share = await ContentSharingService.createShare({
    organizationId: auth.organizationId,
    leadId: id,
    ownerId: auth.userId,
    title,
    targetUrl: link,
    bodyText: bodyText || null,
    imageUrl: null,
  });
  return NextResponse.json({ data: { ...share, url: `${req.nextUrl.origin}/s/${share.slug}` } }, { status: 201 });
}

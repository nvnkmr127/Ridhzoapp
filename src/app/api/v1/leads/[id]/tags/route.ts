import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authorizeApiRequest } from "@/lib/apiAuth";
import { TagService } from "@/domains/tags/service";
import { canEditLeads, leadForApi, leadNotFound, readOnly } from "@/lib/meetingsApi";

const idSchema = z.guid();

// List this lead's tags.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeApiRequest(req);
  if ("error" in auth) return auth.error;
  const { id } = await params;
  if (!idSchema.safeParse(id).success) return NextResponse.json({ error: "Invalid lead ID" }, { status: 400 });

  if (!(await leadForApi(auth, id))) return leadNotFound();
  return NextResponse.json({ data: await TagService.getForLead(id) });
}

// Add a tag (by name; find-or-create) to this lead.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeApiRequest(req);
  if ("error" in auth) return auth.error;
  const { id } = await params;
  if (!idSchema.safeParse(id).success) return NextResponse.json({ error: "Invalid lead ID" }, { status: 400 });
  if (!(await leadForApi(auth, id))) return leadNotFound();
  if (!(await canEditLeads(auth))) return readOnly();

  const body = await req.json().catch(() => null);
  const parsed = z.object({ name: z.string().trim().min(1).max(100) }).safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "A tag name is required" }, { status: 422 });

  try {
    const tag = await TagService.addToLead(id, parsed.data.name, auth.organizationId);
    return NextResponse.json({ data: tag }, { status: 201 });
  } catch (e) {
    const { logError } = await import("@/lib/log");
    const ref = logError("api/v1/leads/[id]/tags POST", e, { leadId: id });
    return NextResponse.json({ error: "Could not add tag. Please try again.", ref }, { status: 500 });
  }
}

// Remove a tag from this lead (tagId in the body).
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeApiRequest(req);
  if ("error" in auth) return auth.error;
  const { id } = await params;
  if (!idSchema.safeParse(id).success) return NextResponse.json({ error: "Invalid lead ID" }, { status: 400 });
  if (!(await leadForApi(auth, id))) return leadNotFound();
  if (!(await canEditLeads(auth))) return readOnly();

  const body = await req.json().catch(() => null);
  const parsed = z.object({ tagId: z.guid() }).safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "A tagId is required" }, { status: 422 });

  try {
    await TagService.removeFromLead(id, parsed.data.tagId, auth.organizationId);
    return NextResponse.json({ data: { removed: true } });
  } catch (e) {
    const { logError } = await import("@/lib/log");
    const ref = logError("api/v1/leads/[id]/tags DELETE", e, { leadId: id });
    return NextResponse.json({ error: "Could not remove tag. Please try again.", ref }, { status: 500 });
  }
}

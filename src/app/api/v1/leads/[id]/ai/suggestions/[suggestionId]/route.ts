import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authorizeApiRequest } from "@/lib/apiAuth";
import { canEditLeads, leadForApi, leadNotFound, readOnly } from "@/lib/meetingsApi";
import { hasPermissionForRoleId } from "@/lib/rbac";
import { applyAiSuggestion } from "@/lib/ai/leadSuggestions";
import { markAiSuggestionDone } from "@/lib/ai/leadAssist";

const bodySchema = z.object({ action: z.enum(["apply", "dismiss"]) });
const idSchema = z.string().min(1).max(40);

// Accept or dismiss one AI suggestion from the recap (GET …/ai/recap → data.plan): fill a custom
// field, change status, or add the suggested follow-up. Same rules as the web profile.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; suggestionId: string }> }) {
  const auth = await authorizeApiRequest(req);
  if ("error" in auth) return auth.error;
  const { id, suggestionId } = await params;
  if (!idSchema.safeParse(suggestionId).success) return NextResponse.json({ error: "Invalid suggestion id" }, { status: 400 });
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Body must be {"action": "apply" | "dismiss"}' }, { status: 422 });

  const lead = await leadForApi(auth, id);
  if (!lead) return leadNotFound();

  try {
    if (parsed.data.action === "dismiss") {
      await markAiSuggestionDone(lead.id, auth.organizationId, suggestionId);
      return NextResponse.json({ data: { dismissed: true } });
    }
    if (!(await canEditLeads(auth))) return readOnly();
    const res = await applyAiSuggestion({
      lead,
      organizationId: auth.organizationId,
      userId: auth.userId ?? null,
      isAdmin: !auth.userId || (await hasPermissionForRoleId(auth.roleId ?? null, "settings.manage")),
      id: suggestionId,
    });
    if (!res.ok) return NextResponse.json({ error: res.message }, { status: res.code === "NOT_FOUND" ? 404 : 422 });
    return NextResponse.json({ data: { applied: res.applied } });
  } catch (e) {
    const { logError } = await import("@/lib/log");
    const ref = logError("api/v1/leads/[id]/ai/suggestions POST", e, { leadId: id });
    return NextResponse.json({ error: "Could not apply that suggestion.", ref }, { status: 500 });
  }
}

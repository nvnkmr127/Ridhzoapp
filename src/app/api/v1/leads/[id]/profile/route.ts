import { NextRequest, NextResponse } from "next/server";
import { authorizeApiRequest } from "@/lib/apiAuth";
import { hasPermissionForRoleId } from "@/lib/rbac";
import { leadForApi, leadNotFound } from "@/lib/meetingsApi";
import { buildLeadProfile } from "@/lib/leads/profile";
import { signAttachmentLink } from "@/lib/mobileAuth";

// Everything the web lead profile shows beyond the core record (see lib/leads/profile).
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeApiRequest(req);
  if ("error" in auth) return auth.error;
  const { id } = await params;
  const lead = await leadForApi(auth, id);
  if (!lead) return leadNotFound();
  const isAdmin = !auth.userId || (await hasPermissionForRoleId(auth.roleId ?? null, "settings.manage"));

  try {
    const profile = await buildLeadProfile(lead, { userId: auth.userId ?? null, organizationId: auth.organizationId, isAdmin });
    const origin = req.nextUrl.origin;
    return NextResponse.json({
      data: {
        ...profile,
        // Short-lived signed links the app can open in the browser (no bearer header there).
        attachments: profile.attachments.map((a) => ({
          ...a,
          url: auth.userId ? `${origin}/api/attachments/${a.id}?${signAttachmentLink(a.id, auth.userId)}` : null,
        })),
        shares: profile.shares.map((s) => ({ ...s, url: `${origin}/s/${s.slug}` })),
      },
    });
  } catch (e) {
    const { logError } = await import("@/lib/log");
    const ref = logError("api/v1/leads/[id]/profile", e, { leadId: id });
    return NextResponse.json({ error: "Could not load this lead's details.", ref }, { status: 500 });
  }
}

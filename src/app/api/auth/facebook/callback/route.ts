import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { MetaTokenRefreshService } from "@/domains/leads/metaTokenRefreshService";
import { LeadSourceService } from "@/domains/leads/sourceService";

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  const errorReason = searchParams.get("error_reason");
  const state = searchParams.get("state"); // carries CSRF/context + the popup flag

  // Popup mode is requested via the `popup=true` query or a `state` that includes "popup".
  const isPopup = searchParams.get("popup") === "true" || (state ?? "").includes("popup");

  // CSRF (double-submit): the client puts a random nonce in both `state` (as popup_<nonce>) and a
  // first-party cookie. A forged callback can't know/set the victim's cookie, so a mismatch is
  // rejected. Enforced only in the popup flow the real client uses.
  const stateNonce = (state ?? "").startsWith("popup_") ? state!.slice("popup_".length) : null;
  const cookieNonce = req.cookies.get("fb_oauth_state")?.value ?? null;

  // Single exit point: in popup mode, post the outcome back to the opener and close; otherwise
  // fall back to a normal redirect. This is why a denied/failed connection now shows a message
  // instead of leaving the popup stranded on a full page.
  const respond = (params: Record<string, string>, ok: boolean) => {
    const url = new URL("/settings/integrations", req.url);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    if (!isPopup) return NextResponse.redirect(url);

    const payload = ok
      ? { type: "OAUTH_RESPONSE", provider: "facebook", status: "success", data: params }
      : {
          type: "OAUTH_RESPONSE",
          provider: "facebook",
          status: "error",
          reason: params.error ?? "server_error",
          details: params.details,
        };
    // Escape < to keep serialized values from breaking out of the <script> block.
    const json = JSON.stringify(payload).replace(/</g, "\\u003c");
    const href = JSON.stringify(url.toString());
    const html = `<!DOCTYPE html><html><head><title>Facebook</title></head><body style="font-family:system-ui;padding:24px;text-align:center">
<p>${ok ? "Connected. You can close this window." : "Connection failed. You can close this window."}</p>
<script>
  if (window.opener) { window.opener.postMessage(${json}, window.location.origin); window.close(); }
  else { window.location.href = ${href}; }
</script></body></html>`;
    return new NextResponse(html, { headers: { "Content-Type": "text/html" } });
  };

  if (error || errorReason) {
    console.error("[META_OAUTH_CALLBACK_ERROR]", error, errorReason);
    return respond({ error: "oauth_denied" }, false);
  }

  if (!code) {
    return respond({ error: "missing_code" }, false);
  }

  if (isPopup && (!stateNonce || !cookieNonce || stateNonce !== cookieNonce)) {
    console.warn("[META_OAUTH_CALLBACK] state/cookie nonce mismatch — rejecting as possible CSRF");
    return respond({ error: "csrf" }, false);
  }

  // Honest gate: without real Meta app credentials we cannot connect a Page. Don't fake it.
  if (!MetaTokenRefreshService.isConfigured()) {
    console.warn("[META_OAUTH_CALLBACK] Facebook integration not configured — set FACEBOOK_APP_ID / FACEBOOK_APP_SECRET");
    return respond({ error: "facebook_not_configured" }, false);
  }

  try {
    const redirectUri = `${req.nextUrl.origin}/api/auth/facebook/callback`;

    // 1. Exchange OAuth code → short-lived user token.
    const shortLived = await MetaTokenRefreshService.exchangeCodeForToken(code, redirectUri);

    // 2. Short-lived → long-lived (60-day) user token.
    const longLivedResult = await MetaTokenRefreshService.exchangeShortLivedToken(shortLived.accessToken);

    // 3. List the Pages this user manages (each carries its own Page access token). We connect
    //    them all as lead sources — a solo user with one Page connects seamlessly; an agency with
    //    several gets them all and can deactivate the ones they don't want in the sources list.
    const pages = await MetaTokenRefreshService.listPages(longLivedResult.accessToken);

    const session = await getServerSession(authOptions).catch(() => null);
    let organizationId = session?.user?.organizationId;
    let userId = session?.user?.id;

    if (!userId) {
      const { getToken } = await import("next-auth/jwt");
      const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET }).catch(() => null);
      if (token) {
        userId = token.id as string;
        organizationId = token.organizationId as string;
      }
    }

    if (pages.length === 0) return respond({ error: "no_pages" }, false);

    // In popup mode, stash the Page tokens server-side (keyed to this user) and send the opener only
    // pageId + name — tokens never touch the browser. connectFacebookPagesAction reads them back.
    if (isPopup) {
      if (!userId) {
        console.error("[META_OAUTH_CALLBACK] No authenticated user session found in callback");
        return respond({ error: "server_error", details: "User session expired or not found. Please log in and retry." }, false);
      }
      const { setPendingPages } = await import("@/lib/leads/fbPendingStore");
      await setPendingPages(userId, {
        pages: pages.map((p) => ({ pageId: p.pageId, name: p.name, pageAccessToken: p.pageAccessToken })),
        expiresAt: longLivedResult.expiresAt.toISOString(),
      });

      const payload = {
        type: "OAUTH_RESPONSE",
        provider: "facebook",
        status: "pages_ready",
        pages: pages.map((p) => ({ pageId: p.pageId, name: p.name })),
        expiresAt: longLivedResult.expiresAt.toISOString(),
      };
      const json = JSON.stringify(payload).replace(/</g, "\\u003c");
      const html = `<!DOCTYPE html><html><head><title>Facebook</title></head><body style="font-family:system-ui;padding:24px;text-align:center">
<p>Connected. Please select your Page in the main window.</p>
<script>
  if (window.opener) { window.opener.postMessage(${json}, window.location.origin); window.close(); }
  else { window.location.href = "/settings/sources"; }
</script></body></html>`;
      return new NextResponse(html, {
        headers: { "Content-Type": "text/html", "Set-Cookie": "fb_oauth_state=; Max-Age=0; Path=/; SameSite=Lax" },
      });
    }

    // Non-popup fallback
    if (organizationId) {
      for (const p of pages) {
        await LeadSourceService.upsertFacebookPageSource(organizationId, {
          pageId: p.pageId,
          pageAccessToken: p.pageAccessToken,
          expiresAt: longLivedResult.expiresAt,
        });
      }
    }

    console.log(`[META_OAUTH_CALLBACK_SUCCESS] Discovered ${pages.length} Page(s)`);

    return respond(
      {
        status: "facebook_connected",
        pages: String(pages.length),
        pageId: pages[0].pageId,
        expiresAt: longLivedResult.expiresAt.toISOString(),
      },
      true,
    );
  } catch (err: any) {
    console.error("[META_OAUTH_CALLBACK_EXCEPTION]", err);
    return respond({ error: "server_error", details: err?.message || String(err) }, false);
  }
}

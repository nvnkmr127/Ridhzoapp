import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { MetaTokenRefreshService } from "@/domains/leads/metaTokenRefreshService";

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
  // rejected. The popup flow is the only flow: a callback without a matching nonce is refused, so a
  // link carrying someone else's OAuth code can't attach their Pages to the victim's workspace.
  const stateNonce = (state ?? "").startsWith("popup_") ? state!.slice("popup_".length) : null;
  const cookieNonce = req.cookies.get("fb_oauth_state")?.value ?? null;

  // Error exit: in popup mode, post the reason back to the opener and close; otherwise redirect to
  // the sources page with the error. (Success always goes through the pages_ready popup reply below.)
  const respond = (params: Record<string, string>) => {
    const url = new URL("/settings/sources", req.url);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    if (!isPopup) return NextResponse.redirect(url);

    const payload = {
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
<p>Connection failed. You can close this window.</p>
<script>
  if (window.opener) { window.opener.postMessage(${json}, window.location.origin); window.close(); }
  else { window.location.href = ${href}; }
</script></body></html>`;
    return new NextResponse(html, { headers: { "Content-Type": "text/html" } });
  };

  if (error || errorReason) {
    console.error("[META_OAUTH_CALLBACK_ERROR]", error, errorReason);
    return respond({ error: "oauth_denied" });
  }

  if (!code) {
    return respond({ error: "missing_code" });
  }

  if (!stateNonce || !cookieNonce || stateNonce !== cookieNonce) {
    console.warn("[META_OAUTH_CALLBACK] state/cookie nonce mismatch — rejecting as possible CSRF");
    return respond({ error: "csrf" });
  }

  // Honest gate: without real Meta app credentials we cannot connect a Page. Don't fake it.
  if (!MetaTokenRefreshService.isConfigured()) {
    console.warn("[META_OAUTH_CALLBACK] Facebook integration not configured — set FACEBOOK_APP_ID / FACEBOOK_APP_SECRET");
    return respond({ error: "facebook_not_configured" });
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
    let userId = session?.user?.id;

    if (!userId) {
      const { getToken } = await import("next-auth/jwt");
      const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET }).catch(() => null);
      if (token) {
        userId = token.id as string;
      }
    }

    if (pages.length === 0) return respond({ error: "no_pages" });

    // Stash the Page tokens server-side (keyed to this user) and send the opener only pageId + name —
    // tokens never touch the browser. connectFacebookPagesAction reads them back after the user picks
    // Pages (which is also where the plan's source limit and the webhook subscription are applied).
    if (!userId) {
      console.error("[META_OAUTH_CALLBACK] No authenticated user session found in callback");
      return respond({ error: "server_error", details: "User session expired or not found. Please log in and retry." });
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
  } catch (err: any) {
    console.error("[META_OAUTH_CALLBACK_EXCEPTION]", err);
    return respond({ error: "server_error", details: err?.message || String(err) });
  }
}

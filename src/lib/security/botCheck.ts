import "server-only";

// Anti-bot for the PUBLIC forms (hosted lead form, booking page). Two layers:
//  • honeypot: a field real people never see; any value = a bot (caller answers "success" and drops it);
//  • Cloudflare Turnstile, when TURNSTILE_SECRET_KEY is set (site key: NEXT_PUBLIC_TURNSTILE_SITE_KEY).
// With no Turnstile keys the CAPTCHA layer is skipped (fail-open, warned once) so a missing env var
// can't take lead capture down — the per-IP / per-source / per-org rate limits still apply.
let warned = false;

export async function verifyTurnstile(token: string | undefined, ip: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    if (!warned && process.env.NODE_ENV === "production") {
      warned = true;
      console.warn("[bot-check] TURNSTILE_SECRET_KEY is not set — public forms have no CAPTCHA.");
    }
    return true;
  }
  if (!token) return false;
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token, ...(ip !== "unknown" ? { remoteip: ip } : {}) }),
      signal: AbortSignal.timeout(5000),
    });
    return Boolean(((await res.json()) as { success?: boolean }).success);
  } catch (e) {
    console.error("[bot-check] turnstile verify failed", e instanceof Error ? e.message : e);
    return false; // the CAPTCHA is configured, so an unverifiable answer is a refusal
  }
}

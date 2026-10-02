// The caller's real IP, for rate limits. X-Forwarded-For is "client, proxy1, proxy2…" and the LEFT end is
// whatever the client chose to send, so trusting it lets anyone mint a fresh rate-limit bucket per
// request. Trust only what our own edge wrote:
//   • Vercel: x-vercel-forwarded-for / x-real-ip (set by the edge, client values overwritten);
//   • Cloudflare in front: cf-connecting-ip (set TRUST_CF_CONNECTING_IP=1);
//   • anything else: the entry our nearest proxy appended — counted from the RIGHT, TRUSTED_PROXY_HOPS
//     entries in (default 1 = the last one).
type H = { get(name: string): string | null };

export function ipFromHeaders(h: H): string {
  if (process.env.VERCEL) {
    const v = h.get("x-vercel-forwarded-for") ?? h.get("x-real-ip");
    if (v) return v.split(",")[0].trim() || "unknown";
  }
  if (process.env.TRUST_CF_CONNECTING_IP === "1") {
    const cf = h.get("cf-connecting-ip");
    if (cf) return cf.trim();
  }
  const parts = (h.get("x-forwarded-for") ?? "").split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return h.get("x-real-ip")?.trim() || "unknown";
  const hops = Math.max(1, Number(process.env.TRUSTED_PROXY_HOPS) || 1);
  return parts[Math.max(0, parts.length - hops)];
}

export const clientIp = (req: { headers: Headers }) => ipFromHeaders(req.headers);

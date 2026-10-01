// The real client is the first hop of X-Forwarded-For; the rest are proxies (or whatever the caller
// prepended), so keying a rate limit on the whole header lets anyone dodge it by changing the tail.
export const clientIp = (req: { headers: Headers }) =>
  req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

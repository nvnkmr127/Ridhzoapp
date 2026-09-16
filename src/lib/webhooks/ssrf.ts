// SSRF guard for outbound webhook delivery. Admins control endpoint URLs, and the worker runs on a
// droplet where the cloud metadata endpoint (169.254.169.254) and localhost services are reachable —
// so a raw fetch to an admin-supplied URL is an SSRF sink. We resolve the host and reject any address
// in a private / loopback / link-local / reserved range BEFORE connecting, and callers pass
// redirect:"manual" so a public URL can't 302 into the internal network.

// True if `ip` (v4 or v6 literal) is one we must never let an outbound webhook reach.
export function isBlockedAddress(ip: string): boolean {
  const addr = ip.trim().toLowerCase();

  // IPv6 (incl. IPv4-mapped ::ffff:a.b.c.d)
  if (addr.includes(":")) {
    if (addr === "::1" || addr === "::") return true; // loopback / unspecified
    const mapped = addr.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isBlockedAddress(mapped[1]);
    const h = addr.split("%")[0]; // strip zone id
    if (h.startsWith("fe80")) return true; // link-local
    if (h.startsWith("fc") || h.startsWith("fd")) return true; // unique-local fc00::/7
    return false;
  }

  const parts = addr.split(".").map((p) => Number(p));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true; // not a clean IPv4 → refuse
  const [a, b] = parts;
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // 10/8 private
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local + cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12 private
  if (a === 192 && b === 168) return true; // 192.168/16 private
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64/10 CGNAT
  if (a >= 224) return true; // multicast / reserved / broadcast
  return false;
}

// Throws if `rawUrl` isn't a public http(s) endpoint we're allowed to POST to. Resolves DNS so a
// hostname pointing at a private IP is caught too. Node-only (dns); lazy-imported by callers.
export async function assertPublicHttpUrl(rawUrl: string): Promise<void> {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    throw new Error("Invalid webhook URL.");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new Error("Webhook URL must be http(s).");
  }
  const host = u.hostname.replace(/^\[|\]$/g, ""); // unwrap IPv6 literal
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(":")) {
    if (isBlockedAddress(host)) throw new Error("Webhook URL resolves to a private or reserved address.");
    return;
  }
  const { lookup } = await import("dns/promises");
  let records: { address: string }[];
  try {
    records = await lookup(host, { all: true });
  } catch {
    throw new Error("Webhook host could not be resolved.");
  }
  if (records.length === 0 || records.some((r) => isBlockedAddress(r.address))) {
    throw new Error("Webhook URL resolves to a private or reserved address.");
  }
}

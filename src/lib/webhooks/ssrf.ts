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
    // IPv4-mapped in HEX form (::ffff:7f00:1 == 127.0.0.1) and the deprecated IPv4-compatible ::a.b.c.d.
    const hex = h.match(/^(?:0{0,4}:){0,5}(?:ffff:)?([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (hex && (h.includes("ffff:") || h.startsWith("::"))) {
      const hi = parseInt(hex[1], 16), lo = parseInt(hex[2], 16);
      return isBlockedAddress(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
    }
    if (h.startsWith("fe8") || h.startsWith("fe9") || h.startsWith("fea") || h.startsWith("feb")) return true; // fe80::/10 link-local
    if (h.startsWith("fec") || h.startsWith("fed") || h.startsWith("fee") || h.startsWith("fef")) return true; // fec0::/10 site-local (deprecated)
    if (h.startsWith("fc") || h.startsWith("fd")) return true; // unique-local fc00::/7
    if (h.startsWith("64:ff9b:")) return true; // NAT64: can embed any IPv4 incl. private ones
    if (h.startsWith("2002:")) return true; // 6to4: same
    if (h.startsWith("2001:db8") || h.startsWith("ff")) return true; // documentation, multicast
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

// Same guard for non-HTTP outbound connections (tenant SMTP). Resolves `host` and returns the address
// to connect to — callers connect to THAT address (not the hostname) so a DNS answer can't change
// between this check and the connection (rebinding).
export async function resolvePublicHost(host: string): Promise<string> {
  const h = host.trim().replace(/^\[|\]$/g, "");
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h) || h.includes(":")) {
    if (isBlockedAddress(h)) throw new Error("This host is a private or reserved address.");
    return h;
  }
  const { lookup } = await import("dns/promises");
  let records: { address: string }[];
  try {
    records = await lookup(h, { all: true });
  } catch {
    throw new Error(`Host "${h}" could not be resolved.`);
  }
  if (records.length === 0 || records.some((r) => isBlockedAddress(r.address))) {
    throw new Error("This host resolves to a private or reserved address.");
  }
  return records[0].address;
}

// POST JSON to a tenant-supplied https/http URL, connecting to the address we VALIDATED (not a second
// DNS answer), so a rebinding host can't pass the check and then resolve to an internal IP. The body
// is read with a hard size cap and no redirects are followed. Throws Error(name "TimeoutError") on timeout.
export async function pinnedPost(
  rawUrl: string,
  opts: { headers: Record<string, string>; body: string; timeoutMs: number; maxBytes: number },
): Promise<{ status: number; text: string; tooLarge: boolean }> {
  const r = await pinnedRequest(rawUrl, { method: "POST", ...opts });
  return { status: r.status, text: r.text, tooLarge: r.tooLarge };
}

// Same pinned, size-capped, no-redirect request for any method (GET for website import, POST for webhooks).
export async function pinnedRequest(
  rawUrl: string,
  opts: { method: "GET" | "POST"; headers: Record<string, string>; body?: string; timeoutMs: number; maxBytes: number },
): Promise<{ status: number; text: string; tooLarge: boolean; headers: Record<string, string | string[] | undefined> }> {
  const u = new URL(rawUrl);
  const address = await resolvePublicHost(u.hostname);
  const family = address.includes(":") ? 6 : 4;
  const mod = u.protocol === "http:" ? await import("http") : await import("https");
  return new Promise((resolve, reject) => {
    const req = mod.request(
      u,
      {
        method: opts.method,
        headers: { ...opts.headers, ...(opts.body !== undefined ? { "content-length": Buffer.byteLength(opts.body) } : {}) },
        timeout: opts.timeoutMs,
        // Always connect to the validated address (SNI/Host still use the hostname).
        lookup: ((_h: string, o: { all?: boolean }, cb: (...a: unknown[]) => void) =>
          o?.all ? cb(null, [{ address, family }]) : cb(null, address, family)) as never,
      },
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        let tooLarge = false;
        res.on("data", (c: Buffer) => {
          size += c.length;
          if (size > opts.maxBytes) {
            tooLarge = true;
            res.destroy();
            resolve({ status: res.statusCode ?? 0, text: "", tooLarge, headers: res.headers });
            return;
          }
          chunks.push(c);
        });
        res.on("end", () => resolve({ status: res.statusCode ?? 0, text: Buffer.concat(chunks).toString("utf8"), tooLarge, headers: res.headers }));
        res.on("error", (e) => (tooLarge ? undefined : reject(e)));
      },
    );
    const timeout = () => reject(Object.assign(new Error("timed out"), { name: "TimeoutError" }));
    req.on("timeout", () => { req.destroy(); timeout(); });
    req.on("error", reject);
    req.end(opts.body);
  });
}

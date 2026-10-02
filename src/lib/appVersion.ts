import { PlatformConfigService } from "@/domains/platform/configService";

// True when `current` ("1.0.3") is older than `min`. Numeric parts only; a missing min means "no minimum".
export function isOlder(current: string, min: string | null | undefined): boolean {
  if (!min) return false;
  const a = current.split(".").map((n) => parseInt(n, 10) || 0);
  const b = min.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d) return d < 0;
  }
  return false;
}

let cache: { at: number; min: Partial<Record<string, string>> } | null = null;

// The platform_configs "mobile.minVersion" ({"android":"1.0.3"}), cached 60 s — read on mobile writes only.
async function minVersions() {
  if (cache && Date.now() - cache.at < 60_000) return cache.min;
  const min = await PlatformConfigService.get<Partial<Record<string, string>>>("mobile.minVersion", {}).catch(() => ({}));
  cache = { at: Date.now(), min: min ?? {} };
  return cache.min;
}

// A mobile build older than the minimum may still read (so it can show its "update required" screen) but
// not write: an old client against a changed API would corrupt data. Clients that send no version header
// (builds from before it existed) are left alone — their update gate handles them.
export async function outdatedWriteBlock(headers: Headers, method: string): Promise<string | null> {
  if (method === "GET" || method === "HEAD") return null;
  const version = headers.get("x-app-version");
  const platform = headers.get("x-platform");
  if (!version || !platform) return null;
  const min = (await minVersions())[platform];
  return isOlder(version, min) ? `This version of Ridhzo is no longer supported. Update the app to continue (minimum ${min}).` : null;
}

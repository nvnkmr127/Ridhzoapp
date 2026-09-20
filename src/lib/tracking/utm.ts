// Client-side UTM & Ad Attribution tracking utility for tenant acquisition

export interface StoredAttribution {
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
  fbclid?: string;
  gclid?: string;
  fbp?: string;
  fbc?: string;
  referrer?: string;
  landingPage?: string;
  capturedAt?: string;
}

const STORAGE_KEY = "ridhzo_tenant_attr";

function getCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  const match = document.cookie.match(new RegExp(`(^|;\\s*)(${name})=([^;]*)`));
  return match ? decodeURIComponent(match[3]) : undefined;
}

export function captureAttribution(): StoredAttribution | null {
  if (typeof window === "undefined") return null;

  try {
    const params = new URLSearchParams(window.location.search);
    const utmSource = params.get("utm_source") || undefined;
    const utmMedium = params.get("utm_medium") || undefined;
    const utmCampaign = params.get("utm_campaign") || undefined;
    const utmContent = params.get("utm_content") || undefined;
    const utmTerm = params.get("utm_term") || undefined;
    const fbclid = params.get("fbclid") || undefined;
    const gclid = params.get("gclid") || undefined;

    // Check if new attribution params exist on the current URL
    const hasParams = utmSource || utmCampaign || fbclid || gclid;

    const existingStr = sessionStorage.getItem(STORAGE_KEY) || localStorage.getItem(STORAGE_KEY);
    let existing: StoredAttribution = {};
    if (existingStr) {
      try {
        existing = JSON.parse(existingStr);
      } catch {
        // ignore
      }
    }

    // First-touch attribution preserved, or updated if new ad click detected
    if (hasParams || !existing.capturedAt) {
      const fbp = getCookie("_fbp");
      let fbc = getCookie("_fbc");
      if (!fbc && fbclid) {
        fbc = `fb.1.${Date.now()}.${fbclid}`;
      }

      const fresh: StoredAttribution = {
        utmSource: utmSource ?? existing.utmSource,
        utmMedium: utmMedium ?? existing.utmMedium,
        utmCampaign: utmCampaign ?? existing.utmCampaign,
        utmContent: utmContent ?? existing.utmContent,
        utmTerm: utmTerm ?? existing.utmTerm,
        fbclid: fbclid ?? existing.fbclid,
        gclid: gclid ?? existing.gclid,
        fbp: fbp ?? existing.fbp,
        fbc: fbc ?? existing.fbc,
        referrer: document.referrer || existing.referrer,
        landingPage: window.location.href,
        capturedAt: new Date().toISOString(),
      };

      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
      return fresh;
    }

    return existing;
  } catch {
    return null;
  }
}

export function getStoredAttribution(): StoredAttribution | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY) || localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

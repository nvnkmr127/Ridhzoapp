// Contact-key normalization for deduplication. Leads arrive from Facebook, web forms, webhooks and
// manual entry in wildly different formats; dedup only works if we compare a canonical form.

export function normalizeEmail(email?: string | null): string | undefined {
  const v = (email ?? "").trim().toLowerCase();
  return v || undefined;
}

export function normalizePhone(phone?: string | null, defaultDialCode?: string | null): string | undefined {
  if (phone == null) return undefined;
  const trimmed = String(phone).trim();
  if (!trimmed) return undefined;
  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return undefined;
  if (hasPlus) return `+${digits}`;

  // No "+": reps type national numbers ("98765 43210", "098765 43210"). Without a country code the
  // WhatsApp/Call links point nowhere and dedup can't match the "+91…" form — so apply the
  // workspace's default dial code when we know it.
  const cc = (defaultDialCode ?? "").replace(/\D/g, "");
  if (!cc) return digits;
  const national = digits.replace(/^0+/, ""); // trunk "0" / international "00" prefix
  if (national.length < 6) return digits;
  // Already carries the country code ("919876543210", "0091 98765…") — just add the "+". Needs 11+
  // digits: a 10-digit Indian mobile like "9123456789" starts with "91" but is a national number.
  if (national.startsWith(cc) && national.length >= 11) return `+${national}`;
  return `+${cc}${national}`;
}

// Default dial code for a workspace: its country if set, else inferred from timezone, then currency.
// Covers Ridhzo's main markets; anything unknown returns null (numbers are then stored as typed).
const DIAL_BY_COUNTRY: Record<string, string> = {
  IN: "+91", US: "+1", CA: "+1", GB: "+44", AE: "+971", SA: "+966", QA: "+974", KW: "+965", OM: "+968", BH: "+973",
  SG: "+65", MY: "+60", AU: "+61", NZ: "+64", ZA: "+27", NG: "+234", KE: "+254", PK: "+92", BD: "+880", LK: "+94",
  NP: "+977", DE: "+49", FR: "+33", ES: "+34", IT: "+39", NL: "+31", IE: "+353", BR: "+55", MX: "+52", ID: "+62", PH: "+63",
};
const COUNTRY_BY_TZ: Record<string, string> = {
  "Asia/Kolkata": "IN", "Asia/Calcutta": "IN", "Asia/Dubai": "AE", "Asia/Riyadh": "SA", "Asia/Qatar": "QA",
  "Asia/Singapore": "SG", "Asia/Kuala_Lumpur": "MY", "Europe/London": "GB", "Asia/Karachi": "PK", "Asia/Dhaka": "BD",
  "Asia/Colombo": "LK", "Asia/Kathmandu": "NP", "Africa/Johannesburg": "ZA", "Africa/Lagos": "NG", "Africa/Nairobi": "KE",
  "Asia/Jakarta": "ID", "Asia/Manila": "PH", "Pacific/Auckland": "NZ",
};
const COUNTRY_BY_CURRENCY: Record<string, string> = {
  INR: "IN", AED: "AE", SAR: "SA", QAR: "QA", SGD: "SG", MYR: "MY", GBP: "GB", AUD: "AU", NZD: "NZ", ZAR: "ZA",
  NGN: "NG", KES: "KE", PKR: "PK", BDT: "BD", LKR: "LK", NPR: "NP", CAD: "CA", IDR: "ID", PHP: "PH", BRL: "BR", MXN: "MX",
};

export function dialCodeFor(org: { country?: string | null; timezone?: string | null; currency?: string | null }): string | null {
  const country =
    (org.country && org.country.toUpperCase()) ||
    (org.timezone && (COUNTRY_BY_TZ[org.timezone] ?? (org.timezone.startsWith("Australia/") ? "AU" : org.timezone.startsWith("America/") ? "US" : undefined))) ||
    (org.currency && COUNTRY_BY_CURRENCY[org.currency.toUpperCase()]) ||
    null;
  return country ? (DIAL_BY_COUNTRY[country] ?? null) : null;
}

// Contact-key normalization for deduplication. Leads arrive from Facebook, web forms, webhooks and
// manual entry in wildly different formats; dedup only works if we compare a canonical form.

export function normalizeEmail(email?: string | null): string | undefined {
  const v = (email ?? "").trim().toLowerCase();
  return v || undefined;
}

export function normalizePhone(phone?: string | null): string | undefined {
  if (phone == null) return undefined;
  const trimmed = String(phone).trim();
  if (!trimmed) return undefined;
  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return undefined;
  // ponytail: format-only canonicalization — strips spaces/dashes/parens and keeps a leading +.
  // It does NOT infer a country code, so a bare national number ("9845391384") still won't match
  // its "+91..." form. Add a per-org default country + libphonenumber if that mismatch shows up.
  return hasPlus ? `+${digits}` : digits;
}

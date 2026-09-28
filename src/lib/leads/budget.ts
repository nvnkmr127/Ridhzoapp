// Indian budget answers from ad forms ("₹40–75_lakhs_", "₹75_lakhs–1.5_cr", "above_₹1.5_cr_", "35 Lakhs")
// → rupees. A range becomes its midpoint; a unit on the right applies to a bare number on its left
// ("40–75 lakhs" = 40 L to 75 L). No digits ("not_decided_yet") → null.

const UNIT: Record<string, number> = { k: 1e3, thousand: 1e3, l: 1e5, lac: 1e5, lacs: 1e5, lakh: 1e5, lakhs: 1e5, cr: 1e7, crore: 1e7, crores: 1e7 };

export function parseBudget(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const s = String(raw).toLowerCase().replace(/,/g, "").replace(/_/g, " ");
  const parts = [...s.matchAll(/(\d+(?:\.\d+)?)\s*(crores?|cr|lakhs?|lacs?|l|thousand|k)?(?![a-z])/g)]
    .map((m) => ({ n: Number(m[1]), unit: m[2] as string | undefined }));
  if (!parts.length) return null;
  for (let i = parts.length - 2; i >= 0; i--) parts[i].unit ??= parts[i + 1].unit;
  const values = parts.map((p) => p.n * (p.unit ? UNIT[p.unit] : 1)).filter((v) => v > 0);
  if (!values.length) return null;
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
}

/** ₹ in lakhs/crores, the way Indian sales teams read it: 5750000 → "₹57.5 L", 15000000 → "₹1.5 Cr". */
export function formatInr(value: number | string | null | undefined): string | null {
  const v = Number(value);
  if (value == null || value === "" || !Number.isFinite(v) || v <= 0) return null;
  const trim = (n: number) => String(Number(n.toFixed(2)));
  if (v >= 1e7) return `₹${trim(v / 1e7)} Cr`;
  if (v >= 1e5) return `₹${trim(v / 1e5)} L`;
  return `₹${v.toLocaleString("en-IN")}`;
}

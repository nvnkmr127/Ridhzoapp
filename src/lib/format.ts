// Presentation settings for a tenant. Kept together so every money/date render uses the SAME source
// (organizations.currency/locale/dateFormat/timezone) instead of a hardcoded "$"/"en-US"/browser tz.
// This module is client-safe (pure Intl, no db import); server fetch lives in format.server.ts.
export type OrgFormat = { currency: string; locale: string; dateFormat: string; timezone: string };

export const DEFAULT_FORMAT: OrgFormat = { currency: "USD", locale: "en", dateFormat: "MM/DD/YYYY", timezone: "UTC" };

// Money in the org's currency + locale. Falls back to a plain grouped number if the runtime rejects
// the currency/locale, so a bad setting never throws in a render path.
export function formatCurrency(amount: number | string | null | undefined, fmt: Partial<OrgFormat> = {}): string {
  const n = typeof amount === "string" ? Number(amount) : amount ?? 0;
  const value = Number.isFinite(n) ? (n as number) : 0;
  const currency = fmt.currency || DEFAULT_FORMAT.currency;
  const locale = fmt.locale || DEFAULT_FORMAT.locale;
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
  } catch {
    return `${currency} ${value.toLocaleString()}`;
  }
}

// A Date rendered in the org's timezone + locale (date + time). Used instead of bare toLocaleString()
// so timestamps read in the workspace's zone, not the viewer's browser zone.
export function formatDateTime(date: Date | string | number | null | undefined, fmt: Partial<OrgFormat> = {}): string {
  if (date == null) return "";
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  const locale = fmt.locale || DEFAULT_FORMAT.locale;
  try {
    return new Intl.DateTimeFormat(locale, {
      timeZone: fmt.timezone || DEFAULT_FORMAT.timezone,
      dateStyle: "medium",
      timeStyle: "short",
    }).format(d);
  } catch {
    return d.toLocaleString();
  }
}

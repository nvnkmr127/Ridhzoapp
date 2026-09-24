// CSV building for exports. Pure. Neutralises spreadsheet formulas: lead names/fields come from
// public web forms, and a cell starting with = + - @ (or tab/CR) runs as a formula in Excel/Sheets
// ("CSV injection"). Such cells are prefixed with an apostrophe, which spreadsheets display as text.
export function csvCell(value: unknown): string {
  if (value == null) return "";
  let s = value instanceof Date ? value.toISOString() : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) || s.startsWith("'") ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  // BOM so Excel opens UTF-8 (names in Hindi, Tamil, etc.) correctly.
  return "﻿" + [headers, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
}

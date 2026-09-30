// Server-side GST tax-invoice PDF (attached to the payment email). Mirrors the printable page at
// /invoice/[id]. Uses the built-in Helvetica, which has no ₹ glyph, so amounts print as "Rs." and any
// non-Latin text (e.g. a Hindi business name) is reduced to what WinAnsi can draw.
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { TaxInvoice } from "./invoiceService";

const rs = (n: number) => `Rs. ${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
const safe = (s: string) => s.replace(/[^\x20-\x7E\xA0-\xFF]/g, "?");

export async function invoicePdf(inv: TaxInvoice): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]); // A4
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const mono = await doc.embedFont(StandardFonts.Courier);
  const ink = rgb(0.04, 0.04, 0.04);
  const grey = rgb(0.42, 0.42, 0.42);
  const M = 48, W = 595 - M * 2;
  let y = 842 - M;

  const text = (t: string, x: number, size = 10, f = font, color = ink) => page.drawText(safe(t), { x, y, size, font: f, color });
  const right = (t: string, xr: number, size = 10, f = font) => page.drawText(safe(t), { x: xr - f.widthOfTextAtSize(safe(t), size), y, size, font: f, color: ink });
  const rule = (thick = 0.5) => page.drawLine({ start: { x: M, y }, end: { x: M + W, y }, thickness: thick, color: ink });

  const isCredit = inv.type === "credit_note";
  const supplier = { name: process.env.GST_SUPPLIER_NAME || "Ridhzo", gstin: process.env.GST_SUPPLIER_GSTIN, address: process.env.GST_SUPPLIER_ADDRESS };

  text(isCredit ? "CREDIT NOTE" : "TAX INVOICE", M, 22, bold);
  right(supplier.name, M + W, 12, bold);
  y -= 18;
  text(inv.invoiceNumber, M, 11, mono);
  if (supplier.gstin) right(`GSTIN: ${supplier.gstin}`, M + W, 9, mono);
  y -= 12;
  for (const line of (supplier.address ?? "").split("\n").filter(Boolean)) { right(line, M + W, 9); y -= 11; }
  y -= 14; rule(1.5); y -= 24;

  const top = y;
  text("BILLED TO", M, 8, mono, grey); y -= 14;
  text(inv.buyerName || inv.orgName, M, 11, bold); y -= 14;
  if (inv.gstin) { text(`GSTIN: ${inv.gstin}`, M, 9, mono); y -= 12; }
  if (inv.placeOfSupply) { text(`Place of supply: state code ${inv.placeOfSupply}`, M, 9); y -= 12; }
  const leftEnd = y;
  y = top;
  right(`Date: ${day(inv.issuedAt)}`, M + W); y -= 13;
  right(`Period: ${day(inv.periodStart)} - ${day(inv.periodEnd)}`, M + W); y -= 13;
  if (inv.paidAt) { right(`Paid: ${day(inv.paidAt)}`, M + W); y -= 13; }
  if (inv.paymentId) { right(`Payment ref: ${inv.paymentId}`, M + W, 9, mono); y -= 13; }
  y = Math.min(y, leftEnd) - 22;

  text("DESCRIPTION", M, 8, mono, grey);
  text("SAC", M + 330, 8, mono, grey);
  right("AMOUNT", M + W, 8, mono);
  y -= 8; rule(); y -= 18;
  text(`Ridhzo subscription - ${inv.plan} plan`, M);
  text(inv.sacCode, M + 330, 10, mono);
  right(rs(inv.amount), M + W);
  y -= 12; rule(0.25); y -= 22;

  const row = (label: string, value: string, f = font, size = 10) => { right(label, M + W - 110, size, f); right(value, M + W, size, f); y -= 16; };
  row("Taxable value", rs(inv.amount));
  if (inv.cgst) { row(`CGST @ ${inv.taxRate / 2}%`, rs(inv.cgst)); row(`SGST @ ${inv.taxRate / 2}%`, rs(inv.sgst ?? 0)); }
  if (inv.igst) row(`IGST @ ${inv.taxRate}%`, rs(inv.igst));
  y -= 4; rule(1.5); y -= 20;
  row("Total", rs(inv.totalAmount), bold, 13);

  y = M + 10;
  text("This is a computer-generated invoice and needs no signature.", M, 8, font, grey);
  return doc.save();
}

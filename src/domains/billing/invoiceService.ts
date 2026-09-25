import { db } from "@/db";
import { organizations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { PlatformConfigService } from "@/domains/platform/configService";
import { AuditService } from "@/domains/audit/service";
import { UserFacingError } from "@/lib/actions/result";

export interface TaxInvoice {
  id: string;
  invoiceNumber: string; // "INV/2026-27/0001" or "CN/2026-27/0001" — sequential per series per financial year
  orgId: string;
  orgName: string;
  plan: string;
  amount: number; // taxable value, INR (2dp)
  taxRate: number; // 18
  taxAmount: number; // cgst + sgst + igst
  cgst?: number;
  sgst?: number;
  igst?: number;
  placeOfSupply?: string | null; // 2-digit GST state code, when known
  totalAmount: number;
  sacCode: string; // 998313 (SaaS)
  gstin?: string | null;
  status: "paid" | "issued" | "void" | "refunded";
  type?: "invoice" | "credit_note";
  originalInvoiceId?: string | null;
  paymentId?: string | null; // Razorpay payment id — makes webhook retries idempotent
  issuedAt: string;
  paidAt?: string | null;
  periodStart: string;
  periodEnd: string;
}

const INVOICE_CONFIG_KEY = "tax_invoices";
const GST_RATE = 18;
const round2 = (n: number) => Math.round(n * 100) / 100;

// Indian financial year label for a date: Apr–Mar, e.g. 2026-05-01 → "2026-27", 2027-02-01 → "2026-27".
export function financialYear(d: Date): string {
  const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  return `${y}-${String((y + 1) % 100).padStart(2, "0")}`;
}

// Next number in a series for the FY. Invoice numbers must be unique and consecutive per series per FY
// (GST Rule 46); runs inside the config row lock, so two concurrent issues can't share a number.
export function nextNumber(list: TaxInvoice[], series: "INV" | "CN", fy: string): string {
  const prefix = `${series}/${fy}/`;
  const max = list.reduce((m, i) => (i.invoiceNumber.startsWith(prefix) ? Math.max(m, Number(i.invoiceNumber.slice(prefix.length)) || 0) : m), 0);
  return `${prefix}${String(max + 1).padStart(4, "0")}`;
}

// Intra-state supply (buyer's state = ours) is CGST 9% + SGST 9%; inter-state is IGST 18%. The buyer's
// state is the first two digits of their GSTIN; with no GSTIN (B2C) we treat it as intra-state.
// Our state comes from GST_SUPPLIER_STATE_CODE; unset, we can't tell, so it's recorded as IGST.
export function splitTax(taxable: number, gstin: string | null | undefined) {
  const tax = round2((taxable * GST_RATE) / 100);
  const supplier = process.env.GST_SUPPLIER_STATE_CODE?.trim() || null;
  const buyer = gstin ? gstin.slice(0, 2) : supplier;
  if (supplier && buyer === supplier) {
    const half = round2(tax / 2);
    return { taxAmount: round2(half * 2), cgst: half, sgst: half, igst: 0, placeOfSupply: supplier };
  }
  return { taxAmount: tax, cgst: 0, sgst: 0, igst: tax, placeOfSupply: buyer };
}

export class InvoiceService {
  static async listInvoices(limit = 100): Promise<TaxInvoice[]> {
    const list = await PlatformConfigService.get<TaxInvoice[]>(INVOICE_CONFIG_KEY, []);
    return list.slice(0, limit);
  }

  static async listForOrg(orgId: string): Promise<TaxInvoice[]> {
    const list = await PlatformConfigService.get<TaxInvoice[]>(INVOICE_CONFIG_KEY, []);
    return list.filter((i) => i.orgId === orgId);
  }

  static async getInvoice(id: string): Promise<TaxInvoice | null> {
    const list = await PlatformConfigService.get<TaxInvoice[]>(INVOICE_CONFIG_KEY, []);
    return list.find((inv) => inv.id === id) ?? null;
  }

  // Issue a tax invoice. `amount` is the taxable value; pass `total` instead when the figure already
  // includes GST (a Razorpay charge). `paymentId` makes a repeat call for the same payment a no-op.
  // ponytail: invoices live in one JSON config row (locked on write); move to a table with a DB
  // sequence if volume grows into the thousands per year.
  static async generateInvoice(
    params: { orgId: string; plan: string; amount?: number; total?: number; status?: "paid" | "issued"; gstin?: string | null; paymentId?: string | null },
    actorId?: string | null,
  ): Promise<TaxInvoice> {
    const [org] = await db
      .select({ id: organizations.id, name: organizations.name })
      .from(organizations)
      .where(eq(organizations.id, params.orgId))
      .limit(1);
    if (!org) throw new UserFacingError("That organization doesn't exist.");

    const taxable = params.total != null ? round2(params.total / (1 + GST_RATE / 100)) : round2(params.amount ?? 0);
    if (!(taxable > 0)) throw new UserFacingError("Amount must be more than zero.");
    const tax = splitTax(taxable, params.gstin);
    const totalAmount = params.total != null ? round2(params.total) : round2(taxable + tax.taxAmount);
    const now = new Date();
    const status = params.status ?? "paid";

    let invoice: TaxInvoice | null = null;
    await PlatformConfigService.update<TaxInvoice[]>(INVOICE_CONFIG_KEY, [], (list) => {
      if (params.paymentId) {
        const existing = list.find((i) => i.paymentId === params.paymentId);
        if (existing) {
          invoice = existing;
          return list;
        }
      }
      invoice = {
        id: `inv_${now.getTime()}_${Math.random().toString(36).slice(2, 7)}`,
        invoiceNumber: nextNumber(list, "INV", financialYear(now)),
        orgId: params.orgId,
        orgName: org.name,
        plan: params.plan,
        amount: taxable,
        taxRate: GST_RATE,
        ...tax,
        totalAmount,
        sacCode: "998313",
        gstin: params.gstin ?? null,
        status,
        type: "invoice",
        paymentId: params.paymentId ?? null,
        issuedAt: now.toISOString(),
        paidAt: status === "paid" ? now.toISOString() : null,
        periodStart: now.toISOString(),
        periodEnd: new Date(now.getTime() + 30 * 86_400_000).toISOString(),
      };
      return [invoice, ...list];
    });
    const inv = invoice as unknown as TaxInvoice;

    await AuditService.log({
      organizationId: params.orgId,
      userId: actorId ?? null,
      action: "billing.invoice_generated",
      entityType: "invoice",
      entityId: inv.id,
      metadata: { invoiceNumber: inv.invoiceNumber, totalAmount: inv.totalAmount, paymentId: inv.paymentId ?? null },
    });
    return inv;
  }

  // One credit note per invoice, only for a live invoice (not void, not already credited).
  static async issueCreditNote(invoiceId: string, reason?: string, actorId?: string | null): Promise<TaxInvoice | null> {
    let creditNote: TaxInvoice | null = null;
    let original: TaxInvoice | null = null;
    await PlatformConfigService.update<TaxInvoice[]>(INVOICE_CONFIG_KEY, [], (list) => {
      const inv = list.find((i) => i.id === invoiceId);
      if (!inv) return list;
      if (inv.type === "credit_note") throw new UserFacingError("A credit note can't be credited again.");
      if (inv.status === "void") throw new UserFacingError("This invoice is void — there's nothing to credit.");
      if (inv.status === "refunded" || list.some((i) => i.originalInvoiceId === inv.id)) {
        throw new UserFacingError("A credit note was already issued for this invoice.");
      }
      const now = new Date();
      creditNote = {
        ...inv,
        id: `cn_${now.getTime()}_${Math.random().toString(36).slice(2, 7)}`,
        invoiceNumber: nextNumber(list, "CN", financialYear(now)),
        amount: -inv.amount,
        taxAmount: -inv.taxAmount,
        cgst: -(inv.cgst ?? 0),
        sgst: -(inv.sgst ?? 0),
        igst: -(inv.igst ?? 0),
        totalAmount: -inv.totalAmount,
        status: "paid",
        type: "credit_note",
        originalInvoiceId: inv.id,
        paymentId: null,
        issuedAt: now.toISOString(),
        paidAt: now.toISOString(),
      };
      inv.status = "refunded";
      original = inv;
      return [creditNote, ...list];
    });
    if (!creditNote || !original) return null;
    const cn = creditNote as TaxInvoice;
    const orig = original as TaxInvoice;

    await AuditService.log({
      organizationId: orig.orgId,
      userId: actorId ?? null,
      action: "billing.credit_note_issued",
      entityType: "invoice",
      entityId: orig.id,
      metadata: { originalInvoiceNumber: orig.invoiceNumber, creditNoteNumber: cn.invoiceNumber, amount: orig.totalAmount, reason: reason || "refund" },
    });
    return cn;
  }

  // Voiding is for an invoice issued in error; a paid/credited one needs a credit note instead.
  static async voidInvoice(id: string, actorId?: string | null): Promise<TaxInvoice | null> {
    let found: TaxInvoice | null = null;
    await PlatformConfigService.update<TaxInvoice[]>(INVOICE_CONFIG_KEY, [], (list) => {
      const inv = list.find((i) => i.id === id);
      if (!inv) return list;
      if (inv.type === "credit_note") throw new UserFacingError("Credit notes can't be voided.");
      if (inv.status === "void") throw new UserFacingError("This invoice is already void.");
      if (inv.status === "refunded") throw new UserFacingError("This invoice has a credit note — it can't also be voided.");
      if (inv.status === "paid") throw new UserFacingError("A paid invoice can't be voided — issue a credit note instead.");
      inv.status = "void";
      found = inv;
      return list;
    });
    if (!found) return null;
    const inv = found as TaxInvoice;

    await AuditService.log({
      organizationId: inv.orgId,
      userId: actorId ?? null,
      action: "billing.invoice_voided",
      entityType: "invoice",
      entityId: inv.id,
      metadata: { invoiceNumber: inv.invoiceNumber },
    });
    return inv;
  }
}

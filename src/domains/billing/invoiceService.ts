import { db } from "@/db";
import { organizations, taxInvoices } from "@/db/schema";
import { desc, eq, like, sql } from "drizzle-orm";
import { AuditService } from "@/domains/audit/service";
import { UserFacingError } from "@/lib/actions/result";
import { sendEmail, appUrl } from "@/lib/mail/mailer";

export interface TaxInvoice {
  id: string;
  invoiceNumber: string; // "INV/2026-27/0001" or "CN/2026-27/0001" — sequential per series per financial year
  orgId: string;
  orgName: string;
  buyerName?: string | null; // registered business name from the workspace's GST details, at issue time
  plan: string;
  amount: number; // taxable value, INR (2dp)
  taxRate: number; // 18
  taxAmount: number; // cgst + sgst + igst
  cgst?: number | null;
  sgst?: number | null;
  igst?: number | null;
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

const GST_RATE = 18;
const round2 = (n: number) => Math.round(n * 100) / 100;

// Indian financial year label for a date: Apr–Mar, e.g. 2026-05-01 → "2026-27", 2027-02-01 → "2026-27".
export function financialYear(d: Date): string {
  const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  return `${y}-${String((y + 1) % 100).padStart(2, "0")}`;
}

// Next number in a series for the FY. Invoice numbers must be unique and consecutive per series per FY
// (GST Rule 46); runs under the numbering lock, so two concurrent issues can't share a number.
export function nextNumber(list: Pick<TaxInvoice, "invoiceNumber">[], series: "INV" | "CN", fy: string): string {
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

const inr = (n: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(n);

// Sent from the platform address (not the tenant's own SMTP) — this is our invoice to them.
async function emailInvoice(to: string, inv: TaxInvoice) {
  const link = appUrl(`/invoice/${inv.id}`);
  await sendEmail({
    to,
    subject: `Ridhzo tax invoice ${inv.invoiceNumber} — ${inr(inv.totalAmount)}`,
    html: `<p>Hi,</p>
<p>Thanks for your payment. Your GST tax invoice <strong>${inv.invoiceNumber}</strong> for ${inr(inv.totalAmount)} (incl. GST) is ready.</p>
<p><a href="${link}">View and download the invoice</a></p>
<p style="color:#666;font-size:12px">You're getting this because this address is set for invoices on the Plan &amp; billing page. Change it there any time.</p>`,
  });
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type InvoiceRow = typeof taxInvoices.$inferSelect;

const toInvoice = (r: InvoiceRow): TaxInvoice => ({
  ...r,
  status: r.status as TaxInvoice["status"],
  type: r.type as TaxInvoice["type"],
  issuedAt: r.issuedAt.toISOString(),
  paidAt: r.paidAt?.toISOString() ?? null,
  periodStart: r.periodStart.toISOString(),
  periodEnd: r.periodEnd.toISOString(),
});

const toRow = (i: TaxInvoice) => ({
  ...i,
  issuedAt: new Date(i.issuedAt),
  paidAt: i.paidAt ? new Date(i.paidAt) : null,
  periodStart: new Date(i.periodStart),
  periodEnd: new Date(i.periodEnd),
});

// Serializes every invoice/credit-note write for the rest of the transaction: numbering stays gap-free
// and a webhook retry sees the invoice its twin just wrote. (invoice_number is also UNIQUE as a backstop.)
const lockInvoices = (tx: Tx) => tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('tax_invoice_numbering'))`);

// ponytail: reads every number in the FY's series; a SQL max() when a series runs into the tens of thousands.
async function allocateNumber(tx: Tx, series: "INV" | "CN", now: Date): Promise<string> {
  const fy = financialYear(now);
  const rows = await tx.select({ invoiceNumber: taxInvoices.invoiceNumber }).from(taxInvoices).where(like(taxInvoices.invoiceNumber, `${series}/${fy}/%`));
  return nextNumber(rows, series, fy);
}

export class InvoiceService {
  static async listInvoices(limit = 100): Promise<TaxInvoice[]> {
    const rows = await db.select().from(taxInvoices).orderBy(desc(taxInvoices.issuedAt)).limit(limit);
    return rows.map(toInvoice);
  }

  static async listForOrg(orgId: string): Promise<TaxInvoice[]> {
    const rows = await db.select().from(taxInvoices).where(eq(taxInvoices.orgId, orgId)).orderBy(desc(taxInvoices.issuedAt));
    return rows.map(toInvoice);
  }

  static async getInvoice(id: string): Promise<TaxInvoice | null> {
    const [row] = await db.select().from(taxInvoices).where(eq(taxInvoices.id, id)).limit(1);
    return row ? toInvoice(row) : null;
  }

  // Issue a tax invoice. `amount` is the taxable value; pass `total` instead when the figure already
  // includes GST (a Razorpay charge). `paymentId` makes a repeat call for the same payment a no-op.
  static async generateInvoice(
    params: { orgId: string; plan: string; amount?: number; total?: number; status?: "paid" | "issued"; gstin?: string | null; paymentId?: string | null },
    actorId?: string | null,
  ): Promise<TaxInvoice> {
    const [org] = await db
      .select({ id: organizations.id, name: organizations.name, billingName: organizations.billingName, gstin: organizations.gstin, billingEmail: organizations.billingEmail })
      .from(organizations)
      .where(eq(organizations.id, params.orgId))
      .limit(1);
    if (!org) throw new UserFacingError("That organization doesn't exist.");
    // Webhook charges don't pass a GSTIN — use the one saved on the billing page (B2B credit + CGST/IGST split).
    const gstin = params.gstin !== undefined ? params.gstin : (org.gstin ?? null);

    const taxable = params.total != null ? round2(params.total / (1 + GST_RATE / 100)) : round2(params.amount ?? 0);
    if (!(taxable > 0)) throw new UserFacingError("Amount must be more than zero.");
    const tax = splitTax(taxable, gstin);
    const totalAmount = params.total != null ? round2(params.total) : round2(taxable + tax.taxAmount);
    const now = new Date();
    const status = params.status ?? "paid";

    const { inv, isNew } = await db.transaction(async (tx) => {
      await lockInvoices(tx);
      if (params.paymentId) {
        const [existing] = await tx.select().from(taxInvoices).where(eq(taxInvoices.paymentId, params.paymentId)).limit(1);
        if (existing) return { inv: toInvoice(existing), isNew: false };
      }
      const invoice: TaxInvoice = {
        id: `inv_${now.getTime()}_${Math.random().toString(36).slice(2, 7)}`,
        invoiceNumber: await allocateNumber(tx, "INV", now),
        orgId: params.orgId,
        orgName: org.name,
        buyerName: org.billingName ?? null,
        plan: params.plan,
        amount: taxable,
        taxRate: GST_RATE,
        ...tax,
        totalAmount,
        sacCode: "998313",
        gstin,
        status,
        type: "invoice",
        paymentId: params.paymentId ?? null,
        issuedAt: now.toISOString(),
        paidAt: status === "paid" ? now.toISOString() : null,
        periodStart: now.toISOString(),
        periodEnd: new Date(now.getTime() + 30 * 86_400_000).toISOString(),
      };
      await tx.insert(taxInvoices).values(toRow(invoice));
      return { inv: invoice, isNew: true };
    });

    await AuditService.log({
      organizationId: params.orgId,
      userId: actorId ?? null,
      action: "billing.invoice_generated",
      entityType: "invoice",
      entityId: inv.id,
      metadata: { invoiceNumber: inv.invoiceNumber, totalAmount: inv.totalAmount, paymentId: inv.paymentId ?? null },
    });
    // Best-effort: a mail hiccup must never fail the charge webhook that issued the invoice.
    if (isNew && org.billingEmail) {
      await emailInvoice(org.billingEmail, inv).catch((e) => console.error(`[billing] invoice email ${inv.invoiceNumber} failed`, e));
    }
    return inv;
  }

  // One credit note per invoice, only for a live invoice (not void, not already credited).
  static async issueCreditNote(invoiceId: string, reason?: string, actorId?: string | null): Promise<TaxInvoice | null> {
    const result = await db.transaction(async (tx) => {
      await lockInvoices(tx);
      const [row] = await tx.select().from(taxInvoices).where(eq(taxInvoices.id, invoiceId)).limit(1);
      if (!row) return null;
      const inv = toInvoice(row);
      if (inv.type === "credit_note") throw new UserFacingError("A credit note can't be credited again.");
      if (inv.status === "void") throw new UserFacingError("This invoice is void — there's nothing to credit.");
      const [credited] = await tx.select({ id: taxInvoices.id }).from(taxInvoices).where(eq(taxInvoices.originalInvoiceId, inv.id)).limit(1);
      if (inv.status === "refunded" || credited) throw new UserFacingError("A credit note was already issued for this invoice.");
      const now = new Date();
      const creditNote: TaxInvoice = {
        ...inv,
        id: `cn_${now.getTime()}_${Math.random().toString(36).slice(2, 7)}`,
        invoiceNumber: await allocateNumber(tx, "CN", now),
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
      await tx.insert(taxInvoices).values(toRow(creditNote));
      await tx.update(taxInvoices).set({ status: "refunded" }).where(eq(taxInvoices.id, inv.id));
      return { cn: creditNote, orig: { ...inv, status: "refunded" as const } };
    });
    if (!result) return null;
    const { cn, orig } = result;

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
    const inv = await db.transaction(async (tx) => {
      const [row] = await tx.select().from(taxInvoices).where(eq(taxInvoices.id, id)).for("update").limit(1);
      if (!row) return null;
      if (row.type === "credit_note") throw new UserFacingError("Credit notes can't be voided.");
      if (row.status === "void") throw new UserFacingError("This invoice is already void.");
      if (row.status === "refunded") throw new UserFacingError("This invoice has a credit note — it can't also be voided.");
      if (row.status === "paid") throw new UserFacingError("A paid invoice can't be voided — issue a credit note instead.");
      await tx.update(taxInvoices).set({ status: "void" }).where(eq(taxInvoices.id, id));
      return toInvoice({ ...row, status: "void" });
    });
    if (!inv) return null;

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

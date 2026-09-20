import { db } from "@/db";
import { organizations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { PlatformConfigService } from "@/domains/platform/configService";
import { AuditService } from "@/domains/audit/service";

export interface TaxInvoice {
  id: string;
  invoiceNumber: string; // e.g. "INV-2026-0001"
  orgId: string;
  orgName: string;
  plan: string;
  amount: number; // Base amount in INR
  taxRate: number; // e.g. 18 (%)
  taxAmount: number; // CGST + SGST or IGST (18%)
  totalAmount: number; // Total INR
  sacCode: string; // 998313 (Software as a Service)
  gstin?: string | null;
  status: "paid" | "issued" | "void" | "refunded";
  type?: "invoice" | "credit_note";
  originalInvoiceId?: string | null;
  issuedAt: string;
  paidAt?: string | null;
  periodStart: string;
  periodEnd: string;
}

const INVOICE_CONFIG_KEY = "tax_invoices";

export class InvoiceService {
  static async listInvoices(limit = 100): Promise<TaxInvoice[]> {
    const list = await PlatformConfigService.get<TaxInvoice[]>(INVOICE_CONFIG_KEY, []);
    return list.slice(0, limit);
  }

  static async getInvoice(id: string): Promise<TaxInvoice | null> {
    const list = await this.listInvoices(500);
    return list.find((inv) => inv.id === id) ?? null;
  }

  static async generateInvoice(params: {
    orgId: string;
    plan: string;
    amount: number;
    status?: "paid" | "issued";
    gstin?: string | null;
  }): Promise<TaxInvoice> {
    const [org] = await db
      .select({ id: organizations.id, name: organizations.name })
      .from(organizations)
      .where(eq(organizations.id, params.orgId))
      .limit(1);

    const list = await PlatformConfigService.get<TaxInvoice[]>(INVOICE_CONFIG_KEY, []);
    const seq = String(list.length + 1).padStart(4, "0");
    const year = new Date().getFullYear();
    const invoiceNumber = `INV-${year}-${seq}`;

    const taxRate = 18; // 18% standard GST for SaaS
    const taxAmount = Math.round((params.amount * taxRate) / 100);
    const totalAmount = params.amount + taxAmount;
    const now = new Date();
    const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const invoice: TaxInvoice = {
      id: `inv_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      invoiceNumber,
      orgId: params.orgId,
      orgName: org?.name ?? "Unknown Organization",
      plan: params.plan,
      amount: params.amount,
      taxRate,
      taxAmount,
      totalAmount,
      sacCode: "998313", // Cloud computing & SaaS services
      gstin: params.gstin ?? null,
      status: params.status ?? "paid",
      type: "invoice",
      issuedAt: now.toISOString(),
      paidAt: (params.status ?? "paid") === "paid" ? now.toISOString() : null,
      periodStart: now.toISOString(),
      periodEnd: periodEnd.toISOString(),
    };

    list.unshift(invoice);
    await PlatformConfigService.set(INVOICE_CONFIG_KEY, list);

    await AuditService.log({
      organizationId: params.orgId,
      action: "billing.invoice_generated",
      entityType: "organization",
      entityId: params.orgId,
      metadata: { invoiceNumber, totalAmount },
    });

    return invoice;
  }

  static async issueCreditNote(invoiceId: string, reason?: string): Promise<TaxInvoice | null> {
    const list = await PlatformConfigService.get<TaxInvoice[]>(INVOICE_CONFIG_KEY, []);
    const original = list.find((i) => i.id === invoiceId);
    if (!original) return null;

    const seq = String(list.length + 1).padStart(4, "0");
    const year = new Date().getFullYear();
    const invoiceNumber = `CN-${year}-${seq}`;
    const now = new Date();

    const creditNote: TaxInvoice = {
      id: `cn_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      invoiceNumber,
      orgId: original.orgId,
      orgName: original.orgName,
      plan: original.plan,
      amount: -original.amount,
      taxRate: original.taxRate,
      taxAmount: -original.taxAmount,
      totalAmount: -original.totalAmount,
      sacCode: original.sacCode,
      gstin: original.gstin,
      status: "paid",
      type: "credit_note",
      originalInvoiceId: original.id,
      issuedAt: now.toISOString(),
      paidAt: now.toISOString(),
      periodStart: original.periodStart,
      periodEnd: original.periodEnd,
    };

    original.status = "refunded";
    list.unshift(creditNote);
    await PlatformConfigService.set(INVOICE_CONFIG_KEY, list);

    await AuditService.log({
      organizationId: original.orgId,
      action: "billing.credit_note_issued",
      entityType: "organization",
      entityId: original.orgId,
      metadata: {
        originalInvoiceNumber: original.invoiceNumber,
        creditNoteNumber: invoiceNumber,
        amount: original.totalAmount,
        reason: reason || "refund",
      },
    });

    return creditNote;
  }

  static async voidInvoice(id: string): Promise<TaxInvoice | null> {
    const list = await PlatformConfigService.get<TaxInvoice[]>(INVOICE_CONFIG_KEY, []);
    const inv = list.find((i) => i.id === id);
    if (!inv) return null;

    inv.status = "void";
    await PlatformConfigService.set(INVOICE_CONFIG_KEY, list);

    await AuditService.log({
      organizationId: inv.orgId,
      action: "billing.invoice_voided",
      entityType: "organization",
      entityId: inv.orgId,
      metadata: { invoiceNumber: inv.invoiceNumber },
    });

    return inv;
  }
}

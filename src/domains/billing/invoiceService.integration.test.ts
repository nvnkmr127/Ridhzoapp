import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { db } from "@/db";
import { organizations, taxInvoices } from "@/db/schema";
import { eq } from "drizzle-orm";
import { InvoiceService, financialYear } from "./invoiceService";

vi.mock("@/domains/audit/service", () => ({ AuditService: { log: vi.fn().mockResolvedValue(undefined) } }));
vi.mock("@/lib/mail/mailer", () => ({ sendEmail: vi.fn().mockResolvedValue(undefined), appUrl: (p: string) => `https://app.test${p}` }));

// Real transactions, advisory lock, numeric columns — only against a local dev DB.
const RUN = !!process.env.DATABASE_URL?.includes("localhost");
const orgId = crypto.randomUUID();
const stamp = Date.now();

describe.runIf(RUN)("InvoiceService (tax_invoices table)", () => {
  beforeAll(async () => {
    await db.insert(organizations).values({ id: orgId, name: `Inv ${stamp}`, slug: `inv-${stamp}`, billingName: "Acme Pvt Ltd", gstin: "29ABCDE1234F1Z5", billingEmail: "acc@acme.in" });
  });
  beforeEach(() => vi.clearAllMocks());
  afterAll(async () => {
    await db.delete(taxInvoices).where(eq(taxInvoices.orgId, orgId));
    await db.delete(organizations).where(eq(organizations.id, orgId));
  });

  it("computes 18% GST, numbers consecutively, and round-trips money/dates", async () => {
    const a = await InvoiceService.generateInvoice({ orgId, plan: "pro", amount: 1000, gstin: "29ABCDE1234F1Z5" });
    const b = await InvoiceService.generateInvoice({ orgId, plan: "pro", amount: 1000 });
    expect(a).toMatchObject({ amount: 1000, taxRate: 18, taxAmount: 180, totalAmount: 1180, sacCode: "998313", status: "paid", buyerName: "Acme Pvt Ltd" });
    const prefix = `INV/${financialYear(new Date())}/`;
    expect(Number(b.invoiceNumber.slice(prefix.length))).toBe(Number(a.invoiceNumber.slice(prefix.length)) + 1);
    expect(await InvoiceService.getInvoice(a.id)).toMatchObject(a);
  });

  it("never hands out the same number to concurrent issues", async () => {
    const many = await Promise.all(Array.from({ length: 5 }, () => InvoiceService.generateInvoice({ orgId, plan: "pro", amount: 10 })));
    expect(new Set(many.map((i) => i.invoiceNumber)).size).toBe(5);
  });

  it("a webhook retry for the same payment returns the same invoice and emails once", async () => {
    const { sendEmail } = await import("@/lib/mail/mailer");
    const paymentId = `pay_${stamp}`;
    const [x, y] = await Promise.all([
      InvoiceService.generateInvoice({ orgId, plan: "starter", total: 1180, paymentId }),
      InvoiceService.generateInvoice({ orgId, plan: "starter", total: 1180, paymentId }),
    ]);
    expect(x.id).toBe(y.id);
    expect(x.gstin).toBe("29ABCDE1234F1Z5"); // org's saved GSTIN
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("issues one credit note per invoice and marks the original refunded", async () => {
    const inv = await InvoiceService.generateInvoice({ orgId, plan: "business", amount: 5000 });
    const cn = await InvoiceService.issueCreditNote(inv.id, "double charge");
    expect(cn).toMatchObject({ type: "credit_note", amount: -5000, taxAmount: -900, totalAmount: -5900, originalInvoiceId: inv.id });
    expect(cn?.invoiceNumber).toMatch(/^CN\/\d{4}-\d{2}\/\d{4}$/);
    expect((await InvoiceService.getInvoice(inv.id))?.status).toBe("refunded");
    await expect(InvoiceService.issueCreditNote(inv.id)).rejects.toThrow(/already issued/);
  });

  it("voids only an issued invoice", async () => {
    const issued = await InvoiceService.generateInvoice({ orgId, plan: "pro", amount: 100, status: "issued" });
    expect((await InvoiceService.voidInvoice(issued.id))?.status).toBe("void");
    const paid = await InvoiceService.generateInvoice({ orgId, plan: "pro", amount: 100 });
    await expect(InvoiceService.voidInvoice(paid.id)).rejects.toThrow(/credit note/);
    expect(await InvoiceService.voidInvoice("inv_missing")).toBeNull();
  });

  it("lists an org's invoices newest first", async () => {
    const list = await InvoiceService.listForOrg(orgId);
    expect(list.length).toBeGreaterThan(5);
    expect(list.every((i) => i.orgId === orgId)).toBe(true);
    expect(list.map((i) => i.issuedAt)).toEqual([...list.map((i) => i.issuedAt)].sort().reverse());
  });
});

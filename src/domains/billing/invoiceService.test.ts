import { describe, it, expect, vi, beforeEach } from "vitest";
import { InvoiceService, financialYear, nextNumber, splitTax } from "./invoiceService";
import { PlatformConfigService } from "@/domains/platform/configService";
import { db } from "@/db";

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(),
  },
}));

vi.mock("@/domains/platform/configService", () => {
  // update() = locked get → modify → set; modelled on the get/set mocks so tests assert on set().
  const PlatformConfigService: Record<string, any> = { get: vi.fn(), set: vi.fn() };
  PlatformConfigService.update = vi.fn(async (key: string, dflt: unknown, fn: (v: any) => any) => {
    const next = await fn(structuredClone((await PlatformConfigService.get(key, dflt)) ?? dflt));
    await PlatformConfigService.set(key, next);
    return next;
  });
  return { PlatformConfigService };
});

vi.mock("@/domains/audit/service", () => ({
  AuditService: {
    log: vi.fn().mockResolvedValue(undefined),
  },
}));

describe("InvoiceService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calculates 18% GST and sequential invoice number correctly", async () => {
    const mockStore: any[] = [];
    vi.mocked(PlatformConfigService.get).mockImplementation(async () => mockStore);
    vi.mocked(PlatformConfigService.set).mockImplementation(async (_, val) => {
      mockStore.length = 0;
      mockStore.push(...(val as any[]));
      return val as any;
    });

    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ id: "org_1", name: "Acme Corp" }]),
        }),
      }),
    } as any);

    const inv = await InvoiceService.generateInvoice({
      orgId: "org_1",
      plan: "pro",
      amount: 1000,
      gstin: "29ABCDE1234F1Z5",
    });

    expect(inv.invoiceNumber).toBe(`INV/${financialYear(new Date())}/0001`);
    expect(inv.amount).toBe(1000);
    expect(inv.taxRate).toBe(18);
    expect(inv.taxAmount).toBe(180);
    expect(inv.totalAmount).toBe(1180);
    expect(inv.sacCode).toBe("998313");
    expect(inv.gstin).toBe("29ABCDE1234F1Z5");
    expect(inv.status).toBe("paid");
  });

  it("voids an issued invoice", async () => {
    const mockInvoice = {
      id: "inv_123",
      invoiceNumber: "INV/2026-27/0001",
      orgId: "org_1",
      orgName: "Acme Corp",
      plan: "pro",
      amount: 1000,
      taxRate: 18,
      taxAmount: 180,
      totalAmount: 1180,
      sacCode: "998313",
      status: "issued" as const,
      issuedAt: new Date().toISOString(),
      periodStart: new Date().toISOString(),
      periodEnd: new Date().toISOString(),
    };

    vi.mocked(PlatformConfigService.get).mockResolvedValue([mockInvoice] as any);
    const voided = await InvoiceService.voidInvoice("inv_123");

    expect(voided).not.toBeNull();
    expect(voided?.status).toBe("void");
    expect(PlatformConfigService.set).toHaveBeenCalled();
  });

  it("issues a GST credit note and marks original invoice refunded", async () => {
    const mockInvoice = {
      id: "inv_456",
      invoiceNumber: "INV-2026-0002",
      orgId: "org_2",
      orgName: "Beta Corp",
      plan: "business",
      amount: 5000,
      taxRate: 18,
      taxAmount: 900,
      totalAmount: 5900,
      sacCode: "998313",
      status: "paid" as const,
      type: "invoice" as const,
      issuedAt: new Date().toISOString(),
      periodStart: new Date().toISOString(),
      periodEnd: new Date().toISOString(),
    };

    const store = [mockInvoice];
    vi.mocked(PlatformConfigService.get).mockImplementation(async () => store as any);
    vi.mocked(PlatformConfigService.set).mockImplementation(async (_, val) => {
      store.length = 0;
      store.push(...(val as any[]));
      return val as any;
    });

    const cn = await InvoiceService.issueCreditNote("inv_456", "Customer double charge");

    expect(cn).not.toBeNull();
    expect(cn?.type).toBe("credit_note");
    expect(cn?.invoiceNumber).toMatch(/^CN\/\d{4}-\d{2}\/\d{4}$/);
    expect(cn?.amount).toBe(-5000);
    expect(cn?.taxAmount).toBe(-900);
    expect(cn?.totalAmount).toBe(-5900);
    expect(cn?.originalInvoiceId).toBe("inv_456");

    // Original invoice should now be marked refunded
    expect(store.find((i) => i.id === "inv_456")?.status).toBe("refunded");

    // …and can't be credited a second time.
    await expect(InvoiceService.issueCreditNote("inv_456")).rejects.toThrow(/already issued/);
  });

  it("refuses to void a paid invoice (needs a credit note)", async () => {
    vi.mocked(PlatformConfigService.get).mockResolvedValue([{ id: "inv_p", invoiceNumber: "INV/2026-27/0003", orgId: "o", status: "paid", type: "invoice" }] as any);
    await expect(InvoiceService.voidInvoice("inv_p")).rejects.toThrow(/credit note/);
  });
});

describe("GST helpers", () => {
  it("financial year runs April to March", () => {
    expect(financialYear(new Date("2026-04-01T00:00:00"))).toBe("2026-27");
    expect(financialYear(new Date("2027-03-31T00:00:00"))).toBe("2026-27");
    expect(financialYear(new Date("2026-03-31T00:00:00"))).toBe("2025-26");
  });

  it("numbers each series independently and consecutively per FY", () => {
    const list = [
      { invoiceNumber: "INV/2026-27/0007" }, { invoiceNumber: "CN/2026-27/0002" }, { invoiceNumber: "INV/2025-26/0099" },
    ] as any;
    expect(nextNumber(list, "INV", "2026-27")).toBe("INV/2026-27/0008");
    expect(nextNumber(list, "CN", "2026-27")).toBe("CN/2026-27/0003");
    expect(nextNumber(list, "INV", "2027-28")).toBe("INV/2027-28/0001");
  });

  it("splits intra-state as CGST+SGST and inter-state as IGST", () => {
    const prev = process.env.GST_SUPPLIER_STATE_CODE;
    process.env.GST_SUPPLIER_STATE_CODE = "29";
    expect(splitTax(1000, "29ABCDE1234F1Z5")).toMatchObject({ cgst: 90, sgst: 90, igst: 0, taxAmount: 180 });
    expect(splitTax(1000, "27ABCDE1234F1Z5")).toMatchObject({ cgst: 0, sgst: 0, igst: 180, taxAmount: 180 });
    expect(splitTax(1000, null)).toMatchObject({ cgst: 90, sgst: 90 }); // B2C: supplier's state
    process.env.GST_SUPPLIER_STATE_CODE = prev;
  });
});

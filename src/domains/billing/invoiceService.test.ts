import { describe, it, expect, vi, beforeEach } from "vitest";
import { InvoiceService } from "./invoiceService";
import { PlatformConfigService } from "@/domains/platform/configService";
import { db } from "@/db";

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(),
  },
}));

vi.mock("@/domains/platform/configService", () => ({
  PlatformConfigService: {
    get: vi.fn(),
    set: vi.fn(),
  },
}));

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

    const currentYear = new Date().getFullYear();
    expect(inv.invoiceNumber).toBe(`INV-${currentYear}-0001`);
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
      invoiceNumber: "INV-2026-0001",
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
    expect(cn?.invoiceNumber).toMatch(/^CN-\d{4}-/);
    expect(cn?.amount).toBe(-5000);
    expect(cn?.taxAmount).toBe(-900);
    expect(cn?.totalAmount).toBe(-5900);
    expect(cn?.originalInvoiceId).toBe("inv_456");

    // Original invoice should now be marked refunded
    expect(mockInvoice.status).toBe("refunded");
  });
});

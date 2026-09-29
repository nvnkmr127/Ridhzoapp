import { describe, it, expect } from "vitest";
import { financialYear, nextNumber, splitTax } from "./invoiceService";

// Service behaviour (numbering, credit notes, void, webhook idempotency) runs against Postgres in
// invoiceService.integration.test.ts.
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

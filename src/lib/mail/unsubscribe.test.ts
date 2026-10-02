import { describe, it, expect, beforeAll } from "vitest";
import { createHmac } from "crypto";
import { unsubscribeToken, verifyUnsubscribe, unsubscribeLabel } from "./unsubscribe";
import { invoicePdf } from "@/domains/billing/invoicePdf";

beforeAll(() => { process.env.NEXTAUTH_SECRET = "test-secret"; });

describe("unsubscribe links", () => {
  it("verifies its own token, case-insensitively on email", () => {
    const t = unsubscribeToken("A@x.com", "daily_summary");
    expect(verifyUnsubscribe("a@x.com", "daily_summary", t)).toBe(true);
  });
  it("rejects a different email, category, or a forged token", () => {
    const t = unsubscribeToken("a@x.com", "daily_summary");
    expect(verifyUnsubscribe("b@x.com", "daily_summary", t)).toBe(false);
    expect(verifyUnsubscribe("a@x.com", "newsletter", t)).toBe(false);
    expect(verifyUnsubscribe("a@x.com", "daily_summary", "forged")).toBe(false);
    expect(verifyUnsubscribe("a@x.com", "daily_summary", "")).toBe(false);
  });
  it("still accepts links signed the old way (already sitting in inboxes)", () => {
    const legacy = createHmac("sha256", "test-secret").update("a@x.com|newsletter").digest("base64url");
    expect(verifyUnsubscribe("a@x.com", "newsletter", legacy)).toBe(true);
  });
  it("labels unknown categories generically", () => {
    expect(unsubscribeLabel("nope")).toBe("emails like this");
  });
});

describe("invoice pdf", () => {
  it("renders a PDF, even with non-Latin buyer names", async () => {
    const bytes = await invoicePdf({
      id: "1", invoiceNumber: "INV/2026-27/0001", orgId: "o", orgName: "Acme", buyerName: "अक्मे Traders", plan: "starter", amount: 1000, taxRate: 18,
      taxAmount: 180, cgst: 90, sgst: 90, igst: 0, totalAmount: 1180, sacCode: "998313", gstin: "36ABCDE1234F1Z5", status: "paid", type: "invoice",
      issuedAt: "2026-09-30T00:00:00Z", periodStart: "2026-09-30T00:00:00Z", periodEnd: "2026-10-30T00:00:00Z", paidAt: "2026-09-30T00:00:00Z", paymentId: "pay_1",
    });
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-");
  });
});

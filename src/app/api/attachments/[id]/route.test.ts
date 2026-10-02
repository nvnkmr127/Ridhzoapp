import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";

// H11: even with R2_PUBLIC_URL set, files are streamed through the access-checked route, never redirected.
vi.stubEnv("R2_PUBLIC_URL", "https://pub.example.com");
const row = { id: "11111111-1111-4111-8111-111111111111", leadId: "l1", organizationId: "o1", fileUrl: "r2:attachments/o1/x.pdf", fileType: "application/pdf", fileName: "x.pdf" };
vi.mock("@/db", () => ({ db: { select: () => ({ from: () => ({ where: () => ({ limit: async () => [row] }) }) }) } }));
vi.mock("@/lib/rbac", () => ({ requireOrg: async () => ({ userId: "u1", organizationId: "o1" }) }));
vi.mock("@/lib/leads/access", () => ({ assertLeadAccess: async () => {} }));
vi.mock("@/lib/mobileAuth", () => ({ verifyAttachmentLink: () => false }));
vi.mock("@/lib/storage/attachments", () => ({
  INLINE_TYPES: new Set(["application/pdf"]),
  isStoredRef: () => true,
  openAttachment: async () => ({ stream: new Response("pdf-bytes").body!, size: 9 }),
}));

import { GET } from "./route";

describe("GET /api/attachments/[id]", () => {
  it("streams with hardening headers instead of redirecting to a public bucket", async () => {
    const res = await GET(new NextRequest(`http://x/api/attachments/${row.id}`), { params: Promise.resolve({ id: row.id }) });
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("content-security-policy")).toContain("sandbox");
    expect(await res.text()).toBe("pdf-bytes");
  });
});

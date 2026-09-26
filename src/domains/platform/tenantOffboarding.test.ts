import { describe, it, expect, vi, beforeEach } from "vitest";
import { PlatformService } from "./service";
import { db } from "@/db";

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(),
    transaction: vi.fn(),
  },
}));

vi.mock("@/lib/jobs/redis", () => ({
  redisConfigured: false,
}));

vi.mock("./configService", () => ({
  PlatformConfigService: {
    get: vi.fn().mockImplementation((key, fallback) => {
      if (key === "seat_overrides") return Promise.resolve({ org_1: 10, org_2: 5 });
      if (key === "tenant_credits") return Promise.resolve({ org_1: { aiCredits: 100 } });
      return Promise.resolve(fallback);
    }),
    set: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("@/domains/billing/invoiceService", () => ({
  InvoiceService: {
    listInvoices: vi.fn().mockResolvedValue([
      { id: "inv_1", orgId: "org_1", invoiceNumber: "INV-001", total: 9999 },
      { id: "inv_2", orgId: "org_other", invoiceNumber: "INV-002", total: 4999 },
    ]),
    listForOrg: vi.fn().mockImplementation(async (orgId: string) =>
      [
        { id: "inv_1", orgId: "org_1", invoiceNumber: "INV-001", total: 9999 },
        { id: "inv_2", orgId: "org_other", invoiceNumber: "INV-002", total: 4999 },
      ].filter((i) => i.orgId === orgId),
    ),
  },
}));

vi.mock("./supportService", () => ({
  SupportTicketService: {
    listTickets: vi.fn().mockResolvedValue([
      { id: "ticket_1", orgId: "org_1", subject: "Webhook issue", status: "resolved" },
      { id: "ticket_2", orgId: "org_other", subject: "General question", status: "open" },
    ]),
  },
}));

vi.mock("@/domains/audit/service", () => ({
  AuditService: {
    log: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("./opsAlertService", () => ({
  OpsAlertService: {
    dispatchAlert: vi.fn().mockResolvedValue(undefined),
  },
}));

describe("Tenant Offboarding & Data Erasure (GDPR / DPDP)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("PlatformService.exportTenantDossier", () => {
    it("returns null when organization is not found", async () => {
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      } as any);

      const dossier = await PlatformService.exportTenantDossier("non_existent_org");
      expect(dossier).toBeNull();
    });

    it("aggregates all tenant records into structured JSON compliance dossier", async () => {
      const mockOrg = {
        id: "org_1",
        name: "Acme Corp",
        slug: "acme-corp",
        plan: "business",
        createdAt: new Date(),
      };

      // Row queries are awaited directly or capped with .limit(); both resolve to the same rows.
      const rows = (r: unknown[]) => Object.assign(Promise.resolve(r), { limit: () => Promise.resolve(r) });
      let callCount = 0;
      vi.mocked(db.select).mockImplementation(() => {
        callCount++;
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockImplementation(() => {
              if (callCount === 1) {
                // org select
                return { limit: vi.fn().mockResolvedValue([mockOrg]) };
              }
              if (callCount === 2) {
                // users select
                return rows([
                  { id: "u1", email: "admin@acme.com", firstName: "Alice" },
                ]);
              }
              if (callCount === 3) {
                // leads select
                return rows([
                  { id: "lead_1", name: "Bob Buyer", email: "bob@client.com" },
                ]);
              }
              if (callCount === 4) {
                // apiKeys select
                return rows([
                  { id: "key_1", name: "Production API", prefix: "rdz_live" },
                ]);
              }
              // activities & follow-ups
              return rows([{ id: "act_1", type: "call" }]);
            }),
          }),
        } as any;
      });

      // mock getTenantAuditLogs
      vi.spyOn(PlatformService, "getTenantAuditLogs").mockResolvedValue([
        { id: "log_1", action: "user.login", createdAt: "2026-09-19T00:00:00Z" } as any,
      ]);

      const dossier = await PlatformService.exportTenantDossier("org_1");

      expect(dossier).not.toBeNull();
      expect(dossier?.standard).toContain("DPDP 2023 / GDPR Article 20");
      expect(dossier?.organization.name).toBe("Acme Corp");
      expect(dossier?.users).toHaveLength(1);
      expect(dossier?.leads).toHaveLength(1);
      expect(dossier?.invoices).toHaveLength(1);
      expect(dossier?.invoices[0]).toEqual(expect.objectContaining({ orgId: "org_1" }));
      expect(dossier?.supportTickets).toHaveLength(1);
      expect(dossier?.supportTickets[0]).toEqual(expect.objectContaining({ orgId: "org_1" }));
    });
  });

  describe("PlatformService.hardDeleteTenant", () => {
    it("rejects deletion if organization does not exist", async () => {
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      } as any);

      const res = await PlatformService.hardDeleteTenant("missing_org", "missing-org");
      expect(res.success).toBe(false);
      expect(res.message).toBe("Organization not found.");
    });

    it("rejects deletion when confirmation string does not match slug or name", async () => {
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              { id: "org_1", name: "Acme Corp", slug: "acme-corp" },
            ]),
          }),
        }),
      } as any);

      const res = await PlatformService.hardDeleteTenant("org_1", "wrong-slug");
      expect(res.success).toBe(false);
      expect(res.message).toContain("Confirmation mismatch");
    });

    it("successfully runs transactional hard-delete when slug matches", async () => {
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              { id: "org_1", name: "Acme Corp", slug: "acme-corp" },
            ]),
          }),
        }),
      } as any);

      const mockTx = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
          }),
        }),
        delete: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      };

      vi.mocked(db.transaction).mockImplementation(async (cb: any) => {
        return cb(mockTx);
      });

      const res = await PlatformService.hardDeleteTenant("org_1", "acme-corp", "admin-super-id");
      expect(res.success).toBe(true);
      expect(db.transaction).toHaveBeenCalled();
    });
  });
});

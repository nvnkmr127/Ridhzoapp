import { describe, it, expect, vi, beforeEach } from "vitest";
import { LeadStatusService } from "./leadStatusService";
import { db } from "@/db";

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(),
    update: vi.fn(),
    insert: vi.fn(),
  },
}));

vi.mock("@/lib/events/emitter", () => ({
  eventBus: {
    emit: vi.fn(),
  },
}));

describe("LeadStatusService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("isValidTransition", () => {
    it("should allow same-status transition", () => {
      expect(LeadStatusService.isValidTransition("new", "new")).toBe(true);
    });

    it("should allow valid state transitions", () => {
      expect(LeadStatusService.isValidTransition("new", "active")).toBe(true);
      expect(LeadStatusService.isValidTransition("active", "won")).toBe(true);
      expect(LeadStatusService.isValidTransition("won", "active")).toBe(true);
    });

    it("should reject invalid state transitions", () => {
      expect(LeadStatusService.isValidTransition("new", "won")).toBe(false);
    });
  });

  describe("changeStatus", () => {
    it("should update lead status, record status history, and emit event", async () => {
      const mockLead = { status: "new", organizationId: "org-1" };
      const mockUpdatedLead = { id: "lead-1", status: "active", organizationId: "org-1" };

      const mockFromSelect = vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([mockLead]),
        }),
      });
      (db.select as any).mockReturnValue({ from: mockFromSelect });

      const mockWhereUpdate = vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([mockUpdatedLead]),
      });
      const mockSetUpdate = vi.fn().mockReturnValue({ where: mockWhereUpdate });
      (db.update as any).mockReturnValue({ set: mockSetUpdate });

      const mockValuesInsert = vi.fn().mockResolvedValue(undefined);
      (db.insert as any).mockReturnValue({ values: mockValuesInsert });

      const result = await LeadStatusService.changeStatus("lead-1", "active", "user-1", "org-1");

      expect(result).toEqual(mockUpdatedLead);
      expect(db.update).toHaveBeenCalled();
      expect(db.insert).toHaveBeenCalled();
    });

    it("should throw error if transition is invalid", async () => {
      const mockLead = { status: "new", organizationId: "org-1" };

      const mockFromSelect = vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([mockLead]),
        }),
      });
      (db.select as any).mockReturnValue({ from: mockFromSelect });

      await expect(
        LeadStatusService.changeStatus("lead-1", "won", "user-1", "org-1")
      ).rejects.toThrow("Invalid status transition from 'new' to 'won'");
    });
  });
});

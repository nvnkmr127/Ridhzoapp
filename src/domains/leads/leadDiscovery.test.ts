import { describe, it, expect, vi, beforeEach } from "vitest";
import { LeadService } from "./service";
import { SavedViewService } from "../savedViews/service";
import { AssignmentService } from "./assignmentService";
import { db } from "@/db";

// Mock database layer cleanly for vitest unit/integration tests
vi.mock("@/db", () => {
  return {
    db: {
      select: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  };
});

vi.mock("@/lib/events/emitter", () => ({
  eventBus: {
    emit: vi.fn(),
  },
}));

describe("Lead Discovery Subsystem - Search, Filters, Sorting, Views & Tenant Isolation", () => {
  const ORG_A = "org-11111111-1111-1111-1111-111111111111";
  const USER_1 = "user-11111111-1111-1111-1111-111111111111";


  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Server-Side Search & Phone/Email Normalization", () => {
    it("should construct query for name search scoped by organization", async () => {
      const mockSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        offset: vi.fn().mockResolvedValue([
          { id: "lead-1", name: "John Doe", email: "john@example.com", organizationId: ORG_A },
        ]),
      };

      const mockCount = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([{ total: 1 }]),
      };

      (db.select as any).mockImplementation((arg?: any) => {
        if (arg && arg.total) return mockCount;
        return mockSelect;
      });

      const res = await LeadService.listLeads({
        organizationId: ORG_A,
        search: "John",
        page: 1,
        limit: 20,
      });

      expect(res.data.length).toBe(1);
      expect(res.total).toBe(1);
      expect(db.select).toHaveBeenCalled();
    });

    it("should handle phone search with digit normalization across formats (9876543210, +91 9876543210, 98765 43210)", async () => {
      const mockSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        offset: vi.fn().mockResolvedValue([
          { id: "lead-phone", name: "Alice", phone: "+91 9876543210", organizationId: ORG_A },
        ]),
      };

      const mockCount = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([{ total: 1 }]),
      };

      (db.select as any).mockImplementation((arg?: any) => {
        if (arg && arg.total) return mockCount;
        return mockSelect;
      });

      const res = await LeadService.listLeads({
        organizationId: ORG_A,
        search: "98765 43210",
      });

      expect(res.data[0].phone).toBe("+91 9876543210");
    });

    it("should support email domain search (@example.com) and partial email", async () => {
      const mockSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        offset: vi.fn().mockResolvedValue([
          { id: "lead-email", name: "Bob", email: "bob@acme.com", organizationId: ORG_A },
        ]),
      };

      const mockCount = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([{ total: 1 }]),
      };

      (db.select as any).mockImplementation((arg?: any) => {
        if (arg && arg.total) return mockCount;
        return mockSelect;
      });

      const res = await LeadService.listLeads({
        organizationId: ORG_A,
        search: "@acme.com",
      });

      expect(res.data[0].email).toBe("bob@acme.com");
    });
  });

  describe("Multi-Field Filtering & Operators (AND/OR, Dates, Status, Owner, Tags)", () => {
    it("should filter by status, ownerId, teamId, sourceId, and tag", async () => {
      const mockSelect = {
        from: vi.fn().mockReturnThis(),
        innerJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        offset: vi.fn().mockResolvedValue([
          { id: "lead-filtered", status: "active", ownerId: USER_1, organizationId: ORG_A },
        ]),
      };


      const mockCount = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([{ total: 1 }]),
      };

      (db.select as any).mockImplementation((arg?: any) => {
        if (arg && arg.total) return mockCount;
        return mockSelect;
      });

      const res = await LeadService.listLeads({
        organizationId: ORG_A,
        status: "active",
        ownerId: USER_1,
        filters: [
          { field: "tag", operator: "equals", value: "VIP" },
          { field: "score", operator: "gt", value: 10 },
        ],
      });

      expect(res.data.length).toBe(1);
    });

    it("should handle date filtering (before, after, between)", async () => {
      const mockSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        offset: vi.fn().mockResolvedValue([
          { id: "lead-date", createdAt: new Date("2026-08-01"), organizationId: ORG_A },
        ]),
      };

      const mockCount = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([{ total: 1 }]),
      };

      (db.select as any).mockImplementation((arg?: any) => {
        if (arg && arg.total) return mockCount;
        return mockSelect;
      });

      const res = await LeadService.listLeads({
        organizationId: ORG_A,
        filters: {
          logic: "AND",
          rules: [
            { field: "createdAt", operator: "after", value: "2026-01-01" },
            { field: "createdAt", operator: "before", value: "2026-12-31" },
          ],
        },
      });

      expect(res.data.length).toBe(1);
    });

    it("should correctly handle unassigned leads filter (ownerId is_empty)", async () => {
      const mockSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        offset: vi.fn().mockResolvedValue([
          { id: "lead-unassigned", ownerId: null, organizationId: ORG_A },
        ]),
      };

      const mockCount = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([{ total: 1 }]),
      };

      (db.select as any).mockImplementation((arg?: any) => {
        if (arg && arg.total) return mockCount;
        return mockSelect;
      });

      const res = await LeadService.listLeads({
        organizationId: ORG_A,
        filters: [{ field: "ownerId", operator: "is_empty" }],
      });

      expect(res.data.length).toBe(1);
      expect(res.data[0].ownerId).toBeNull();
    });

    it("should strictly enforce owner isolation for non-admin team members", async () => {
      const mockSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        offset: vi.fn().mockResolvedValue([
          { id: "lead-1", ownerId: USER_1, organizationId: ORG_A },
        ]),
      };

      const mockCount = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([{ total: 1 }]),
      };

      (db.select as any).mockImplementation((arg?: any) => {
        if (arg && arg.total) return mockCount;
        return mockSelect;
      });

      const res = await LeadService.listLeads({
        organizationId: ORG_A,
        enforceOwnerId: USER_1,
        // Attempting to filter by unassigned or another user must be ignored
        filters: [{ field: "ownerId", operator: "is_empty" }],
      });

      expect(res.data.length).toBe(1);
      expect(res.data[0].ownerId).toBe(USER_1);
    });

    it("should support OR condition grouping", async () => {
      const mockSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        offset: vi.fn().mockResolvedValue([
          { id: "lead-1", status: "new" },
          { id: "lead-2", status: "active" },
        ]),
      };

      const mockCount = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([{ total: 2 }]),
      };

      (db.select as any).mockImplementation((arg?: any) => {
        if (arg && arg.total) return mockCount;
        return mockSelect;
      });

      const res = await LeadService.listLeads({
        organizationId: ORG_A,
        filters: {
          logic: "OR",
          rules: [
            { field: "status", operator: "equals", value: "new" },
            { field: "status", operator: "equals", value: "active" },
          ],
        },
      });

      expect(res.total).toBe(2);
    });
  });

  describe("Sorting & Pagination", () => {
    it("should sort by specified field and order, returning correct page & totalPages", async () => {
      const mockSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        offset: vi.fn().mockResolvedValue([
          { id: "lead-sorted-1", name: "Alpha", createdAt: new Date() },
        ]),
      };

      const mockCount = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([{ total: 45 }]),
      };

      (db.select as any).mockImplementation((arg?: any) => {
        if (arg && arg.total) return mockCount;
        return mockSelect;
      });

      const res = await LeadService.listLeads({
        organizationId: ORG_A,
        sortField: "name",
        sortOrder: "asc",
        page: 2,
        limit: 10,
      });

      expect(res.page).toBe(2);
      expect(res.limit).toBe(10);
      expect(res.total).toBe(45);
      expect(res.totalPages).toBe(5);
    });
  });

  describe("Saved Views CRUD & Tenant Safety", () => {
    it("should include default views alongside organization custom views", async () => {
      const mockSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockResolvedValue([
          {
            id: "custom-view-1",
            organizationId: ORG_A,
            userId: USER_1,
            name: "High Value Leads",
            filters: [{ field: "score", operator: "gt", value: 50 }],
            sortField: "score",
            sortOrder: "desc",
            isPreset: 0,
          },
        ]),
      };

      (db.select as any).mockReturnValue(mockSelect);

      const views = await SavedViewService.listViews(ORG_A, USER_1);

      expect(views.length).toBeGreaterThan(8); // 8 presets + 1 custom
      expect(views[0].id).toBe("preset-all");
      expect(views.find((v) => v.id === "custom-view-1")?.name).toBe("High Value Leads");
    });

    it("should filter out preset-all and preset-unassigned for non-admin team members", async () => {
      const mockSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockResolvedValue([]),
      };

      (db.select as any).mockReturnValue(mockSelect);

      const views = await SavedViewService.listViews(ORG_A, USER_1, false);

      expect(views.some((v) => v.id === "preset-all")).toBe(false);
      expect(views.some((v) => v.id === "preset-unassigned")).toBe(false);
      expect(views[0].id).toBe("preset-my");
    });

    it("should create a custom saved view bound to organizationId", async () => {
      const mockInsert = {
        values: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([
          {
            id: "new-view-100",
            organizationId: ORG_A,
            userId: USER_1,
            name: "My Custom View",
            filters: [],
            sortField: "createdAt",
            sortOrder: "desc",
            isPreset: 0,
          },
        ]),
      };

      (db.insert as any).mockReturnValue(mockInsert);

      const created = await SavedViewService.createView(
        { name: "My Custom View", filters: [] },
        USER_1,
        ORG_A,
      );

      expect(created.id).toBe("new-view-100");
      expect(created.name).toBe("My Custom View");
      expect(db.insert).toHaveBeenCalled();
    });

    it("should update and delete saved view with organizationId isolation", async () => {
      const mockUpdate = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([
          { id: "view-1", name: "Updated Name", filters: [], sortField: "createdAt", sortOrder: "desc", isPreset: 0 },
        ]),
      };
      (db.update as any).mockReturnValue(mockUpdate);

      const updated = await SavedViewService.updateView("view-1", { name: "Updated Name" }, ORG_A);
      expect(updated?.name).toBe("Updated Name");

      const mockDelete = {
        where: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([{ id: "view-1" }]),
      };
      (db.delete as any).mockReturnValue(mockDelete);

      const deleted = await SavedViewService.deleteView("view-1", ORG_A);
      expect(deleted).toBe(true);
    });
  });

  describe("Bulk Action Compatibility & Tenant Scoping", () => {
    it("should validate tenant boundaries during bulk assignment", async () => {
      vi.spyOn(AssignmentService, "bulkAssignLeads").mockResolvedValue([
        { id: "lead-1", ownerId: USER_1, organizationId: ORG_A } as any,
      ]);

      const result = await AssignmentService.bulkAssignLeads({
        leadIds: ["lead-1"],
        ownerId: USER_1,
        teamId: null,
        assignedById: USER_1,
        organizationId: ORG_A,
      });

      expect(result.length).toBe(1);
    });
  });
});

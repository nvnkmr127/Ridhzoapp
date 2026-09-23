import { db } from "@/db";
import { savedViews } from "@/db/schema";
import { eq, and, or, isNull, desc } from "drizzle-orm";

export type FilterRule = {
  field: string;
  operator: "equals" | "not_equals" | "contains" | "does_not_contain" | "is_empty" | "is_not_empty" | "before" | "after" | "between" | "gt" | "lt";
  value?: string | number | boolean | (string | number)[];
};

export type FilterGroup = {
  logic: "AND" | "OR";
  rules: FilterRule[];
};

export type SavedViewData = {
  id: string;
  name: string;
  filters: FilterGroup | FilterRule[];
  sortField: string;
  sortOrder: "asc" | "desc";
  isPreset: boolean;
  userId?: string | null;
};

export const DEFAULT_LEAD_VIEWS: SavedViewData[] = [
  {
    id: "preset-all",
    name: "All Leads",
    filters: [],
    sortField: "createdAt",
    sortOrder: "desc",
    isPreset: true,
  },
  {
    id: "preset-my",
    name: "My Leads",
    filters: [{ field: "ownerId", operator: "equals", value: "me" }],
    sortField: "createdAt",
    sortOrder: "desc",
    isPreset: true,
  },
  {
    id: "preset-unassigned",
    name: "Unassigned Leads",
    filters: [{ field: "ownerId", operator: "is_empty" }],
    sortField: "createdAt",
    sortOrder: "desc",
    isPreset: true,
  },
  {
    id: "preset-new",
    name: "New Leads",
    filters: [{ field: "status", operator: "equals", value: "new" }],
    sortField: "createdAt",
    sortOrder: "desc",
    isPreset: true,
  },
  {
    id: "preset-active",
    name: "Active Leads",
    filters: [{ field: "status", operator: "equals", value: "active" }],
    sortField: "createdAt",
    sortOrder: "desc",
    isPreset: true,
  },
  {
    id: "preset-won",
    name: "Won Leads",
    filters: [{ field: "status", operator: "equals", value: "won" }],
    sortField: "createdAt",
    sortOrder: "desc",
    isPreset: true,
  },
  {
    id: "preset-lost",
    name: "Lost Leads",
    filters: [{ field: "status", operator: "equals", value: "lost" }],
    sortField: "createdAt",
    sortOrder: "desc",
    isPreset: true,
  },
  {
    id: "preset-overdue",
    name: "Overdue Follow-ups",
    filters: [{ field: "nextFollowUpAt", operator: "before", value: "now" }],
    sortField: "nextFollowUpAt",
    sortOrder: "asc",
    isPreset: true,
  },
];

export class SavedViewService {
  static async listViews(organizationId: string, userId?: string, isAdmin: boolean = true): Promise<SavedViewData[]> {
    const customRows = await db.select().from(savedViews)
      .where(
        and(
          eq(savedViews.organizationId, organizationId),
          userId ? or(eq(savedViews.userId, userId), isNull(savedViews.userId)) : undefined,
        )
      )
      .orderBy(desc(savedViews.createdAt));

    const customViews: SavedViewData[] = customRows.map((row) => ({
      id: row.id,
      name: row.name,
      filters: (row.filters as FilterGroup | FilterRule[]) || [],
      sortField: row.sortField || "createdAt",
      sortOrder: (row.sortOrder as "asc" | "desc") || "desc",
      isPreset: Boolean(row.isPreset),
      userId: row.userId,
    }));

    const presets = isAdmin
      ? DEFAULT_LEAD_VIEWS
      : DEFAULT_LEAD_VIEWS.filter((v) => v.id !== "preset-all" && v.id !== "preset-unassigned");

    return [...presets, ...customViews];
  }

  static async getViewById(id: string, organizationId: string): Promise<SavedViewData | null> {
    const preset = DEFAULT_LEAD_VIEWS.find((v) => v.id === id);
    if (preset) return preset;

    const [row] = await db.select().from(savedViews)
      .where(and(eq(savedViews.id, id), eq(savedViews.organizationId, organizationId)))
      .limit(1);

    if (!row) return null;

    return {
      id: row.id,
      name: row.name,
      filters: (row.filters as FilterGroup | FilterRule[]) || [],
      sortField: row.sortField || "createdAt",
      sortOrder: (row.sortOrder as "asc" | "desc") || "desc",
      isPreset: Boolean(row.isPreset),
      userId: row.userId,
    };
  }

  static async createView(
    data: { name: string; filters: FilterGroup | FilterRule[]; sortField?: string; sortOrder?: "asc" | "desc" },
    userId: string,
    organizationId: string,
  ): Promise<SavedViewData> {
    const [row] = await db.insert(savedViews).values({
      organizationId,
      userId,
      name: data.name,
      filters: data.filters,
      sortField: data.sortField || "createdAt",
      sortOrder: data.sortOrder || "desc",
      isPreset: 0,
    }).returning();

    return {
      id: row.id,
      name: row.name,
      filters: (row.filters as FilterGroup | FilterRule[]) || [],
      sortField: row.sortField || "createdAt",
      sortOrder: (row.sortOrder as "asc" | "desc") || "desc",
      isPreset: false,
      userId: row.userId,
    };
  }

  static async updateView(
    id: string,
    data: Partial<{ name: string; filters: FilterGroup | FilterRule[]; sortField: string; sortOrder: "asc" | "desc" }>,
    organizationId: string,
  ): Promise<SavedViewData | null> {
    const [row] = await db.update(savedViews)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(savedViews.id, id), eq(savedViews.organizationId, organizationId)))
      .returning();

    if (!row) return null;

    return {
      id: row.id,
      name: row.name,
      filters: (row.filters as FilterGroup | FilterRule[]) || [],
      sortField: row.sortField || "createdAt",
      sortOrder: (row.sortOrder as "asc" | "desc") || "desc",
      isPreset: false,
      userId: row.userId,
    };
  }

  static async deleteView(id: string, organizationId: string): Promise<boolean> {
    const [deleted] = await db.delete(savedViews)
      .where(and(eq(savedViews.id, id), eq(savedViews.organizationId, organizationId)))
      .returning();

    return Boolean(deleted);
  }
}

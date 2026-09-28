import { describe, expect, it, vi } from "vitest";
import { SmartSegmentationService } from "./smartSegmentationService";
import { db } from "@/db";

// Counting happens in Postgres (count(*) FILTER per segment); this covers the mapping and scoping.
const where = vi.fn().mockResolvedValue([{ hot_leads: 1, high_value_at_risk: 2, unassigned_new: 3, stale_high_priority: 0 }]);
vi.mock("@/db", () => ({ db: { select: vi.fn(() => ({ from: vi.fn(() => ({ where })) })) } }));
vi.mock("./customStatusSchemaService", () => ({
  CustomStatusSchemaService: {
    getStatusKeysByCategory: vi.fn().mockResolvedValue({ open: ["new"], in_progress: ["active"], won: [], lost: [], unqualified: [] }),
  },
}));

describe("SmartSegmentationService", () => {
  it("returns one count per segment from a single aggregate query", async () => {
    const segments = await SmartSegmentationService.getSmartSegments("org-1", { highValueLabel: "₹10,000" });

    expect(db.select).toHaveBeenCalledTimes(1);
    expect(segments.map((s) => [s.key, s.count])).toEqual([
      ["hot_leads", 1],
      ["high_value_at_risk", 2],
      ["unassigned_new", 3],
      ["stale_high_priority", 0],
    ]);
    expect(segments[1].description).toContain("₹10,000");
  });

  it("builds a condition for every segment key", async () => {
    const c = await SmartSegmentationService.conditions("org-1", ["lead-1"]);
    expect(Object.keys(c).sort()).toEqual(["high_value_at_risk", "hot_leads", "stale_high_priority", "unassigned_new"]);
  });
});

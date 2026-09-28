import { describe, it, expect, vi, beforeEach } from "vitest";
import { LeadConversionPredictorService, tierFor } from "./leadConversionPredictorService";
import { db } from "@/db";

vi.mock("@/db", () => ({ db: { select: vi.fn() } }));
vi.mock("./customStatusSchemaService", () => ({
  CustomStatusSchemaService: { resolver: vi.fn().mockResolvedValue({ openKeys: ["new", "active"] }) },
}));

// Scoring itself runs in Postgres (PROBABILITY); these cover the tiers and the row mapping.
function chain(result: unknown) {
  const c: any = {};
  for (const k of ["from", "where", "orderBy", "limit"]) c[k] = vi.fn(() => c);
  c.offset = vi.fn().mockResolvedValue(result);
  c.then = undefined;
  return c;
}

describe("LeadConversionPredictorService", () => {
  beforeEach(() => vi.clearAllMocks());

  it("maps probability to tiers", () => {
    expect(tierFor(100)).toBe("very_high");
    expect(tierFor(75)).toBe("very_high");
    expect(tierFor(74)).toBe("high");
    expect(tierFor(55)).toBe("high");
    expect(tierFor(54)).toBe("moderate");
    expect(tierFor(35)).toBe("moderate");
    expect(tierFor(34)).toBe("low");
  });

  it("returns SQL aggregates and one mapped page", async () => {
    const agg = { from: vi.fn(() => ({ where: vi.fn().mockResolvedValue([{ total: 40, avg: 41.26, highCount: 3, highValue: 9000, hotCount: 12 }]) })) };
    const page = chain([
      { id: "l1", name: "A", phone: null, email: null, status: "active", score: 90, expectedValue: "5000.00", ownerId: "u1", probability: 80 },
    ]);
    (db.select as any).mockReturnValueOnce(agg).mockReturnValueOnce(page);

    const r = await LeadConversionPredictorService.getConversionPredictions("org", undefined, { limit: 1000 });

    expect(r).toMatchObject({ totalActiveLeads: 40, averageConversionProbability: 41.3, highProbabilityLeadsCount: 3, totalHighProbabilityValue: 9000, hotCount: 12 });
    expect(r.leads[0]).toMatchObject({ id: "l1", expectedValue: 5000, conversionProbability: 80, likelihoodTier: "very_high" });
    expect(page.limit).toHaveBeenCalledWith(100); // page size is capped
  });
});

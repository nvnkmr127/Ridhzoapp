import { describe, expect, it, vi } from "vitest";
import { PipelineVelocityService } from "./pipelineVelocityService";

// Reports resolve custom statuses by category; these tests use the built-in five (no DB round trip).
vi.mock("./customStatusSchemaService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./customStatusSchemaService")>();
  const base = new Map(actual.DEFAULT_SYSTEM_STATUSES.map((s) => [s.key, s.category]));
  const keys = (...c: string[]) => [...base].filter(([, v]) => c.includes(v)).map(([k]) => k);
  return {
    ...actual,
    CustomStatusSchemaService: Object.assign(actual.CustomStatusSchemaService, {
      resolver: async () => ({ cat: (s: string | null | undefined) => base.get(s ?? "") ?? "open", openKeys: keys("open", "in_progress"), closedKeys: keys("won", "lost", "unqualified") }),
    }),
  };
});


vi.mock("@/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn().mockImplementation(() =>
          Promise.resolve([
            { id: "lead-1", status: "won", createdAt: new Date("2026-08-01T00:00:00Z") },
            { id: "lead-2", status: "active", createdAt: new Date("2026-08-01T00:00:00Z") },
          ])
        ),
      })),
    })),
  },
}));

describe("PipelineVelocityService", () => {
  it("should compute pipeline stage velocity and conversion metrics", async () => {
    const { db } = await import("@/db");
    (db.select as any).mockImplementationOnce(() => ({
      from: () => ({
        where: () =>
          Promise.resolve([
            { id: "lead-1", status: "won", createdAt: new Date("2026-08-01T00:00:00Z") },
            { id: "lead-2", status: "active", createdAt: new Date("2026-08-01T00:00:00Z") },
          ]),
      }),
    }));
    (db.select as any).mockImplementationOnce(() => ({
      from: () => ({
        innerJoin: () => ({
          where: () => ({
            orderBy: () =>
              Promise.resolve([
                { leadId: "lead-1", oldStatus: "new", newStatus: "active", createdAt: new Date("2026-08-01T12:00:00Z") },
                { leadId: "lead-1", oldStatus: "active", newStatus: "won", createdAt: new Date("2026-08-02T12:00:00Z") },
              ]),
          }),
        }),
      }),
    }));

    const metrics = await PipelineVelocityService.getVelocityMetrics("org-1");

    expect(metrics.conversionRates.newToActiveRate).toBe(100);
    expect(metrics.conversionRates.overallWinRate).toBe(50);
    expect(metrics.stageVelocities["active"]?.avgHours).toBe(24);
  });
});

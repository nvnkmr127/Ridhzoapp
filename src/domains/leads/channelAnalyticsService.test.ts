import { describe, expect, it, vi } from "vitest";
import { ChannelAnalyticsService } from "./channelAnalyticsService";

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn().mockImplementation(() =>
          Promise.resolve([{ id: "lead-1" }, { id: "lead-2" }])
        ),
      })),
    })),
  },
}));

describe("ChannelAnalyticsService", () => {
  it("should calculate channel utilization breakdown across WhatsApp and call touchpoints", async () => {
    const { db } = await import("@/db");
    // Mock Activities joined with leads
    (db.select as any).mockImplementationOnce(() => ({
      from: () => ({
        innerJoin: () => ({
          where: () => ({
            groupBy: () =>
              Promise.resolve([
                { type: "call", count: 15 },
                { type: "note", count: 5 },
              ]),
          }),
        }),
      }),
    }));

    // Mock WhatsApp message count joined with leads
    (db.select as any).mockImplementationOnce(() => ({
      from: () => ({
        innerJoin: () => ({
          where: () => Promise.resolve([{ count: 30 }]),
        }),
      }),
    }));

    const metrics = await ChannelAnalyticsService.getChannelMetrics("org-1");

    expect(metrics.totalTouchpoints).toBe(50);
    expect(metrics.topChannel).toBe("whatsapp");

    const waItem = metrics.distribution.find((d) => d.channel === "whatsapp");
    expect(waItem?.count).toBe(30);
    expect(waItem?.percentage).toBe(60);
  });
});

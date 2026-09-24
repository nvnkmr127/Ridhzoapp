import { describe, it, expect, vi, beforeEach } from "vitest";

const DAY = 24 * 60 * 60 * 1000;
let selected: unknown[] = [];
const setSpy = vi.fn();
vi.mock("@/db", () => ({
  db: {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => selected }) }) }),
    update: () => ({
      set: (v: unknown) => {
        setSpy(v);
        return { where: () => Object.assign(Promise.resolve(), { returning: async () => [{ id: "e1" }] }) };
      },
    }),
  },
}));

import { SequenceService } from "./sequenceService";

describe("per-lead sequence pause", () => {
  beforeEach(() => vi.clearAllMocks());

  it("pausing records when it was paused", async () => {
    await SequenceService.pause("org", "e1");
    expect(setSpy).toHaveBeenCalledWith(expect.objectContaining({ status: "paused", pausedAt: expect.any(Date) }));
  });

  it("resuming shifts the schedule by the pause length, keeping step spacing", async () => {
    const now = Date.now();
    const createdAt = new Date(now - 10 * DAY);
    const nextRunAt = new Date(now - 3 * DAY); // came due while paused
    selected = [{ pausedAt: new Date(now - 5 * DAY), createdAt, nextRunAt }];
    const res = await SequenceService.resume("org", "e1");
    expect(res.resumed).toBe(1);
    const patch = setSpy.mock.calls[0][0] as { status: string; createdAt: Date; nextRunAt: Date; pausedAt: null };
    expect(patch.status).toBe("active");
    expect(patch.pausedAt).toBeNull();
    // anchor and next step both moved ~5 days later
    expect(Math.round((patch.createdAt.getTime() - createdAt.getTime()) / DAY)).toBe(5);
    expect(Math.round((patch.nextRunAt.getTime() - nextRunAt.getTime()) / DAY)).toBe(5);
  });

  it("does nothing when the enrollment isn't paused", async () => {
    selected = [];
    expect((await SequenceService.resume("org", "e1")).resumed).toBe(0);
    expect(setSpy).not.toHaveBeenCalled();
  });
});

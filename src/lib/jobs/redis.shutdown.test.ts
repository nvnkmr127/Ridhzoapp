import { describe, it, expect, vi } from "vitest";
import { closeAllWorkers, quietErrors } from "./redis";

describe("graceful worker shutdown", () => {
  it("closes every registered worker", async () => {
    const a = { on: vi.fn(), close: vi.fn().mockResolvedValue(undefined) };
    const b = { on: vi.fn(), close: vi.fn().mockResolvedValue(undefined) };
    quietErrors(a); quietErrors(b);
    await closeAllWorkers(1000);
    expect(a.close).toHaveBeenCalled();
    expect(b.close).toHaveBeenCalled();
  });

  it("gives up waiting after the timeout instead of hanging the deploy", async () => {
    const stuck = { on: vi.fn(), close: vi.fn(() => new Promise<void>(() => {})) };
    quietErrors(stuck);
    const t = Date.now();
    await closeAllWorkers(50);
    expect(Date.now() - t).toBeLessThan(1000);
  });
});

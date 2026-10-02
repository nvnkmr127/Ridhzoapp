import { describe, it, expect, vi } from "vitest";

// H5: web-side code imports the queue modules; importing them must never start a consumer.
const Worker = vi.fn();
const Queue = vi.fn();
vi.mock("bullmq", () => ({ Worker, Queue }));
vi.mock("../redis", () => ({ createRedis: () => ({}) }));

describe("queue producer modules", () => {
  it("create Queues only, never Workers", async () => {
    await import("./ingestionQueue");
    await import("./automationQueue");
    expect(Queue).toHaveBeenCalledTimes(2);
    expect(Worker).not.toHaveBeenCalled();
  });
});

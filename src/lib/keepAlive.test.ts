import { describe, it, expect, vi } from "vitest";

const afterFn = vi.fn();
let inRequest = true;
vi.mock("next/server", () => ({
  after: (cb: () => unknown) => {
    if (!inRequest) throw new Error("`after` was called outside a request scope");
    afterFn(cb);
  },
}));

import { keepAlive } from "./keepAlive";

describe("keepAlive", () => {
  it("keeps a request's function alive until the work settles", async () => {
    inRequest = true;
    let done = false;
    keepAlive(new Promise((r) => setTimeout(() => ((done = true), r(1)), 5)));
    expect(afterFn).toHaveBeenCalledOnce();
    await afterFn.mock.calls[0][0]();
    expect(done).toBe(true);
  });

  it("outside a request (the worker) just lets it run, and never leaves a rejection unhandled", async () => {
    inRequest = false;
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => keepAlive(Promise.reject(new Error("boom")), "automations")).not.toThrow();
    await new Promise((r) => setTimeout(r, 0));
    expect(log).toHaveBeenCalledWith("[keepAlive] automations failed:", expect.any(Error));
  });
});

import { describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({ db: {} }));
import { fasterThanPct, recapLine, shortMinutes } from "./habitService";

describe("habit numbers", () => {
  it("only claims a speed percentile with enough peers", () => {
    expect(fasterThanPct(5, [10, 20, 30])).toBeNull();
    expect(fasterThanPct(5, [1, 10, 20, 30, 40])).toBe(80);
  });

  it("formats reply times short", () => {
    expect(shortMinutes(0.4)).toBe("under a minute");
    expect(shortMinutes(4.2)).toBe("4 min");
    expect(shortMinutes(130)).toBe("2 h");
    expect(shortMinutes(1500)).toBe("1 day");
  });

  it("reads the recap as one line", () => {
    expect(recapLine({ leads: 42, contacted: 31, followUpsDone: 1, medianReplyMinutes: 4 })).toBe(
      "42 leads captured · 31 contacted · 1 follow-up done · typical reply in 4 min",
    );
  });
});

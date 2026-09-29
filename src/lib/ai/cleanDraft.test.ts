import { describe, it, expect, vi } from "vitest";
vi.mock("@/db", () => ({ db: {} }));
import { cleanDraft } from "./leadAssist";

describe("cleanDraft", () => {
  it("takes only the tagged message out of a model that thinks out loud", () => {
    const raw = "Let me analyze the lead context:\n1. Lead name\nWait, looking again…\n<message>Hi Vadthya, thanks for your interest!</message>";
    expect(cleanDraft(raw)).toBe("Hi Vadthya, thanks for your interest!");
  });
  it("keeps an unclosed message and drops <think>", () => {
    expect(cleanDraft("<think>hmm</think><message>Hi Ravi, cut off")).toBe("Hi Ravi, cut off");
  });
  it("still strips quotes on a plain reply", () => {
    expect(cleanDraft('"Hi Ravi"')).toBe("Hi Ravi");
  });
});

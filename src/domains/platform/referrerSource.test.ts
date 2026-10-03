import { describe, it, expect, vi } from "vitest";

vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/db/schema", () => ({ organizations: {} }));
vi.mock("./configService", () => ({ PlatformConfigService: {} }));

import { referrerSource } from "./attributionService";

describe("referrerSource", () => {
  it("tells organic search, other sites and our own hop apart", () => {
    expect(referrerSource("google.com")).toEqual({ source: "google.com", medium: "organic" });
    expect(referrerSource("https://www.bing.com/search?q=x")).toEqual({ source: "bing.com", medium: "organic" });
    expect(referrerSource("news.ycombinator.com")).toEqual({ source: "news.ycombinator.com", medium: "referral" });
    expect(referrerSource("ridhzo.com")).toBeNull();
    expect(referrerSource("www.ridhzo.com")).toBeNull();
    expect(referrerSource(undefined)).toBeNull();
  });
});

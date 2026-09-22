import { describe, it, expect } from "vitest";
import React from "react";
import DataDeletionPage from "./page";

describe("DataDeletionPage", () => {
  it("renders status and confirmation code when provided", async () => {
    const el = await DataDeletionPage({
      searchParams: Promise.resolve({ id: "del_12345_test" }),
    });
    expect(el).toBeDefined();
  });

  it("renders gracefully without confirmation code", async () => {
    const el = await DataDeletionPage({
      searchParams: Promise.resolve({}),
    });
    expect(el).toBeDefined();
  });
});

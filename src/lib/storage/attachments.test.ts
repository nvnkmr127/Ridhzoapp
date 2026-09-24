import { describe, expect, it } from "vitest";
import { contentTypeFor } from "./attachments";

describe("attachment type allowlist", () => {
  it("serves known documents/media with a fixed type", () => {
    expect(contentTypeFor("Quote.PDF")).toBe("application/pdf");
    expect(contentTypeFor("site.jpeg")).toBe("image/jpeg");
    expect(contentTypeFor("plan.xlsx")).toContain("spreadsheetml");
  });

  it("rejects anything that could run in the browser", () => {
    for (const name of ["page.html", "logo.svg", "x.htm", "feed.xml", "app.js", "noext"]) expect(contentTypeFor(name)).toBeNull();
  });
});

describe("R2 storage", () => {
  it("uploads to the private bucket with a signed PUT and reads back via the stored key", async () => {
    const { vi } = await import("vitest");
    vi.stubEnv("R2_ACCOUNT_ID", "acct");
    vi.stubEnv("R2_ACCESS_KEY_ID", "AKIA_TEST");
    vi.stubEnv("R2_SECRET_ACCESS_KEY", "secret");
    vi.stubEnv("R2_BUCKET", "ridhzo-files");
    const calls: { url: string; method: string; auth: string | null }[] = [];
    vi.stubGlobal("fetch", async (req: Request) => {
      calls.push({ url: req.url, method: req.method, auth: req.headers.get("authorization") });
      return new Response(req.method === "GET" ? "file-bytes" : null, { status: 200, headers: { "content-length": "10" } });
    });
    const { saveAttachment, openAttachment } = await import("./attachments");

    const ref = await saveAttachment("org-1", "Quote.PDF", Buffer.from("x"), "application/pdf");
    expect(ref).toMatch(/^r2:attachments\/org-1\/[0-9a-f-]+\.pdf$/);
    expect(calls[0].method).toBe("PUT");
    expect(calls[0].url).toMatch(/^https:\/\/acct\.r2\.cloudflarestorage\.com\/ridhzo-files\/attachments\/org-1\//);
    expect(calls[0].auth).toMatch(/^AWS4-HMAC-SHA256 Credential=AKIA_TEST\//);

    const file = await openAttachment(ref);
    expect(file?.size).toBe(10);
    expect(await new Response(file!.stream).text()).toBe("file-bytes");
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });
});

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

describe("bytesMatchExtension", () => {
  const b = (...n: number[]) => new Uint8Array([...n, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const s = (str: string) => new Uint8Array([...str].map((c) => c.charCodeAt(0)));
  it("accepts real signatures", async () => {
    const { bytesMatchExtension } = await import("./attachments");
    expect(bytesMatchExtension("a.pdf", s("%PDF-1.7"))).toBe(true);
    expect(bytesMatchExtension("a.png", b(0x89, 0x50, 0x4e, 0x47))).toBe(true);
    expect(bytesMatchExtension("a.jpg", b(0xff, 0xd8, 0xff))).toBe(true);
    expect(bytesMatchExtension("a.docx", b(0x50, 0x4b, 0x03, 0x04))).toBe(true);
    expect(bytesMatchExtension("a.mp4", new Uint8Array([0, 0, 0, 0x18, ...s("ftyp")]))).toBe(true);
    expect(bytesMatchExtension("a.txt", s("hello"))).toBe(true);
  });
  it("refuses a renamed executable / html / binary-as-text", async () => {
    const { bytesMatchExtension } = await import("./attachments");
    expect(bytesMatchExtension("evil.pdf", s("MZ\x90\x00"))).toBe(false);
    expect(bytesMatchExtension("evil.png", s("<html><script>"))).toBe(false);
    expect(bytesMatchExtension("evil.txt", b(0x4d, 0x5a, 0x00, 0x03))).toBe(false);
  });
});

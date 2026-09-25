import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/rbac", () => ({
  requirePermission: vi.fn().mockResolvedValue({ organizationId: "org-1", userId: "user-1" }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/domains/audit/service", () => ({ AuditService: { log: vi.fn() } }));
vi.mock("@/lib/rate-limit", () => ({ RateLimiter: { checkLimit: vi.fn().mockResolvedValue({ success: true }) } }));
vi.mock("@/lib/crypto/secret", () => ({ encryptSecret: (s: string) => `enc:${s}`, decryptSecret: (s: string) => s.replace(/^enc:/, "") }));

// Minimal chainable db: select() resolves to `selectRows`; insert/update/delete record their values.
const writes: { op: string; values?: Record<string, unknown> }[] = [];
let selectRows: Record<string, unknown>[] = [];
vi.mock("@/db", () => {
  const chain = (): any => new Proxy({}, { get: (_t, k) => (k === "then" ? (r: any) => r(selectRows) : () => chain()) });
  return {
    db: {
      select: () => chain(),
      insert: () => ({ values: (values: any) => ({ onConflictDoUpdate: async () => { writes.push({ op: "upsert", values }); } }) }),
      update: () => ({ set: (values: any) => ({ where: async () => { writes.push({ op: "update", values }); } }) }),
      delete: () => ({ where: async () => { writes.push({ op: "delete" }); } }),
    },
  };
});

import { updateEmailSettingsAction, sendTestEmailAction } from "./emailSettings";
import { EmailSettingsService } from "@/domains/organizations/emailSettingsService";
import { resolvePublicHost } from "@/lib/webhooks/ssrf";

const row = {
  organizationId: "org-1", fromName: "Acme", fromEmail: "sales@acme.com", replyTo: null, smtpHost: "smtp.acme.com",
  smtpPort: 587, smtpSecure: 0, smtpUser: "u", smtpPasswordEnc: "enc:pw", enabled: 0, verifiedAt: null, lastError: null, lastErrorAt: null,
};
const form = { fromName: "Acme", fromEmail: "sales@acme.com", replyTo: "", smtpHost: "smtp.acme.com", smtpPort: "587", smtpUser: "u", smtpPassword: "", enabled: false };

beforeEach(() => {
  vi.restoreAllMocks();
  writes.length = 0;
  selectRows = [row];
});

describe("email settings", () => {
  it("clearing a field saves null instead of keeping the old value", async () => {
    const res = await updateEmailSettingsAction({ ...form, fromName: "" });
    expect(res.ok).toBe(true);
    expect(writes.find((w) => w.op === "upsert")!.values).toMatchObject({ fromName: null, smtpPasswordEnc: "enc:pw" });
  });

  it("derives TLS from the port", async () => {
    await updateEmailSettingsAction({ ...form, smtpPort: "465" });
    expect(writes.find((w) => w.op === "upsert")!.values).toMatchObject({ smtpSecure: 1 });
  });

  it("returns inline field errors", async () => {
    const res = await updateEmailSettingsAction({ ...form, smtpPort: "abc", smtpHost: "https://x.com" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(Object.keys(res.fieldErrors!)).toEqual(expect.arrayContaining(["smtpPort", "smtpHost"]));
  });

  it("turning it on runs a test first and refuses to save if the test fails", async () => {
    const send = vi.spyOn(EmailSettingsService, "deliver").mockRejectedValue(new Error("535 auth failed"));
    selectRows = [{ ...row, email: "me@acme.com" }];
    const res = await updateEmailSettingsAction({ ...form, enabled: true });
    expect(send).toHaveBeenCalled();
    expect(res.ok).toBe(false);
    expect(writes.some((w) => w.op === "upsert")).toBe(false);
  });

  it("a passing test saves the form and marks it verified", async () => {
    vi.spyOn(EmailSettingsService, "deliver").mockResolvedValue();
    selectRows = [{ ...row, email: "me@acme.com" }];
    const res = await sendTestEmailAction({ ...form, smtpHost: "smtp.new.com" });
    expect(res.ok).toBe(true);
    expect(writes.find((w) => w.op === "upsert")!.values).toMatchObject({ smtpHost: "smtp.new.com", verifiedAt: expect.any(Date) });
  });

  it("a credential change resets verification", () => {
    const input = { ...row, smtpPassword: undefined, enabled: true };
    expect(EmailSettingsService.credentialsChanged({ ...row } as any, input as any)).toBe(false);
    expect(EmailSettingsService.credentialsChanged({ ...row } as any, { ...input, smtpHost: "other" } as any)).toBe(true);
    expect(EmailSettingsService.credentialsChanged({ ...row } as any, { ...input, smtpPassword: "new" } as any)).toBe(true);
  });

  it("an enabled org's send failure throws and is recorded — no silent platform fallback", async () => {
    vi.spyOn(EmailSettingsService, "deliver").mockRejectedValue(new Error("ETIMEDOUT"));
    selectRows = [{ ...row, enabled: 1 }];
    await expect(EmailSettingsService.sendForOrg("org-1", { to: "l@x.com", subject: "s", html: "h" })).rejects.toThrow(/ETIMEDOUT/);
    expect(writes.find((w) => w.op === "update")!.values).toMatchObject({ lastError: "ETIMEDOUT" });
  });

  it("a disabled org uses the shared transport", async () => {
    expect(await EmailSettingsService.sendForOrg("org-1", { to: "l@x.com", subject: "s", html: "h" })).toBe(false);
  });

  it("refuses private / metadata SMTP hosts", async () => {
    for (const h of ["127.0.0.1", "10.0.0.5", "169.254.169.254", "[::1]"]) {
      await expect(resolvePublicHost(h), h).rejects.toThrow(/private or reserved/);
    }
    expect(await resolvePublicHost("8.8.8.8")).toBe("8.8.8.8");
  });
});

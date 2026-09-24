import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeGoogleLinkToken } from "@/lib/auth/googleLink";

// Google signIn callback with a "Connect Google" link cookie present.
const limitSpy = vi.fn();
const updateSet = vi.fn();
vi.mock("@/db", () => ({
  db: {
    select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => ({ limit: limitSpy })) })) })),
    update: vi.fn(() => ({
      set: (v: unknown) => {
        updateSet(v);
        return { where: () => ({ returning: async () => [{ ...phoneUser, ...(v as object) }] }) };
      },
    })),
  },
}));

let cookieValue: string | undefined;
const cookieDelete = vi.fn();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => (cookieValue ? { value: cookieValue } : undefined),
    delete: cookieDelete,
  }),
}));

vi.mock("@/domains/organizations/service", () => ({
  OrgService: { isSuspended: async () => false, ensureSystemRoles: async () => null },
  slugify: (s: string) => s,
}));

const phoneUser = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "919000011111@phone.ridhzo.com",
  isActive: true,
  organizationId: "org-1",
  isSuperAdmin: false,
  roleId: "r",
  phone: "+919000011111",
};

import { authOptions } from "./auth";
const signIn = authOptions.callbacks!.signIn!;
const google = (email: string) => ({ user: { email, name: "Ravi" }, account: { provider: "google" } }) as any;

describe("Connect Google (signIn callback)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cookieValue = makeGoogleLinkToken(phoneUser.id);
  });

  it("attaches a new Google email to the phone-only user who started the link", async () => {
    limitSpy.mockResolvedValueOnce([]).mockResolvedValueOnce([phoneUser]); // no user with that email; link user
    const user = google("ravi@gmail.com");
    expect(await signIn(user)).toBe(true);
    expect(updateSet).toHaveBeenCalledWith(expect.objectContaining({ email: "ravi@gmail.com" }));
    expect(user.user.id).toBe(phoneUser.id);
    expect(cookieDelete).toHaveBeenCalled();
  });

  it("refuses when that Google email already belongs to another account", async () => {
    limitSpy.mockResolvedValueOnce([{ ...phoneUser, id: "someone-else", email: "ravi@gmail.com" }]);
    expect(await signIn(google("ravi@gmail.com"))).toBe("/profile?link=google-taken");
    expect(updateSet).not.toHaveBeenCalled();
  });

  it("won't overwrite a real email", async () => {
    limitSpy.mockResolvedValueOnce([]).mockResolvedValueOnce([{ ...phoneUser, email: "ravi@work.com" }]);
    expect(await signIn(google("ravi@gmail.com"))).toBe("/profile?link=google-mismatch");
    expect(updateSet).not.toHaveBeenCalled();
  });

  it("ignores a forged cookie and signs in normally", async () => {
    cookieValue = `${phoneUser.id}.${Date.now() + 60_000}.forged`;
    limitSpy.mockResolvedValueOnce([{ ...phoneUser, id: "u2", email: "ravi@gmail.com" }]);
    const user = google("ravi@gmail.com");
    expect(await signIn(user)).toBe(true);
    expect(user.user.id).toBe("u2");
    expect(updateSet).not.toHaveBeenCalled();
  });
});

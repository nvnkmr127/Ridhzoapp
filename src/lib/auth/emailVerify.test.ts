import { describe, expect, it } from "vitest";
import { setupStatus } from "./emailVerify";

const base = { email: "9198@phone.ridhzo.com", emailVerifiedAt: null, passwordSet: false, googleLinkedAt: null, signupMethod: "phone" };

describe("setupStatus", () => {
  it("phone signup with nothing done is eligible", () => {
    expect(setupStatus(base)).toMatchObject({ email: false, password: false, google: false, done: 0, eligible: true });
  });
  it("a real but unverified email does not count", () => {
    expect(setupStatus({ ...base, email: "a@b.com" }).email).toBe(false);
  });
  it("all three done = not eligible", () => {
    const s = setupStatus({ email: "a@b.com", emailVerifiedAt: new Date(), passwordSet: true, googleLinkedAt: new Date(), signupMethod: "phone" });
    expect(s).toMatchObject({ done: 3, eligible: false });
  });
  it("other signup methods are never prompted", () => {
    expect(setupStatus({ ...base, signupMethod: null }).eligible).toBe(false);
  });
});

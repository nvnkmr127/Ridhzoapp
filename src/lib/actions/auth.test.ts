import { describe, it, expect, vi, beforeEach } from "vitest";

const mockInsert = vi.fn();
const mockLimit = vi.fn();

vi.mock("@/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: mockLimit,
          orderBy: () => ({
            limit: mockLimit,
          }),
        }),
      }),
    }),
    insert: () => ({
      values: (...args: any[]) => {
        mockInsert(...args);
        return Promise.resolve();
      },
    }),
  },
}));

vi.mock("@/lib/messaging/whatsapp/client", () => ({
  isConfigured: vi.fn(() => false),
  WatxioClient: {
    sendText: vi.fn(),
    sendTemplate: vi.fn(),
  },
}));

import { sendWhatsAppOtpAction } from "./auth";

describe("sendWhatsAppOtpAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fails if phone is invalid", async () => {
    const res = await sendWhatsAppOtpAction({ phone: "123", purpose: "login" });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.message).toMatch(/valid phone/i);
    }
  });

  it("checks existing user on login purpose", async () => {
    mockLimit.mockResolvedValueOnce([]);

    const res = await sendWhatsAppOtpAction({ phone: "+919876543210", purpose: "login" });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.message).toMatch(/mobile number/i);
    }
  });

  it("enforces 45-second rate limit", async () => {
    // 1st query: users table (user found)
    mockLimit.mockResolvedValueOnce([{ id: "u1" }]);
    // 2nd query: phone_otps recent check (recent OTP exists)
    mockLimit.mockResolvedValueOnce([{ createdAt: new Date() }]);

    const res = await sendWhatsAppOtpAction({ phone: "+919876543210", purpose: "login" });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.message).toMatch(/wait 45 seconds/i);
    }
  });

  it("generates and stores OTP when valid and unrate-limited", async () => {
    // user lookup -> number not registered yet
    mockLimit.mockResolvedValueOnce([]);
    // recent otp check -> no recent otp
    mockLimit.mockResolvedValueOnce([]);

    const res = await sendWhatsAppOtpAction({ phone: "+919876543210", purpose: "signup" });
    expect(res.ok).toBe(true);
    expect(mockInsert).toHaveBeenCalled();
  });

  it("tells signup users to log in when the number is already registered", async () => {
    mockLimit.mockResolvedValueOnce([{ id: "u1" }]);

    const res = await sendWhatsAppOtpAction({ phone: "+919876543210", purpose: "signup" });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.message).toMatch(/log in/i);
    }
    expect(mockInsert).not.toHaveBeenCalled();
  });
});

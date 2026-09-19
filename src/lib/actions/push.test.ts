import { describe, it, expect, vi, beforeEach } from "vitest";
import { getVapidPublicKeyAction, sendTestPushAction, subscribePushAction } from "./push";
import { PushService } from "@/lib/push/service";

vi.mock("@/lib/rbac", () => ({
  requireAuth: vi.fn().mockResolvedValue({
    user: { id: "user-test-123", email: "test@ridhzo.com", organizationId: "org-test-123" },
  }),
}));

vi.mock("@/lib/push/service", () => ({
  PushService: {
    getVapidKeys: vi.fn().mockReturnValue({ publicKey: "test-pub-key", privateKey: "test-priv-key" }),
    sendToUser: vi.fn().mockResolvedValue(undefined),
    saveSubscription: vi.fn().mockResolvedValue(undefined),
    removeSubscription: vi.fn().mockResolvedValue(undefined),
  },
}));

describe("Push Server Actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("getVapidPublicKeyAction returns the public VAPID key", async () => {
    const key = await getVapidPublicKeyAction();
    expect(key).toBe("test-pub-key");
    expect(PushService.getVapidKeys).toHaveBeenCalledTimes(1);
  });

  it("sendTestPushAction triggers simulated lead alert to authenticated user", async () => {
    const result = await sendTestPushAction();
    expect(result).toEqual({ ok: true, data: { sent: true } });
    expect(PushService.sendToUser).toHaveBeenCalledWith(
      "user-test-123",
      expect.objectContaining({
        title: expect.stringContaining("Test Lead Alert"),
        url: "/leads",
      })
    );
  });

  it("subscribePushAction records subscription for user", async () => {
    const sub = {
      endpoint: "https://fcm.googleapis.com/fcm/send/xyz",
      keys: { p256dh: "key-p256", auth: "auth-secret" },
    };
    const result = await subscribePushAction(sub);
    expect(result).toEqual({ ok: true, data: { subscribed: true } });
    expect(PushService.saveSubscription).toHaveBeenCalledWith("user-test-123", sub);
  });
});

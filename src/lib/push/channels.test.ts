import { describe, it, expect, vi, afterEach } from "vitest";
import { pushChannelFor } from "./channels";

vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/db/schema", () => ({ deviceTokens: {} }));

describe("push channels", () => {
  it("routes each notification type to the channel the app creates", () => {
    expect(pushChannelFor("follow_up_due")).toBe("reminders");
    expect(pushChannelFor("follow_up_overdue")).toBe("reminders");
    expect(pushChannelFor("meeting_reminder")).toBe("meetings");
    expect(pushChannelFor("new_lead")).toBe("leads");
    expect(pushChannelFor("lead_assigned")).toBe("leads");
    expect(pushChannelFor("sla_escalation")).toBe("leads");
    expect(pushChannelFor("daily_summary")).toBe("updates");
    expect(pushChannelFor("billing_dunning")).toBe("updates");
  });
});

describe("Expo push payload", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("sends high priority with the channel and badge", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ json: async () => ({ data: [{ status: "ok" }] }) });
    vi.stubGlobal("fetch", fetchMock);
    const { ExpoPushService } = await import("./expo");
    await ExpoPushService.sendToTokens(["ExponentPushToken[abc]"], { title: "New lead: Ravi", data: { type: "new_lead", leadId: "l1" }, channelId: "leads", badge: 3 });
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body)[0];
    expect(sent).toMatchObject({ to: "ExponentPushToken[abc]", priority: "high", channelId: "leads", badge: 3, sound: "default", data: { type: "new_lead", leadId: "l1" } });
  });
});

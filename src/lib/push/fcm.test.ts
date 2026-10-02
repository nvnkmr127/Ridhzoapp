import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import crypto from "crypto";

const replies: Record<string, { status: number; body: unknown }> = {};

beforeAll(() => {
  const { privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  process.env.FIREBASE_PROJECT_ID = "p";
  process.env.FIREBASE_CLIENT_EMAIL = "sa@p.iam.gserviceaccount.com";
  process.env.FIREBASE_PRIVATE_KEY = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    if (url.includes("oauth2")) return new Response(JSON.stringify({ access_token: "a", expires_in: 3600 }));
    const { token } = JSON.parse(String(init?.body)).message;
    const r = replies[token];
    return new Response(JSON.stringify(r.body), { status: r.status });
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
});
afterEach(() => Object.keys(replies).forEach((k) => delete replies[k]));

describe("FcmPushService.sendToTokens", () => {
  it("drops only tokens FCM says are dead — a payload error must not delete a valid token", async () => {
    const { FcmPushService } = await import("./fcm");
    replies.ok = { status: 200, body: { name: "projects/p/messages/1" } };
    replies.gone = { status: 404, body: { error: { status: "NOT_FOUND", details: [{ errorCode: "UNREGISTERED" }] } } };
    replies.badToken = { status: 400, body: { error: { status: "INVALID_ARGUMENT", details: [{ fieldViolations: [{ field: "message.token" }] }] } } };
    replies.badPayload = { status: 400, body: { error: { status: "INVALID_ARGUMENT", details: [{ fieldViolations: [{ field: "message.data" }] }] } } };

    const r = await FcmPushService.sendToTokens(["ok", "gone", "badToken", "badPayload"], { title: "t" });
    expect(r.accepted).toBe(1);
    expect(r.failed).toBe(3);
    expect(r.dead.sort()).toEqual(["badToken", "gone"]);
  });
});

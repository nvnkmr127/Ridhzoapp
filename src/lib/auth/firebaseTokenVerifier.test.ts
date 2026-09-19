import { describe, it, expect } from "vitest";
import { verifyFirebaseIdToken } from "./firebaseTokenVerifier";

describe("verifyFirebaseIdToken", () => {
  it("resolves mock token in test/development environment", async () => {
    const verified = await verifyFirebaseIdToken("dev-mock-token-+919876543210");
    expect(verified.phoneNumber).toBe("+919876543210");
    expect(verified.uid).toBe("dev-uid-+919876543210");
  });

  it("throws when project ID is missing and token is not a mock token", async () => {
    const originalEnv = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    delete process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    delete process.env.FIREBASE_PROJECT_ID;

    await expect(verifyFirebaseIdToken("invalid-real-token", "")).rejects.toThrow(
      /Firebase project ID not configured/
    );

    if (originalEnv) {
      process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = originalEnv;
    }
  });

  it("fails verification on malformed real tokens", async () => {
    await expect(
      verifyFirebaseIdToken("header.payload.signature", "test-project-123")
    ).rejects.toThrow();
  });
});

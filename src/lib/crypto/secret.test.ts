import { describe, it, expect, beforeAll } from "vitest";
import { encryptSecret, decryptSecret, readSecret } from "./secret";

describe("secret encryption (AES-256-GCM)", () => {
  beforeAll(() => {
    process.env.EMAIL_SECRET_KEY = "test-secret-key-for-encryption";
  });

  it("round-trips a value", () => {
    const plain = "sm7p-p@ssw0rd!";
    const enc = encryptSecret(plain);
    expect(enc).not.toContain(plain); // actually encrypted
    expect(enc).toMatch(/^v2:[0-9a-f]{8}:/); // versioned, carries the key id
    expect(enc.split(":").slice(2).join(":").split(".")).toHaveLength(3); // iv.tag.ciphertext
    expect(decryptSecret(enc)).toBe(plain);
  });

  it("produces a different ciphertext each time (random IV)", () => {
    expect(encryptSecret("same")).not.toBe(encryptSecret("same"));
  });

  it("returns null for tampered or wrong-key ciphertext", () => {
    const enc = encryptSecret("secret");
    expect(decryptSecret(enc.slice(0, -4) + "AAAA")).toBeNull(); // tampered tag/data
    expect(decryptSecret("not-a-valid-payload")).toBeNull();
  });

  describe("readSecret (tolerant migration read)", () => {
    it("decrypts an encrypted value", () => {
      expect(readSecret(encryptSecret("EAAB-fb-page-token"))).toBe("EAAB-fb-page-token");
    });
    it("returns legacy plaintext unchanged (not yet re-encrypted)", () => {
      expect(readSecret("EAAB-legacy-plaintext-token")).toBe("EAAB-legacy-plaintext-token");
    });
    it("returns null for empty/nullish", () => {
      expect(readSecret(null)).toBeNull();
      expect(readSecret(undefined)).toBeNull();
      expect(readSecret("")).toBeNull();
    });
  });

  describe("key rotation", () => {
    it("still decrypts after the primary key is rotated, when the old one is kept as PREVIOUS", () => {
      process.env.EMAIL_SECRET_KEY = "old-key";
      const enc = encryptSecret("smtp-pass");
      process.env.EMAIL_SECRET_KEY = "new-key";
      expect(decryptSecret(enc)).toBeNull(); // old key gone → unreadable
      process.env.EMAIL_SECRET_KEY_PREVIOUS = "old-key";
      expect(decryptSecret(enc)).toBe("smtp-pass");
      delete process.env.EMAIL_SECRET_KEY_PREVIOUS;
      process.env.EMAIL_SECRET_KEY = "test-secret-key-for-encryption";
    });
    it("reads legacy un-prefixed ciphertexts", async () => {
      const crypto = await import("crypto");
      const k = crypto.createHash("sha256").update("test-secret-key-for-encryption").digest();
      const iv = crypto.randomBytes(12);
      const c = crypto.createCipheriv("aes-256-gcm", k, iv);
      const data = Buffer.concat([c.update("legacy", "utf8"), c.final()]);
      const legacy = `${iv.toString("base64")}.${c.getAuthTag().toString("base64")}.${data.toString("base64")}`;
      expect(decryptSecret(legacy)).toBe("legacy");
    });
  });
});

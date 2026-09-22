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
    expect(enc.split(".")).toHaveLength(3); // iv.tag.ciphertext
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
});

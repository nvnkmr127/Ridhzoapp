import crypto from "crypto";

// Symmetric encryption for secrets at rest (e.g. tenant SMTP passwords). AES-256-GCM with a key
// derived from EMAIL_SECRET_KEY (or NEXTAUTH_SECRET as a fallback). Output: iv.tag.ciphertext,
// all base64. Server-only — never import into client/edge code paths.
//
// Rotating the key makes existing ciphertexts undecryptable (they return null) — re-enter secrets
// after a rotation.

function key(): Buffer {
  const material = process.env.EMAIL_SECRET_KEY || process.env.NEXTAUTH_SECRET || "";
  if (!material) throw new Error("EMAIL_SECRET_KEY or NEXTAUTH_SECRET must be set to store secrets");
  return crypto.createHash("sha256").update(material).digest(); // 32 bytes
}

export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${tag.toString("base64")}.${enc.toString("base64")}`;
}

export function decryptSecret(payload: string): string | null {
  try {
    const [ivB64, tagB64, dataB64] = payload.split(".");
    if (!ivB64 || !tagB64 || !dataB64) return null;
    const decipher = crypto.createDecipheriv("aes-256-gcm", key(), Buffer.from(ivB64, "base64"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
  } catch {
    return null; // wrong key / corrupt / tampered
  }
}

// Tolerant read for values that may be encrypted (new writes) OR still plaintext (rows written
// before encryption was added). GCM's auth tag makes a false "decrypt" of real plaintext
// cryptographically impossible, so anything that fails to decrypt is returned as-is. This lets a
// token store migrate lazily — each row becomes ciphertext on its next write — without a backfill.
export function readSecret(value: string | null | undefined): string | null {
  if (!value) return null;
  return decryptSecret(value) ?? value;
}

import crypto from "crypto";

// Symmetric encryption for secrets at rest (e.g. tenant SMTP passwords). AES-256-GCM with a key
// derived from EMAIL_SECRET_KEY (or NEXTAUTH_SECRET as a fallback). Output: iv.tag.ciphertext,
// all base64. Server-only — never import into client/edge code paths.
//
// Rotating the key makes existing ciphertexts undecryptable (they return null) — re-enter secrets
// after a rotation.

// Key material, newest first: the dedicated EMAIL_SECRET_KEY, then (legacy / fallback) NEXTAUTH_SECRET, then
// EMAIL_SECRET_KEY_PREVIOUS — set it to the old value while rotating, so ciphertexts written with the old key
// still decrypt and get re-written under the new one. The session-signing secret and the data-encryption key
// SHOULD differ (production boot warns when EMAIL_SECRET_KEY is missing).
function materials(): string[] {
  const list = [process.env.EMAIL_SECRET_KEY, process.env.NEXTAUTH_SECRET, process.env.EMAIL_SECRET_KEY_PREVIOUS]
    .filter((m): m is string => !!m);
  return [...new Set(list)];
}
const derive = (m: string) => crypto.createHash("sha256").update(m).digest(); // 32 bytes
const keyId = (m: string) => crypto.createHash("sha256").update(`kid:${m}`).digest("hex").slice(0, 8);

function key(): { key: Buffer; id: string } {
  const m = materials()[0];
  if (!m) throw new Error("EMAIL_SECRET_KEY or NEXTAUTH_SECRET must be set to store secrets");
  return { key: derive(m), id: keyId(m) };
}

// v2 format: "v2:<keyId>:<iv>.<tag>.<ciphertext>". The key id says which key to try first; legacy values
// (no prefix) are tried against every configured key.
export function encryptSecret(plain: string): string {
  const { key: k, id } = key();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", k, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v2:${id}:${iv.toString("base64")}.${tag.toString("base64")}.${enc.toString("base64")}`;
}

function tryDecrypt(body: string, k: Buffer): string | null {
  try {
    const [ivB64, tagB64, dataB64] = body.split(".");
    if (!ivB64 || !tagB64 || !dataB64) return null;
    const decipher = crypto.createDecipheriv("aes-256-gcm", k, Buffer.from(ivB64, "base64"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
  } catch {
    return null; // wrong key / corrupt / tampered
  }
}

export function decryptSecret(payload: string): string | null {
  let body = payload;
  let preferred: string | undefined;
  const v2 = /^v2:([0-9a-f]{8}):([\s\S]*)$/.exec(payload);
  if (v2) { preferred = v2[1]; body = v2[2]; }
  const ms = materials();
  // The key named by the id first, then the rest (covers rotation and legacy un-prefixed values).
  const ordered = preferred ? [...ms.filter((m) => keyId(m) === preferred), ...ms.filter((m) => keyId(m) !== preferred)] : ms;
  for (const m of ordered) {
    const out = tryDecrypt(body, derive(m));
    if (out !== null) return out;
  }
  return null;
}

// True when a stored ciphertext isn't under the current primary key (legacy format or a rotated key) — a
// caller may re-encrypt it on its next write.
export function needsReencrypt(payload: string): boolean {
  const id = materials()[0] ? keyId(materials()[0]) : null;
  return !payload.startsWith(`v2:${id}:`);
}

// Tolerant read for values that may be encrypted (new writes) OR still plaintext (rows written
// before encryption was added). GCM's auth tag makes a false "decrypt" of real plaintext
// cryptographically impossible, so anything that fails to decrypt is returned as-is. This lets a
// token store migrate lazily — each row becomes ciphertext on its next write — without a backfill.
export function readSecret(value: string | null | undefined): string | null {
  if (!value) return null;
  return decryptSecret(value) ?? value;
}

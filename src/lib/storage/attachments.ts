// No "server-only" import: the background worker (plain Node, not Next) also uses this to
// delete files when leads are purged. Only server code imports it.
import { randomUUID } from "crypto";
import { createReadStream } from "fs";
import { mkdir, stat, unlink, writeFile } from "fs/promises";
import path from "path";
import { Readable } from "stream";

// Private file storage for lead attachments. Never public: every read goes through
// /api/attachments/[id], which checks the viewer may open the lead.
//   • Cloudflare R2 (a PRIVATE bucket, S3 API) when R2_* env is set — the production path.
//   • Otherwise a private folder OUTSIDE public/ (dev, or a single long-lived server). Set
//     ATTACHMENTS_DIR to a persistent volume there.
// Stored refs: "r2:<key>" | "local:<file>" | legacy "/uploads/attachments/<file>" (read-only).

// Allowlist by extension → the content type we serve (never the browser-supplied one). HTML, SVG,
// XML and scripts are excluded: served from our origin they could run code as the viewer.
export const ALLOWED_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  heic: "image/heic",
  txt: "text/plain",
  csv: "text/csv",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  zip: "application/zip",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  mp4: "video/mp4",
  mov: "video/quicktime",
};
/** Types safe to show inline in the browser (images/PDF); everything else downloads. */
export const INLINE_TYPES = new Set(["application/pdf", "image/png", "image/jpeg", "image/gif", "image/webp"]);

export function contentTypeFor(fileName: string): string | null {
  const ext = path.extname(fileName).slice(1).toLowerCase();
  return ALLOWED_TYPES[ext] ?? null;
}

// R2: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET. Keep the bucket private
// (no public domain / r2.dev) — reads are proxied through the access-checked route.
function r2() {
  const { R2_ACCOUNT_ID: account, R2_ACCESS_KEY_ID: key, R2_SECRET_ACCESS_KEY: secret, R2_BUCKET, R2_BUCKET_NAME } = process.env;
  const bucket = R2_BUCKET || R2_BUCKET_NAME;
  if (!account || !key || !secret || !bucket) return null;
  return { key, secret, base: `https://${account}.r2.cloudflarestorage.com/${bucket}` };
}

async function r2Fetch(objectKey: string, init: RequestInit = {}) {
  const cfg = r2();
  if (!cfg) throw new Error("R2 is not configured");
  const { AwsClient } = await import("aws4fetch");
  const client = new AwsClient({ accessKeyId: cfg.key, secretAccessKey: cfg.secret, service: "s3", region: "auto" });
  const objectPath = objectKey.split("/").map(encodeURIComponent).join("/");
  return client.fetch(`${cfg.base}/${objectPath}`, init);
}
const localDir = () => process.env.ATTACHMENTS_DIR || path.join(process.cwd(), ".data", "attachments");

export async function saveAttachment(organizationId: string, fileName: string, data: Buffer, contentType: string): Promise<string> {
  const ext = path.extname(fileName).toLowerCase().replace(/[^.a-z0-9]/g, "");
  const key = `${randomUUID()}${ext}`;
  if (r2()) {
    const objectKey = `attachments/${organizationId}/${key}`;
    const res = await r2Fetch(objectKey, { 
      method: "PUT", 
      body: new Uint8Array(data), 
      headers: { 
        "Content-Type": contentType,
        "Content-Length": data.byteLength.toString()
      } 
    });
    if (!res.ok) throw new Error(`R2 upload failed (${res.status})`);
    return `r2:${objectKey}`;
  }
  // Serverless disks are read-only/ephemeral: in production a local fallback would fail or silently
  // lose files, so require R2 unless a persistent ATTACHMENTS_DIR was set on purpose.
  if (process.env.NODE_ENV === "production" && !process.env.ATTACHMENTS_DIR) {
    const err = new Error("File storage isn't set up yet. Ask your admin to configure Cloudflare R2.");
    (err as { code?: string }).code = "VALIDATION";
    throw err;
  }
  await mkdir(localDir(), { recursive: true });
  await writeFile(path.join(localDir(), key), data);
  return `local:${key}`;
}

export async function openAttachment(ref: string): Promise<{ stream: ReadableStream<Uint8Array>; size?: number } | null> {
  if (ref.startsWith("r2:")) {
    const res = await r2Fetch(ref.slice(3));
    if (!res.ok || !res.body) return null;
    const size = Number(res.headers.get("content-length")) || undefined;
    return { stream: res.body, size };
  }
  const file = ref.startsWith("local:")
    ? path.join(localDir(), path.basename(ref.slice(6)))
    : ref.startsWith("/uploads/attachments/")
      ? path.join(process.cwd(), "public", "uploads", "attachments", path.basename(ref))
      : null;
  if (!file) return null;
  try {
    const s = await stat(file);
    return { stream: Readable.toWeb(createReadStream(file)) as ReadableStream<Uint8Array>, size: s.size };
  } catch {
    return null;
  }
}

export async function deleteAttachment(ref: string) {
  try {
    if (ref.startsWith("r2:")) {
      await r2Fetch(ref.slice(3), { method: "DELETE" });
    } else if (ref.startsWith("local:")) {
      await unlink(path.join(localDir(), path.basename(ref.slice(6))));
    } else if (ref.startsWith("/uploads/attachments/")) {
      await unlink(path.join(process.cwd(), "public", "uploads", "attachments", path.basename(ref)));
    }
  } catch {
    // already gone — nothing to clean up
  }
}

/** A stored ref (vs an external http(s) link the rep attached). */
export const isStoredRef = (ref: string) => ref.startsWith("r2:") || ref.startsWith("local:") || ref.startsWith("/uploads/");

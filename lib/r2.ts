import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

let client: S3Client | null = null;

const REQUIRED_ENV = [
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET",
  "R2_PUBLIC_URL",
] as const;

// Throws naming every required R2 env var that isn't set.
export function assertConfigured(): void {
  const missing = REQUIRED_ENV.filter((name) => !process.env[name]);
  if (missing.length) throw new Error(`Missing: ${missing.join(", ")}`);
}

function r2(): S3Client {
  if (!client) {
    client = new S3Client({
      region: "auto",
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
      },
      // R2 rejects the extra checksum headers newer SDKs add to presigned PUTs.
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    });
  }
  return client;
}

const bucket = () => process.env.R2_BUCKET ?? "";

export function publicUrl(key: string): string {
  return `${(process.env.R2_PUBLIC_URL ?? "").replace(/\/$/, "")}/${key}`;
}

export function presignPut(key: string, contentType: string): Promise<string> {
  return getSignedUrl(
    r2(),
    new PutObjectCommand({ Bucket: bucket(), Key: key, ContentType: contentType }),
    { expiresIn: 60 * 15 },
  );
}

export async function exists(key: string): Promise<number | null> {
  try {
    const res = await r2().send(new HeadObjectCommand({ Bucket: bucket(), Key: key }));
    return res.ContentLength ?? 0;
  } catch {
    return null;
  }
}

export type ClipMeta = {
  id: string;
  title: string;
  createdAt: string;
  video: { key: string; type: string; width: number; height: number; duration: number; size: number };
  thumb: { key: string };
};

export const keys = (id: string, videoExt: string) => ({
  video: `clips/${id}/video.${videoExt}`,
  thumb: `clips/${id}/thumb.jpg`,
  meta: `clips/${id}/meta.json`,
});

export async function putMeta(meta: ClipMeta): Promise<void> {
  await r2().send(
    new PutObjectCommand({
      Bucket: bucket(),
      Key: `clips/${meta.id}/meta.json`,
      Body: JSON.stringify(meta),
      ContentType: "application/json",
    }),
  );
}

export async function getMeta(id: string): Promise<ClipMeta | null> {
  if (!isValidId(id)) return null;
  try {
    const res = await r2().send(
      new GetObjectCommand({ Bucket: bucket(), Key: `clips/${id}/meta.json` }),
    );
    const text = await res.Body?.transformToString();
    return text ? (JSON.parse(text) as ClipMeta) : null;
  } catch {
    return null;
  }
}

const ALPHABET = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function newId(len = 7): string {
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

export function isValidId(id: string): boolean {
  return /^[A-Za-z0-9]{5,16}$/.test(id);
}

export const VIDEO_TYPES: Record<string, string> = {
  "video/mp4": "mp4",
  "video/webm": "webm",
};

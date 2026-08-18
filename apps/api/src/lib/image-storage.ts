import crypto from "node:crypto";
import { env } from "../env.js";
import { HttpError } from "./http.js";

const dataImagePattern = /^data:image\/(jpeg|png|webp);base64,/i;

export function isImageStorageConfigured() {
  return Boolean(env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET);
}

export async function persistImage(value: string | null | undefined, area: string) {
  if (!value || !dataImagePattern.test(value)) return value;
  if (!isImageStorageConfigured()) return value;
  return uploadToCloudinary(value, area);
}

export async function persistImageBuffer(buffer: Buffer, mimeType: string, area: string) {
  if (!isImageStorageConfigured()) return null;
  return uploadToCloudinary(`data:${mimeType};base64,${buffer.toString("base64")}`, area);
}

async function uploadToCloudinary(file: string, area: string) {
  const timestamp = Math.floor(Date.now() / 1000);
  const folder = `${env.CLOUDINARY_FOLDER.replace(/^\/+|\/+$/g, "")}/${area}`;
  const signaturePayload = `folder=${folder}&timestamp=${timestamp}${env.CLOUDINARY_API_SECRET}`;
  const signature = crypto.createHash("sha1").update(signaturePayload).digest("hex");
  const form = new FormData();
  form.set("file", file);
  form.set("api_key", env.CLOUDINARY_API_KEY!);
  form.set("timestamp", String(timestamp));
  form.set("folder", folder);
  form.set("signature", signature);

  const response = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(env.CLOUDINARY_CLOUD_NAME!)}/image/upload`, {
    method: "POST",
    body: form,
  });
  const result = await response.json() as { secure_url?: string; public_id?: string; version?: number; format?: string; error?: { message?: string } };
  if (!response.ok || !result.secure_url) {
    console.error("Cloudinary image upload failed:", result.error?.message || `HTTP ${response.status}`);
    throw new HttpError(502, "The image could not be stored. Please try again.", "IMAGE_STORAGE_FAILED");
  }
  if (env.CLOUDINARY_PUBLIC_BASE_URL && result.public_id && result.version && result.format) {
    return `${env.CLOUDINARY_PUBLIC_BASE_URL.replace(/\/$/, "")}/v${result.version}/${result.public_id}.${result.format}`;
  }
  return result.secure_url;
}

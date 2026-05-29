import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { getAuthenticatedUser } from "@/lib/auth";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import { isE2ETestMode } from "@/lib/test-mode";

// 5 MB hard cap. The client already centre-crops + downscales to ~512px
// WebP (see lib/image.ts), so a legitimate upload is well under this; the
// cap just guards against someone POSTing a raw file directly.
const MAX_BYTES = 5 * 1024 * 1024;

export const runtime = "nodejs";

/**
 * Accept a single normalised avatar image and store it in Vercel Blob,
 * returning its public URL. Auth + rate limiting mirror the voice
 * transcription route. In E2E test mode (or when the Blob token is
 * absent) we skip the network call and echo a deterministic placeholder
 * URL so tests and local dev work without a configured Blob store.
 */
export async function POST(req: Request) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limit = rateLimit(`avatar-upload:${user.id}`, { limit: 20 });
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Rate limit exceeded", retryAfterSeconds: limit.retryAfterSeconds },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  // Defence in depth — rate-limit by IP too, since user.id can be cheap to
  // mint via repeated signups.
  const ipLimit = rateLimit(`avatar-upload-ip:${getClientIp(req.headers)}`, {
    limit: 40,
  });
  if (!ipLimit.ok) {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      { status: 429, headers: { "Retry-After": String(ipLimit.retryAfterSeconds) } },
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = form.get("image");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing `image` file" }, { status: 400 });
  }
  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "File must be image/*" }, { status: 415 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Image too large" }, { status: 413 });
  }

  const token = process.env.BLOB_READ_WRITE_TOKEN;

  // Test mode / unconfigured store — don't hit the network. Return a stable
  // stub URL so the rest of the flow (persisting + rendering) still works.
  if (isE2ETestMode() || !token) {
    return NextResponse.json({
      url: `https://example.invalid/avatars/${user.id}/test-avatar.webp`,
    });
  }

  try {
    const ext = file.type === "image/png" ? "png" : "webp";
    const blob = await put(`avatars/${user.id}/avatar.${ext}`, file, {
      access: "public",
      addRandomSuffix: true,
      contentType: file.type,
      token,
    });
    return NextResponse.json({ url: blob.url });
  } catch (err) {
    console.error("avatar-upload error", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 502 });
  }
}

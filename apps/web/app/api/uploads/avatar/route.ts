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
 * Accept a single normalised avatar image and store it in a *private*
 * Vercel Blob, returning a same-origin proxy URL (`/api/avatar?pathname=…`)
 * rather than the raw blob URL. Profile photos are members-only: the blob
 * itself is unreadable without the store token, and the proxy route gates
 * access on an authenticated session. Auth + rate limiting mirror the voice
 * transcription route. In E2E test mode (or when the Blob token is absent)
 * we skip the network call and echo a deterministic proxy URL so tests and
 * local dev work without a configured Blob store.
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
  // proxy URL so the rest of the flow (persisting + rendering) still works.
  if (isE2ETestMode() || !token) {
    return NextResponse.json({
      url: avatarProxyUrl(`avatars/${user.id}/test-avatar.webp`),
    });
  }

  try {
    const ext = file.type === "image/png" ? "png" : "webp";
    const blob = await put(`avatars/${user.id}/avatar.${ext}`, file, {
      access: "private",
      addRandomSuffix: true,
      contentType: file.type,
      token,
    });
    // Never hand the raw private blob URL to the client — it isn't readable
    // without the store token. Persist + render through the gated proxy.
    return NextResponse.json({ url: avatarProxyUrl(blob.pathname) });
  } catch (err) {
    console.error("avatar-upload error", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 502 });
  }
}

/** Same-origin URL that streams a private avatar blob to signed-in members. */
function avatarProxyUrl(pathname: string): string {
  return `/api/avatar?pathname=${encodeURIComponent(pathname)}`;
}

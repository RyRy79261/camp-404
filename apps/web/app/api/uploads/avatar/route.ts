import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { getAuthenticatedUser } from "@/lib/auth";
import { getClientIp, rateLimiter } from "@/lib/rate-limit";
import { deleteAvatarBlobs } from "@/lib/avatar-blob";
import { isE2ETestMode } from "@/lib/test-mode";

// 5 MB hard cap. The client already centre-crops + downscales to ~512px
// WebP (see lib/image.ts), so a legitimate upload is well under this; the
// cap just guards against someone POSTing a raw file directly.
const MAX_BYTES = 5 * 1024 * 1024;

// Content types we will actually store. The client normalises to WebP
// (lib/image.ts `cropResizeToSquare`), and a browser that can't encode WebP
// falls back to PNG per the canvas spec — those two are the only types a
// legitimate upload produces. An explicit allow-list rather than `image/*`
// keeps script-bearing `image/svg+xml` out of the store: /api/avatar streams
// blobs back same-origin with their stored content type, so a stored SVG
// would execute in this app's origin when a member opens the link directly.
const ALLOWED_TYPES = new Set(["image/webp", "image/png"]);

export const runtime = "nodejs";

/**
 * Accept a single normalised avatar image and store it in a *private*
 * Vercel Blob, returning a same-origin proxy URL (`/api/avatar?pathname=…`)
 * rather than the raw blob URL. Profile photos are members-only: the blob
 * itself is unreadable without the store token, and the proxy route gates
 * access on an authenticated session. Auth + rate limiting mirror the voice
 * transcription route. In E2E test mode we skip the network call and echo a
 * deterministic proxy URL so the suite runs without a Blob store; a missing
 * store token in any other environment is a 501, not a fabricated success.
 */
export async function POST(req: Request) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limit = await rateLimiter.limit(`avatar-upload:${user.id}`, {
    limit: 20,
  });
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Rate limit exceeded", retryAfterSeconds: limit.retryAfterSeconds },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  // Defence in depth — rate-limit by IP too, since user.id can be cheap to
  // mint via repeated signups.
  const ipLimit = await rateLimiter.limit(
    `avatar-upload-ip:${getClientIp(req.headers)}`,
    { limit: 40 },
  );
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
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: "Photo must be a WebP or PNG image" },
      { status: 415 },
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Image too large" }, { status: 413 });
  }

  // E2E harness only — a deterministic stub with no network call.
  // E2E_TEST_MODE is never set on a deployed environment (lib/test-mode.ts).
  if (isE2ETestMode()) {
    return NextResponse.json({
      url: avatarProxyUrl(`avatars/${user.id}/test-avatar.webp`),
    });
  }

  const token = process.env.BLOB_READ_WRITE_TOKEN;
  // No Blob store configured — say so rather than echoing a proxy URL for a
  // blob we never wrote. The client treats any 2xx as success and persists the
  // URL to `users.profile_image_url`, where it 404s forever and the member's
  // photo silently never appears. Same contract as the voice route, which
  // reports "Voice not configured" instead of faking a transcript.
  if (!token) {
    return NextResponse.json(
      { error: "Photo uploads aren't configured on this deployment." },
      { status: 501 },
    );
  }

  try {
    const ext = file.type === "image/png" ? "png" : "webp";
    const blob = await put(`avatars/${user.id}/avatar.${ext}`, file, {
      access: "private",
      addRandomSuffix: true,
      contentType: file.type,
      token,
    });
    // Prune the member's previous avatar object(s) — `addRandomSuffix` means
    // each upload writes a new path, orphaning the old one. Best-effort: a
    // cleanup failure must not fail an otherwise-successful upload.
    try {
      await deleteAvatarBlobs(user.id, blob.pathname);
    } catch (err) {
      console.error("avatar-cleanup error", err);
    }
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

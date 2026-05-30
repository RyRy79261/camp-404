import { NextResponse } from "next/server";
import { get } from "@vercel/blob";
import { getAuthenticatedUser } from "@/lib/auth";
import { isE2ETestMode } from "@/lib/test-mode";

export const runtime = "nodejs";

/**
 * Stream a member's private avatar blob.
 *
 * Profile photos live in a *private* Vercel Blob store, so their raw URLs
 * aren't readable without the store token. We never expose that URL; instead
 * the uploader persists a `/api/avatar?pathname=…` link and this route fetches
 * the blob server-side (with the token) and streams it back — but only to an
 * authenticated session. A logged-out request gets a 401, so the `<img>`
 * simply fails to load: photos are visible to signed-in members only.
 *
 * Any signed-in member may view any member's avatar (they're shown across the
 * home header, profile pages, the family tree, and the captain roster), so the
 * gate is "are you logged in", not ownership.
 */
export async function GET(req: Request) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const pathname = new URL(req.url).searchParams.get("pathname");
  if (!pathname) {
    return new NextResponse("Missing pathname", { status: 400 });
  }
  // Scope to the avatars prefix so this can't be used to read other blobs.
  if (!pathname.startsWith("avatars/")) {
    return new NextResponse("Not found", { status: 404 });
  }

  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (isE2ETestMode() || !token) {
    // No store configured (local dev / E2E) — nothing to serve.
    return new NextResponse("Not found", { status: 404 });
  }

  try {
    const result = await get(pathname, { access: "private", token });
    // `get` returns null when the blob is missing, and a 304 variant (with a
    // null stream) for conditional requests. We only stream a full 200.
    if (!result || result.statusCode !== 200) {
      return new NextResponse("Not found", { status: 404 });
    }
    return new NextResponse(result.stream, {
      headers: {
        "Content-Type": result.blob.contentType,
        // Per-member content: let the browser cache it but never a shared
        // cache/CDN. The pathname carries a random suffix that changes on
        // every new upload, so a given URL is effectively immutable.
        "Cache-Control": "private, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    console.error("avatar-proxy error", err);
    return new NextResponse("Not found", { status: 404 });
  }
}

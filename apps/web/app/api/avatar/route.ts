import { NextResponse } from "next/server";
import { get } from "@vercel/blob";
import { getAuthenticatedUser } from "@/lib/auth";
import { findCampUserByAuthId, isApproved } from "@/lib/users";
import { isE2ETestMode } from "@/lib/test-mode";

export const runtime = "nodejs";

/**
 * Stream a member's private avatar blob.
 *
 * Profile photos live in a *private* Vercel Blob store, so their raw URLs
 * aren't readable without the store token. We never expose that URL; instead
 * the uploader persists a `/api/avatar?pathname=…` link and this route fetches
 * the blob server-side (with the token) and streams it back — but only to an
 * approved member. A logged-out or not-yet-approved request gets a 401, so the
 * `<img>` simply fails to load: photos are visible to vetted members only.
 *
 * Any approved member may view any member's avatar (they're shown across the
 * home header, profile pages, the family tree, and the captain roster), so the
 * gate is `isApproved` — matching the rest of the protected pages — not
 * ownership.
 */
export async function GET(req: Request) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  // Match the app-wide "can use the app" gate: a signed-in but pending /
  // rejected account must not be able to pull member photos.
  const campUser = await findCampUserByAuthId(user.id);
  if (!campUser || !isApproved(campUser, user.primaryEmail)) {
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

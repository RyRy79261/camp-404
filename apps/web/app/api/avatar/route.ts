import { NextResponse } from "next/server";
import { get } from "@vercel/blob";
import { getAuthenticatedUser } from "@/lib/auth";
import { findCampUserByAuthId, hasCampAccess, isApproved } from "@/lib/users";
import { isE2ETestMode } from "@/lib/test-mode";

export const runtime = "nodejs";

// Content types this proxy will hand back. Blobs written before the upload
// route's allow-list landed could carry any `image/*` type, including
// script-bearing `image/svg+xml`, which would execute same-origin on direct
// navigation. Anything unrecognised is treated as missing.
const SERVABLE_TYPES = new Set(["image/webp", "image/png", "image/jpeg"]);

// A questionnaire photo answer: `avatars/<auth id>/answers/<question>/…`.
const ANSWER_PHOTO = /^avatars\/([^/]+)\/answers\//;

const UNSAFE_PATH = /(^|\/)\.{1,2}(\/|$)|\/\/|\\|%/;

/**
 * Stream a private blob: a member's photo or image answer, or a picture in a
 * builder questionnaire.
 *
 * The Blob store is private, so raw blob URLs aren't readable without the
 * store token. We never expose them; uploads persist a `/api/avatar?pathname=…`
 * link and this route fetches the blob server-side and streams it back, to the
 * viewers each prefix allows:
 *
 * - `avatars/` — any approved member. Photos show across the home header,
 *   profiles, the family tree and the captain roster, so the gate is
 *   `isApproved`, not ownership.
 * - `avatars/<auth id>/answers/` — a questionnaire photo answer. Answers are
 *   captain-only data, so only the member who uploaded it and captains get
 *   it, whoever else holds the link.
 * - `builder-images/` — anyone camp-active. A questionnaire can be sent to an
 *   applicant who is not approved yet, and its pictures are camp content, not
 *   anyone's personal data.
 *
 * Any other prefix is not found. A request that does not clear its prefix's
 * gate gets a 401, so the `<img>` simply fails to load.
 */
export async function GET(req: Request) {
  const pathname = new URL(req.url).searchParams.get("pathname");
  if (!pathname) {
    return new NextResponse("Missing pathname", { status: 400 });
  }
  // One literal blob key only. A "." or ".." segment, a backslash, an empty
  // segment or an escape could be resolved into another folder by the URL the
  // blob client builds, and slip past the owner check below.
  if (UNSAFE_PATH.test(pathname)) {
    return new NextResponse("Not found", { status: 404 });
  }
  const audience = pathname.startsWith("avatars/")
    ? "approved"
    : pathname.startsWith("builder-images/")
      ? "camp"
      : null;
  if (!audience) {
    return new NextResponse("Not found", { status: 404 });
  }

  const user = await getAuthenticatedUser();
  if (!user) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  const campUser = await findCampUserByAuthId(user.id);
  const allowed =
    campUser !== null &&
    (audience === "approved"
      ? isApproved(campUser, user.primaryEmail)
      : hasCampAccess(campUser, user.primaryEmail));
  if (!allowed) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  const answerOwner = ANSWER_PHOTO.exec(pathname)?.[1];
  if (
    answerOwner !== undefined &&
    answerOwner !== user.id &&
    campUser.rank !== "captain"
  ) {
    return new NextResponse("Unauthorized", { status: 401 });
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
    if (!SERVABLE_TYPES.has(result.blob.contentType)) {
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

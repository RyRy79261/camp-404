import { NextResponse } from "next/server";
import { get } from "@vercel/blob";
import { isJoinImagePathname } from "@camp404/core";
import { isE2ETestMode } from "@/lib/test-mode";

export const runtime = "nodejs";

// One picture on the join page (#264), streamed from the private Blob store
// to anyone: the captain's preview in Camp settings reads it here, and the
// join site (apps/join) has the same route for its visitors; keep the two in
// step. Only the `join-page/` folder is served; members' photos and
// questionnaire pictures stay behind /api/avatar and its gates.

const SERVABLE_TYPES = new Set(["image/webp", "image/png", "image/jpeg"]);

export async function GET(req: Request) {
  const pathname = new URL(req.url).searchParams.get("pathname");
  if (!pathname || !isJoinImagePathname(pathname)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (isE2ETestMode() || !token) {
    // No store configured (local dev / E2E): nothing to serve.
    return new NextResponse("Not found", { status: 404 });
  }

  try {
    const result = await get(pathname, { access: "private", token });
    if (!result || result.statusCode !== 200) {
      return new NextResponse("Not found", { status: 404 });
    }
    if (!SERVABLE_TYPES.has(result.blob.contentType)) {
      return new NextResponse("Not found", { status: 404 });
    }
    return new NextResponse(result.stream, {
      headers: {
        "Content-Type": result.blob.contentType,
        // Public content, and the pathname carries a random suffix that
        // changes on every upload, so a given link never changes.
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    console.error("join-image error", err);
    return new NextResponse("Not found", { status: 404 });
  }
}

import { NextResponse } from "next/server";
import { get } from "@vercel/blob";
import { isJoinImagePathname } from "@camp404/core";

export const runtime = "nodejs";

// One picture on the join page (#264), streamed from the camp's private Blob
// store to anyone. The page's Markdown links pictures as /api/join-image, and
// the console (apps/web) has the same route for the captain's preview; keep
// the two in step. Only the `join-page/` folder is served, whatever the link
// asks for.

const SERVABLE_TYPES = new Set(["image/webp", "image/png", "image/jpeg"]);

export async function GET(req: Request) {
  const pathname = new URL(req.url).searchParams.get("pathname");
  if (!pathname || !isJoinImagePathname(pathname)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    // No store connected to this deployment: nothing to serve.
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

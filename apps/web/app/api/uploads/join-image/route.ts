import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import {
  JOIN_IMAGE_PREFIX,
  joinImageFolder,
  joinImageUrl,
} from "@camp404/core";
import { currentCycleNumber } from "@camp404/db/cycles";
import { captainActionGate } from "@/lib/captain-gate";
import { getClientIp, rateLimiter } from "@/lib/rate-limit";
import { isE2ETestMode } from "@/lib/test-mode";

export const runtime = "nodejs";

// A picture for the join page (#264), uploaded from the editor in Camp
// settings: captains only. Stored private in the camp's Blob store, the store
// every other upload uses, under `join-page/<year>/`, and handed back as the
// relative /api/join-image link the Markdown keeps. Both apps stream that
// folder to anyone, because the join page is public.
//
// Not pruned on replace or on removal from the text: a published page can
// still show a picture the draft no longer has.

const MAX_BYTES = 5 * 1024 * 1024;

// Photos, as the builder's image blocks. Never SVG: the route streams
// same-origin.
const ALLOWED_TYPES: Record<string, string> = {
  "image/webp": "webp",
  "image/png": "png",
  "image/jpeg": "jpg",
};

export async function POST(req: Request) {
  const gate = await captainActionGate("captain");
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: 403 });
  }

  for (const [bucket, limit] of [
    [`join-image-upload:${gate.campUser.id}`, 20],
    [`join-image-upload-ip:${getClientIp(req.headers)}`, 40],
  ] as const) {
    const verdict = await rateLimiter.limit(bucket, { limit });
    if (!verdict.ok) {
      return NextResponse.json(
        { error: "Too many uploads. Try again in a minute." },
        {
          status: 429,
          headers: { "Retry-After": String(verdict.retryAfterSeconds) },
        },
      );
    }
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }
  const file = form.get("image");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "Missing `image` file" },
      { status: 400 },
    );
  }
  const ext = ALLOWED_TYPES[file.type];
  if (!ext) {
    return NextResponse.json(
      { error: "The picture must be a JPEG, PNG or WebP image." },
      { status: 415 },
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "The picture is larger than 5 MB." },
      { status: 413 },
    );
  }

  if (isE2ETestMode()) {
    // Nothing is stored; the link has the stored shape, so the editor and
    // the preview treat it as a real upload.
    return NextResponse.json({
      url: joinImageUrl(`${JOIN_IMAGE_PREFIX}e2e/test-image.${ext}`),
    });
  }

  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    return NextResponse.json(
      { error: "Picture uploads aren't configured on this deployment." },
      { status: 501 },
    );
  }

  try {
    const folder = joinImageFolder(await currentCycleNumber());
    const blob = await put(`${folder}/image.${ext}`, file, {
      access: "private",
      addRandomSuffix: true,
      contentType: file.type,
      token,
    });
    return NextResponse.json({ url: joinImageUrl(blob.pathname) });
  } catch (err) {
    console.error("join-image-upload error", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 502 });
  }
}

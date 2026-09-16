import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { slugify } from "@camp404/core";
import { avatarProxyUrl } from "@/lib/avatar-blob";
import { captainActionGate } from "@/lib/captain-gate";
import { canEditQuestionnaire } from "@/lib/questionnaire-authoring";
import { getClientIp, rateLimiter } from "@/lib/rate-limit";
import { isE2ETestMode } from "@/lib/test-mode";

export const runtime = "nodejs";

// A picture for a builder questionnaire's image block (plan W8: the block was
// link-paste only, and only links into the camp's own store are allowed, so a
// captain had no way to add a picture). Stored private under
// `builder-images/<questionnaire>/`, served through /api/avatar to camp members.
//
// Not pruned on replace: a published version of the questionnaire can still
// show the old picture to members answering an open send.

const MAX_BYTES = 5 * 1024 * 1024;

// Photos and maps, not just the avatar route's WebP/PNG: an image block is
// not cropped client-side. Never SVG: the proxy streams same-origin.
const ALLOWED_TYPES: Record<string, string> = {
  "image/webp": "webp",
  "image/png": "png",
  "image/jpeg": "jpg",
};

export async function POST(req: Request) {
  // Authors only: team lead and up, approved, as the builder actions.
  const gate = await captainActionGate("team_lead");
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: 403 });
  }

  const key = new URL(req.url).searchParams.get("questionnaire");
  if (!key) {
    return NextResponse.json(
      { error: "Missing `questionnaire`" },
      { status: 400 },
    );
  }
  // The key must be a questionnaire this author may change. That also bounds
  // the folders a caller can create to real questionnaires.
  const can = await canEditQuestionnaire(gate, key);
  if (!can.ok) {
    return NextResponse.json({ error: can.error }, { status: 403 });
  }

  for (const [bucket, limit] of [
    [`builder-image-upload:${gate.campUser.id}`, 20],
    [`builder-image-upload-ip:${getClientIp(req.headers)}`, 40],
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

  const folder = `builder-images/${slugify(key) || "questionnaire"}`;
  if (isE2ETestMode()) {
    return NextResponse.json({
      url: avatarProxyUrl(`${folder}/test-image.${ext}`),
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
    const blob = await put(`${folder}/image.${ext}`, file, {
      access: "private",
      addRandomSuffix: true,
      contentType: file.type,
      token,
    });
    return NextResponse.json({ url: avatarProxyUrl(blob.pathname) });
  } catch (err) {
    console.error("builder-image-upload error", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 502 });
  }
}

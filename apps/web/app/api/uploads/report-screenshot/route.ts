import { NextResponse } from "next/server";
import type { ReportScreenshotType } from "@camp404/db/report-screenshots";
import { getAuthenticatedUser } from "@/lib/auth";
import { getClientIp, rateLimiter } from "@/lib/rate-limit";
import {
  SCREENSHOT_MAX_BYTES,
  SCREENSHOT_TOO_BIG,
  SCREENSHOT_TYPES,
  SCREENSHOT_WRONG_TYPE,
} from "@/lib/report-screenshot-copy";
import {
  screenshotBytesMatch,
  storeReportScreenshot,
} from "@/lib/report-screenshots";
import { ensureCampUser, hasCampAccess } from "@/lib/users";

export const runtime = "nodejs";

// A screenshot for a bug report (#313, owner approved 2026-10-02). Uploaded
// BEFORE the report is filed, so the public issue can truthfully say one
// exists; the report then names the id this returns. The picture is checked
// by its first bytes (PNG, JPEG or WebP, never anything that could run),
// capped at 4 MB (under Vercel's 4.5 MB request limit), and kept as a PRIVATE blob in the member's own folder
// (lib/report-screenshots.ts). It never goes to GitHub. Captains alone see it.
//
// Camp members only: sign-up is open, and a picture nobody can erase (no camp
// row) is not worth keeping. Rate-limited like the other uploads.

function refuse(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

export async function POST(req: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return refuse("Sign in again, then send it.", 401);
  const campUser = await ensureCampUser(user);
  if (!hasCampAccess(campUser, user.primaryEmail)) {
    return refuse(
      "Screenshots are for camp members. Send the report without one.",
      403,
    );
  }

  const limit = await rateLimiter.limit(`report-screenshot:${user.id}`, {
    limit: 10,
  });
  const ipLimit = await rateLimiter.limit(
    `report-screenshot-ip:${getClientIp(req.headers)}`,
    { limit: 30 },
  );
  if (!limit.ok || !ipLimit.ok) {
    return refuse("Too many uploads. Wait a few minutes and try again.", 429);
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return refuse("That didn't arrive. Try again.", 400);
  }
  const file = form.get("screenshot");
  if (!(file instanceof File) || file.size === 0) {
    return refuse("Add a screenshot, or send the report without one.", 400);
  }
  if (!Object.hasOwn(SCREENSHOT_TYPES, file.type)) {
    return refuse(SCREENSHOT_WRONG_TYPE, 415);
  }
  if (file.size > SCREENSHOT_MAX_BYTES) {
    return refuse(SCREENSHOT_TOO_BIG, 413);
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!screenshotBytesMatch(file.type, bytes.subarray(0, 16))) {
    return refuse(SCREENSHOT_WRONG_TYPE, 415);
  }

  const stored = await storeReportScreenshot({
    userId: campUser.id,
    contentType: file.type as ReportScreenshotType,
    bytes,
  });
  if (!stored.ok) return refuse(stored.error, stored.status);
  return NextResponse.json({ screenshotId: stored.id });
}

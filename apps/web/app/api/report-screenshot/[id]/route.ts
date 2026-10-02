import { NextResponse } from "next/server";
import { auditReadAfterResponse } from "@/lib/audit";
import { captainActionGate } from "@/lib/captain-gate";
import { readReportScreenshot } from "@/lib/report-screenshots";
import { SCREENSHOT_TYPES } from "@/lib/report-screenshot-copy";

export const runtime = "nodejs";

// Stream one bug report's screenshot (#313) to a captain, and to nobody else,
// whoever holds the link: a screenshot can show other members' details. Every
// serve is recorded in the audit log after the response (owner's rule: each
// opening writes an audit row), the list's small picture too, marked
// `view: "list"` so the log tells a glance from an opening. The picture opens
// inline under a sandbox, so nothing in it runs on this site.

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const gate = await captainActionGate("captain");
  if (!gate.ok) return new NextResponse("Forbidden", { status: 403 });

  const shot = await readReportScreenshot(id);
  if (!shot) return new NextResponse("Not found", { status: 404 });
  const ext = SCREENSHOT_TYPES[shot.contentType];
  if (!ext) return new NextResponse("Not found", { status: 404 });

  const view =
    new URL(req.url).searchParams.get("view") === "list" ? "list" : "open";
  auditReadAfterResponse({
    actorId: gate.campUser.id,
    action: "report_screenshot.viewed",
    target: shot.userId,
    metadata: { screenshotId: id, issueNumber: shot.issueNumber, view },
  });

  return new NextResponse(shot.body as BodyInit, {
    headers: {
      "Content-Type": shot.contentType,
      "Content-Disposition": `inline; filename="screenshot.${ext}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox; default-src 'none'",
    },
  });
}

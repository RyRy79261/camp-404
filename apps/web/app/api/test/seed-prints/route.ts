import { NextResponse } from "next/server";
import { isE2ETestMode, usesTestStore } from "@/lib/test-mode";
import { seedPrintsExample } from "@/lib/test-store-prints-seed";
import { findCampUserByAuthId } from "@/lib/users";

// Fills the E2E test store with the prints round's example camp (#249;
// lib/test-store-prints-seed.ts): the year's logistics days and attendance,
// the members the captains accepted, the camp's gear, and the trailers and
// drivers, so a spec or a screenshot run can open the burn timeline and the
// loading checklist without driving a dozen dialogs. Written as
// `authUserId`, who must already be a captain. Test store only: 404 anywhere
// else.

export const runtime = "nodejs";

interface Body {
  authUserId?: string;
}

export async function POST(req: Request) {
  if (!isE2ETestMode() || !usesTestStore()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const body = (await req.json().catch(() => ({}))) as Body;
  const user = body.authUserId
    ? await findCampUserByAuthId(body.authUserId)
    : null;
  if (!user) {
    return NextResponse.json(
      { error: "authUserId of an existing user is required" },
      { status: 400 },
    );
  }
  try {
    seedPrintsExample(user.id);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 409 },
    );
  }
  return NextResponse.json({ ok: true });
}

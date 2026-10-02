import { NextResponse } from "next/server";
import { isE2ETestMode, usesTestStore } from "@/lib/test-mode";
import { testLayoutStore } from "@/lib/test-store-layout";
import { findCampUserByAuthId } from "@/lib/users";

// Saves a whole site plan as the next version this year, as the given test
// user (who must be allowed to: a captain or a Structures lead), so a spec
// can start from a plan the size of the camp's instead of drawing thirty
// pieces with the keyboard. It goes through the twin's own save, so the
// plan is checked exactly as the editor's Save is. Mirrors /api/test/seed-lift.
//
// Test store only.

export const runtime = "nodejs";

interface Body {
  authUserId?: string;
  layout?: unknown;
  note?: string;
}

export async function POST(req: Request) {
  if (!isE2ETestMode() || !usesTestStore()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const body = (await req.json().catch(() => ({}))) as Body;
  if (!body.authUserId || !body.layout) {
    return NextResponse.json(
      { error: "authUserId and layout required" },
      { status: 400 },
    );
  }
  const user = await findCampUserByAuthId(body.authUserId);
  if (!user) {
    return NextResponse.json(
      { error: `No user for authUserId ${body.authUserId}` },
      { status: 404 },
    );
  }
  const result = testLayoutStore.saveCampLayout({
    actorId: user.id,
    layout: body.layout as never,
    expectedVersion: testLayoutStore.getCampLayout().version,
    note: body.note ?? null,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true, version: result.version });
}

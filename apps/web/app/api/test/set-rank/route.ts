import { NextResponse } from "next/server";
import { isE2ETestMode } from "@/lib/test-mode";
import { testStore } from "@/lib/test-store";

// Forces a test user's rank, so specs can exercise captain-only surfaces
// (announcements, camp management) without minting a captain-tier invite and
// walking the redeem flow. The user row must already exist (created lazily on
// their first authenticated page load). Mirrors /api/test/set-approval.

export const runtime = "nodejs";

interface Body {
  authUserId?: string;
  rank?: "captain" | "member";
}

export async function POST(req: Request) {
  if (!isE2ETestMode()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const body = (await req.json().catch(() => ({}))) as Body;
  if (!body.authUserId || (body.rank !== "captain" && body.rank !== "member")) {
    return NextResponse.json(
      { error: "authUserId and rank (captain|member) required" },
      { status: 400 },
    );
  }
  const user = testStore.findUserByAuthId(body.authUserId);
  if (!user) {
    return NextResponse.json(
      { error: `No user for authUserId ${body.authUserId}` },
      { status: 404 },
    );
  }
  testStore.setUserRank(user.id, body.rank);
  return NextResponse.json({ ok: true });
}

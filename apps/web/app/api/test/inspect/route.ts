import { NextResponse } from "next/server";
import { isE2ETestMode } from "@/lib/test-mode";
import { testStore } from "@/lib/test-store";

// Read-only view into the in-memory test store. Lets specs assert on
// internal state (e.g. "did this user's row record the invite code that
// the other user issued?") without hitting any real DB.

export const runtime = "nodejs";

export async function GET(req: Request) {
  if (!isE2ETestMode()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const url = new URL(req.url);
  const authUserId = url.searchParams.get("authUserId");
  const code = url.searchParams.get("code");

  if (authUserId) {
    const user = testStore.findUserByAuthId(authUserId);
    if (!user) return NextResponse.json({ user: null });
    const invite = user.inviteCode
      ? testStore.findUsableInviteCode(user.inviteCode) ??
        ({ code: user.inviteCode, createdByUserId: null } as const)
      : null;
    return NextResponse.json({
      user,
      inviteCode: invite,
    });
  }

  if (code) {
    return NextResponse.json({
      inviteCode: testStore.findUsableInviteCode(code),
    });
  }

  return NextResponse.json(
    { error: "Pass ?authUserId=... or ?code=..." },
    { status: 400 },
  );
}

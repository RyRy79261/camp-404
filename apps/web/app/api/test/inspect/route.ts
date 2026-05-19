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
  const stackUserId = url.searchParams.get("stackUserId");
  const code = url.searchParams.get("code");

  if (stackUserId) {
    const user = testStore.findUserByStackId(stackUserId);
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
    { error: "Pass ?stackUserId=... or ?code=..." },
    { status: 400 },
  );
}

import { NextResponse } from "next/server";
import { isE2ETestMode, usesTestStore } from "@/lib/test-mode";
import { testStore } from "@/lib/test-store";
import { findCampUserByAuthId } from "@/lib/users";

// Stands in for a member tapping Start in their chat with Ol' Jeb: uses the
// newest Connect Telegram link the member made, as `/start <code>` would at
// the webhook, so a spec can drive the Profile's Telegram card from Waiting to
// On. Test store only.

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!isE2ETestMode() || !usesTestStore()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const body = (await req.json().catch(() => ({}))) as {
    authUserId?: string;
    username?: string;
  };
  if (!body.authUserId) {
    return NextResponse.json({ error: "authUserId required" }, { status: 400 });
  }
  const user = await findCampUserByAuthId(body.authUserId);
  if (!user) {
    return NextResponse.json(
      { error: `No user for authUserId ${body.authUserId}` },
      { status: 404 },
    );
  }
  const result = testStore.tapTelegramStart(user.id, body.username ?? null);
  return NextResponse.json(result, { status: result.ok ? 200 : 409 });
}

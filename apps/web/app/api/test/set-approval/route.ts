import { NextResponse } from "next/server";
import { isE2ETestMode } from "@/lib/test-mode";
import { testStore } from "@/lib/test-store";

// Forces a test user's captain-approval status, so specs can exercise the
// gate's rejected/approved branches without driving the captain
// camp-management UI (which reads the real Neon DB, not the in-memory store,
// and so isn't reachable under E2E_TEST_MODE). The user row must already
// exist (created lazily on their first authenticated page load).

export const runtime = "nodejs";

interface Body {
  authUserId?: string;
  status?: "pending" | "approved" | "rejected";
}

export async function POST(req: Request) {
  if (!isE2ETestMode()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const body = (await req.json().catch(() => ({}))) as Body;
  if (
    !body.authUserId ||
    (body.status !== "pending" &&
      body.status !== "approved" &&
      body.status !== "rejected")
  ) {
    return NextResponse.json(
      { error: "authUserId and status (pending|approved|rejected) required" },
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
  testStore.setUserApprovalStatus(user.id, body.status);
  return NextResponse.json({ ok: true });
}

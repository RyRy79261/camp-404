import { NextResponse } from "next/server";
import { isE2ETestMode } from "@/lib/test-mode";
import {
  findCampUserByAuthId,
  satisfyBurnerProfileAction,
  upsertBurnerProfile,
} from "@/lib/users";

// Marks a test user's burner-profile onboarding complete, so specs can reach
// the post-onboarding gates (home, /pending-approval) without walking the
// questionnaire UI — that walk is covered at the component layer in
// `components/__tests__/wizard.test.tsx`. The user row must already exist
// (created lazily on their first authenticated page load). Goes through the
// lib/users facades, so it writes the store or, in the real-database run, the
// local database.

export const runtime = "nodejs";

interface Body {
  authUserId?: string;
}

export async function POST(req: Request) {
  if (!isE2ETestMode()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const body = (await req.json().catch(() => ({}))) as Body;
  if (!body.authUserId) {
    return NextResponse.json(
      { error: "authUserId is required" },
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
  await upsertBurnerProfile({
    userId: user.id,
    version: "e2e-test",
    responses: {},
    markComplete: true,
  });
  // Finishing the profile satisfies its gate, as the real save does.
  await satisfyBurnerProfileAction(user.id);
  return NextResponse.json({ ok: true });
}

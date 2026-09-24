import { NextResponse } from "next/server";
import { z } from "zod";
import { PARTICIPATION_STATUSES } from "@camp404/types";
import { seedParticipationForE2E } from "@camp404/db/e2e";
import { isE2ETestMode, usesTestStore } from "@/lib/test-mode";
import { testStore } from "@/lib/test-store";
import { findCampUserByAuthId } from "@/lib/users";

// Puts a test user at an attendance status for this year, so a spec can show
// the roster's "This year" column or a captain's Accept / Waiting list control
// without driving the questionnaire (which the in-memory store does not model).
// Mirrors /api/test/seed-team. The user row must already exist (created on
// their first page load).

export const runtime = "nodejs";

const Body = z.object({
  authUserId: z.string().min(1),
  status: z.enum(PARTICIPATION_STATUSES),
});

export async function POST(req: Request) {
  if (!isE2ETestMode()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const body = Body.safeParse(await req.json().catch(() => ({})));
  if (!body.success) {
    return NextResponse.json(
      {
        error: `authUserId and a status (${PARTICIPATION_STATUSES.join("|")}) are required`,
      },
      { status: 400 },
    );
  }
  const { authUserId, status } = body.data;
  const user = await findCampUserByAuthId(authUserId);
  if (!user) {
    return NextResponse.json(
      { error: `No user for authUserId ${authUserId}` },
      { status: 404 },
    );
  }
  if (usesTestStore()) {
    testStore.seedParticipation({ userId: user.id, status });
  } else {
    await seedParticipationForE2E(user.id, status);
  }
  return NextResponse.json({ ok: true });
}

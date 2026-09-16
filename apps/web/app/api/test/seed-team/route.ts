import { NextResponse } from "next/server";
import { Team } from "@camp404/types";
import { isE2ETestMode } from "@/lib/test-mode";
import { testStore } from "@/lib/test-store";

// Puts a test user on a team for this year, leading it or not, so a spec can
// stand up a team-lead persona without driving the captain roster panel
// (whose member detail reads the real database). Mirrors /api/test/set-rank.
// The user row must already exist (created on their first page load).

export const runtime = "nodejs";

interface Body {
  authUserId?: string;
  team?: string;
  isLead?: boolean;
}

export async function POST(req: Request) {
  if (!isE2ETestMode()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const body = (await req.json().catch(() => ({}))) as Body;
  const team = Team.safeParse(body.team);
  if (!body.authUserId || !team.success) {
    return NextResponse.json(
      { error: "authUserId and a team key are required" },
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
  testStore.seedTeamMembership({
    userId: user.id,
    team: team.data,
    isLead: body.isLead === true,
  });
  return NextResponse.json({ ok: true });
}

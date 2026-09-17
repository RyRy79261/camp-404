import { NextResponse } from "next/server";
import { Team } from "@camp404/types";
import { assignTeam, setLead } from "@camp404/db/team-memberships";
import { isE2ETestMode, usesTestStore } from "@/lib/test-mode";
import { testStore } from "@/lib/test-store";
import { findCampUserByAuthId } from "@/lib/users";

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
  const user = await findCampUserByAuthId(body.authUserId);
  if (!user) {
    return NextResponse.json(
      { error: `No user for authUserId ${body.authUserId}` },
      { status: 404 },
    );
  }
  if (usesTestStore()) {
    testStore.seedTeamMembership({
      userId: user.id,
      team: team.data,
      isLead: body.isLead === true,
    });
  } else {
    await assignTeam({ userId: user.id, team: team.data, actorId: null });
    if (body.isLead === true) {
      await setLead({
        userId: user.id,
        team: team.data,
        isLead: true,
        actorId: null,
      });
    }
  }
  return NextResponse.json({ ok: true });
}

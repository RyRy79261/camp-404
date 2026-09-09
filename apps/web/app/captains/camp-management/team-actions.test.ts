import { beforeEach, describe, expect, it, vi } from "vitest";
// Type-only, so it is erased before the vi.mock factories hoist above it.
import type * as CampConfigModule from "@/lib/camp-config";

// Unit tests for the captain-gated team write actions. The gate collaborators
// and the @camp404/db writers are mocked; the ARCHIVED-TEAM RULE is exercised
// against the real `activeTeams` from the config layer, because "archived teams
// must not be assignable" is the assertion this file exists for.

vi.mock("@/lib/auth", () => ({ getAuthenticatedUser: vi.fn() }));
vi.mock("@/lib/users", () => ({
  ensureCampUser: vi.fn(),
  hasCampAccess: vi.fn(() => true),
  isApproved: vi.fn(() => true),
  decideUserApproval: vi.fn(),
}));
vi.mock("@/lib/promotion", () => ({
  getOpenPromotionForTarget: vi.fn(),
  sendCaptainPromotion: vi.fn(),
  getPromotionRequestById: vi.fn(),
  decideCaptainPromotion: vi.fn(),
}));
vi.mock("@camp404/db/roster", () => ({ getCampMemberDetail: vi.fn() }));
vi.mock("@camp404/db/crypto", () => ({
  decryptField: vi.fn(() => ({ state: "absent", value: null })),
}));
vi.mock("@camp404/db/team-memberships", () => ({
  assignTeam: vi.fn(async () => ({ created: true, cycle: 2027 })),
  removeTeam: vi.fn(async () => ({ removed: true, cycle: 2027 })),
  setLead: vi.fn(async () => ({ ok: true, changed: true })),
  getTeamMemberships: vi.fn(async () => []),
}));
vi.mock("@/lib/camp-config", async (importOriginal) => ({
  // Spread the real module so `activeTeams` — the archived filter itself —
  // stays REAL; only the database read is stubbed.
  ...(await importOriginal<typeof CampConfigModule>()),
  getTeamsConfig: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  assignTeamAction,
  removeTeamAction,
  setTeamLeadAction,
} from "./actions";
import { getAuthenticatedUser } from "@/lib/auth";
import { ensureCampUser, hasCampAccess, isApproved } from "@/lib/users";
import { getTeamsConfig } from "@/lib/camp-config";
import {
  assignTeam,
  getTeamMemberships,
  removeTeam,
  setLead,
} from "@camp404/db/team-memberships";

const CAPTAIN = "cap-1";

function signInAsCaptain() {
  vi.mocked(getAuthenticatedUser).mockResolvedValue({
    id: "auth-cap",
    primaryEmail: "cap@example.com",
  } as never);
  vi.mocked(ensureCampUser).mockResolvedValue({
    id: CAPTAIN,
    rank: "captain",
  } as never);
}

function signInAsMember() {
  vi.mocked(getAuthenticatedUser).mockResolvedValue({
    id: "auth-mem",
    primaryEmail: "mem@example.com",
  } as never);
  vi.mocked(ensureCampUser).mockResolvedValue({
    id: "mem-1",
    rank: "member",
  } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(hasCampAccess).mockReturnValue(true);
  vi.mocked(isApproved).mockReturnValue(true);
  vi.mocked(getTeamMemberships).mockResolvedValue([]);
  vi.mocked(getTeamsConfig).mockResolvedValue({
    teams: [
      { key: "kitchen", label: "Kitchen", order: 0, archived: false },
      { key: "ministry_of_memes", label: "Memes", order: 1, archived: true },
    ],
  });
});

describe("the captain gate", () => {
  it("refuses every team write for a non-captain, and writes nothing", async () => {
    signInAsMember();

    const results = await Promise.all([
      assignTeamAction("member-1", "kitchen"),
      removeTeamAction("member-1", "kitchen"),
      setTeamLeadAction("member-1", "kitchen", true),
    ]);

    for (const res of results) {
      expect(res).toEqual({ ok: false, error: "Captain access only." });
    }
    expect(assignTeam).not.toHaveBeenCalled();
    expect(removeTeam).not.toHaveBeenCalled();
    expect(setLead).not.toHaveBeenCalled();
  });

  it("refuses a signed-out caller", async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue(null as never);
    expect(await assignTeamAction("member-1", "kitchen")).toEqual({
      ok: false,
      error: "Not signed in.",
    });
    expect(assignTeam).not.toHaveBeenCalled();
  });
});

describe("assignTeamAction", () => {
  it("assigns an active team, crediting the acting captain", async () => {
    signInAsCaptain();
    const teams = [{ team: "kitchen" as const, isLead: false, cycle: 2027 }];
    vi.mocked(getTeamMemberships).mockResolvedValue(teams);

    expect(await assignTeamAction("member-1", "kitchen")).toEqual({
      ok: true,
      teams,
    });
    expect(assignTeam).toHaveBeenCalledWith({
      userId: "member-1",
      team: "kitchen",
      actorId: CAPTAIN,
    });
  });

  it("REFUSES an archived team — it is not assignable", async () => {
    signInAsCaptain();

    expect(await assignTeamAction("member-1", "ministry_of_memes")).toEqual({
      ok: false,
      error: "That team isn't active.",
    });
    expect(assignTeam).not.toHaveBeenCalled();
  });

  it("refuses a team key the database enum doesn't know", async () => {
    signInAsCaptain();

    expect(await assignTeamAction("member-1", "not_a_team")).toEqual({
      ok: false,
      error: "Unknown team.",
    });
    expect(assignTeam).not.toHaveBeenCalled();
  });

  it("refuses an empty member id before it reaches the writer", async () => {
    signInAsCaptain();

    expect(await assignTeamAction("", "kitchen")).toEqual({
      ok: false,
      error: "Invalid member.",
    });
    expect(assignTeam).not.toHaveBeenCalled();
  });
});

describe("removeTeamAction", () => {
  it("ALLOWS removing a member from an archived team", async () => {
    signInAsCaptain();

    // Archiving a team must not strand the members left on it.
    expect(await removeTeamAction("member-1", "ministry_of_memes")).toEqual({
      ok: true,
      teams: [],
    });
    expect(removeTeam).toHaveBeenCalledWith({
      userId: "member-1",
      team: "ministry_of_memes",
      actorId: CAPTAIN,
    });
  });
});

describe("setTeamLeadAction", () => {
  it("sets the lead flag on an active team", async () => {
    signInAsCaptain();

    expect(await setTeamLeadAction("member-1", "kitchen", true)).toEqual({
      ok: true,
      teams: [],
    });
    expect(setLead).toHaveBeenCalledWith({
      userId: "member-1",
      team: "kitchen",
      isLead: true,
      actorId: CAPTAIN,
    });
  });

  it("tells the captain to assign the team first when they aren't on it", async () => {
    signInAsCaptain();
    vi.mocked(setLead).mockResolvedValue({
      ok: false,
      reason: "not_a_member",
    });

    expect(await setTeamLeadAction("member-1", "kitchen", true)).toEqual({
      ok: false,
      error: "Add them to the team first.",
    });
  });

  it("refuses to appoint a lead of an archived team", async () => {
    signInAsCaptain();

    expect(
      await setTeamLeadAction("member-1", "ministry_of_memes", true),
    ).toEqual({ ok: false, error: "That team isn't active." });
    expect(setLead).not.toHaveBeenCalled();
  });
});

describe("a thrown writer becomes the typed failure arm", () => {
  it("never leaks the driver's message", async () => {
    signInAsCaptain();
    vi.mocked(assignTeam).mockRejectedValue(
      new Error('duplicate key value violates unique constraint "x"'),
    );
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await assignTeamAction("member-1", "kitchen");

    expect(res).toEqual({
      ok: false,
      error: "Something went wrong. Please try again.",
    });
    logged.mockRestore();
  });
});

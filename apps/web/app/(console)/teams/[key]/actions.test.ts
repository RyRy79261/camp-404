import { beforeEach, describe, expect, it, vi } from "vitest";

// A team program's description (owner's rulings 1 and 4,
// 2026-09-27). What matters here:
//  1. Only a captain or a lead OF THAT TEAM gets through: a lead of another
//     team stands on the same global rung and is refused before the facade
//     is called; a member is refused by the rank gate.
//  2. The text is checked at the boundary (its length); no links pass.
//  3. The write names the signed-in actor and nothing else: never a team list.
// The rule is checked again inside the write (packages/db, on PGlite).

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn() }));
vi.mock("@/lib/captain-gate", () => ({ captainActionGate: vi.fn() }));
vi.mock("@/lib/users", () => ({ getLeadTeams: vi.fn(async () => []) }));
vi.mock("@/lib/team-programs", () => ({
  saveTeamProgram: vi.fn(async () => ({ ok: true, version: 3 })),
}));

import { revalidatePath } from "next/cache";
import type { ViewerRank } from "@camp404/types";
import { captainActionGate } from "@/lib/captain-gate";
import { TEAM_PROGRAM_REFUSAL } from "@/lib/team-program-copy";
import { saveTeamProgram } from "@/lib/team-programs";
import { getLeadTeams } from "@/lib/users";
import { saveTeamProgramAction } from "./actions";

const LADDER: ViewerRank[] = ["camp_member", "team_lead", "captain"];

function actAs(rank: ViewerRank, led: string[] = [], id = "user-1") {
  vi.mocked(captainActionGate).mockImplementation(async (required, refusal) =>
    LADDER.indexOf(rank) >= LADDER.indexOf(required)
      ? { ok: true, campUser: { id } as never, rank }
      : { ok: false, error: refusal ?? "refused" },
  );
  vi.mocked(getLeadTeams).mockResolvedValue(led);
}

const INPUT = {
  team: "power_and_lighting",
  description: "Lights, freezers, the generator.",
  expectedVersion: 2,
};

describe("saveTeamProgramAction", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lets the team's lead save, as themselves, and refreshes the program", async () => {
    actAs("team_lead", ["power_and_lighting"], "lead-1");
    expect(await saveTeamProgramAction(INPUT)).toEqual({
      ok: true,
      data: { version: 3 },
    });
    expect(saveTeamProgram).toHaveBeenCalledWith({
      ...INPUT,
      actorId: "lead-1",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/teams/power_and_lighting");
  });

  it("lets a captain save any team", async () => {
    actAs("captain", [], "cap-1");
    expect(
      await saveTeamProgramAction({ ...INPUT, team: "water" }),
    ).toMatchObject({ ok: true });
    expect(saveTeamProgram).toHaveBeenCalledWith(
      expect.objectContaining({ team: "water", actorId: "cap-1" }),
    );
  });

  it("refuses a lead of another team, and a member, before any write", async () => {
    actAs("team_lead", ["kitchen"]);
    expect(await saveTeamProgramAction(INPUT)).toEqual({
      ok: false,
      error: TEAM_PROGRAM_REFUSAL,
    });
    actAs("camp_member");
    expect(await saveTeamProgramAction(INPUT)).toEqual({
      ok: false,
      error: TEAM_PROGRAM_REFUSAL,
    });
    expect(saveTeamProgram).not.toHaveBeenCalled();
  });

  it("refuses a description over the limit, with the sentence", async () => {
    actAs("captain");
    expect(
      await saveTeamProgramAction({ ...INPUT, description: "x".repeat(301) }),
    ).toEqual({
      ok: false,
      error: "Keep the description under 300 characters.",
    });
    expect(saveTeamProgram).not.toHaveBeenCalled();
  });

  it("never passes links on to the write", async () => {
    actAs("captain", [], "cap-1");
    await saveTeamProgramAction({
      ...INPUT,
      links: [{ label: "Drive", url: "https://drive.google.com" }],
    });
    expect(saveTeamProgram).toHaveBeenCalledWith({
      ...INPUT,
      actorId: "cap-1",
    });
  });

  it("passes the write's own refusal through", async () => {
    actAs("team_lead", ["power_and_lighting"]);
    vi.mocked(saveTeamProgram).mockResolvedValueOnce({
      ok: false,
      error: "Someone changed this team's description first. Reload the page.",
    });
    expect(await saveTeamProgramAction(INPUT)).toEqual({
      ok: false,
      error: "Someone changed this team's description first. Reload the page.",
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

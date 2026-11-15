// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("../../help-wanted", () => ({ getHelpWantedView: vi.fn() }));
vi.mock("../reads", () => ({
  readNames: vi.fn(
    async (ids: string[]) => new Map(ids.map((id) => [id, "Pat Mokoena"])),
  ),
  readTeamLabels: vi.fn(async () => ({ kitchen: "Kitchen" })),
}));

import type {
  HelpWantedRoleView,
  HelpWantedTeamView,
  HelpWantedView,
} from "../../help-wanted";
import { getHelpWantedView } from "../../help-wanted";
import { HELP_WANTED_REFUSAL } from "../../help-wanted-copy";
import type { McpScope } from "../../mcp/scope";
import { HELP_WANTED_PREVIEWS } from "../previews-help-wanted";

// Help wanted's voice previews: the role and team are named from the board
// as this person sees it, the version is the role's own, and a role that is
// not there, or not theirs to run, is blocked before Do.

const ME = "11111111-1111-4111-8111-111111111111";
const PAT = "33333333-3333-4333-8333-333333333333";
const ROLE = "22222222-2222-4222-8222-222222222222";

const member: McpScope = {
  campUserId: ME,
  rank: "member",
  viewerRank: "camp_member",
  leadTeams: [],
  memberTeams: [],
  isDriver: false,
  isCaptain: false,
};
const kitchenLead: McpScope = {
  ...member,
  viewerRank: "team_lead",
  leadTeams: ["kitchen"],
  memberTeams: ["kitchen"],
};
const at = (scope: McpScope) => ({ scope, now: new Date() });

function role(over: Partial<HelpWantedRoleView> = {}): HelpWantedRoleView {
  return {
    key: ROLE,
    roleId: ROLE,
    isLead: false,
    name: "Shopper",
    note: null,
    places: 2,
    filled: 1,
    open: true,
    version: 5,
    people: [{ userId: null, name: "Sam K.", you: false }],
    keen: null,
    action: "keen",
    canEdit: false,
    canTake: false,
    ...over,
  };
}

function board(
  rows: HelpWantedRoleView[],
  over: Partial<HelpWantedTeamView> = {},
): HelpWantedView {
  return {
    cycle: 2027,
    year: 2027,
    teams: [
      {
        key: "kitchen",
        label: "Kitchen",
        mine: false,
        manages: false,
        lead: { filled: 1, places: 1 },
        roles: [],
        rows,
        leadNames: [],
        lastYear: [],
        memberIds: null,
        ...over,
      },
    ],
    summary: {} as HelpWantedView["summary"],
    keenCount: 0,
    everyone: null,
    picksLead: false,
  };
}

describe("help wanted previews", () => {
  it("says you're keen on the role the board names, or blocks a second press", async () => {
    vi.mocked(getHelpWantedView).mockResolvedValue(board([role()]));
    const p = await HELP_WANTED_PREVIEWS.set_my_keen!(
      { team: "kitchen", roleId: ROLE, keen: true },
      at(member),
    );
    expect(p.blocked).toBeUndefined();
    expect(p.sentence).toBe("Say you're keen on “Shopper” in Kitchen");
    vi.mocked(getHelpWantedView).mockResolvedValue(
      board([role({ action: "unkeen" })]),
    );
    const again = await HELP_WANTED_PREVIEWS.set_my_keen!(
      { team: "kitchen", roleId: ROLE, keen: true },
      at(member),
    );
    expect(again.blocked).toBe("You're keen on it already.");
  });

  it("changes a role at the version read, for its team's lead only", async () => {
    vi.mocked(getHelpWantedView).mockResolvedValue(
      board([role()], { manages: true }),
    );
    const p = await HELP_WANTED_PREVIEWS.update_team_role!(
      { team: "kitchen", roleId: ROLE, expectedVersion: 1, places: 3 },
      at(kitchenLead),
    );
    expect(p.blocked).toBeUndefined();
    expect(p.args).toMatchObject({ expectedVersion: 5 });
    expect(p.change).toEqual(["Places: 3"]);

    vi.mocked(getHelpWantedView).mockResolvedValue(board([role()]));
    const refused = await HELP_WANTED_PREVIEWS.update_team_role!(
      { team: "kitchen", roleId: ROLE, expectedVersion: 5, places: 3 },
      at(member),
    );
    expect(refused.blocked).toBe(HELP_WANTED_REFUSAL);
  });

  it("names who a role goes to, and keeps Lead a captain's", async () => {
    vi.mocked(getHelpWantedView).mockResolvedValue(
      board([role(), role({ roleId: null, isLead: true, name: "Lead" })], {
        manages: true,
        memberIds: [],
      }),
    );
    const give = await HELP_WANTED_PREVIEWS.give_team_role!(
      { team: "kitchen", roleId: ROLE, userId: PAT },
      at(kitchenLead),
    );
    expect(give.blocked).toBeUndefined();
    expect(give.sentence).toBe(
      "Give Pat Mokoena the role “Shopper” in Kitchen",
    );
    expect(give.facts).toContain("puts Pat Mokoena on Kitchen");
    const lead = await HELP_WANTED_PREVIEWS.give_team_role!(
      { team: "kitchen", roleId: null, userId: PAT },
      at(kitchenLead),
    );
    expect(lead.blocked).toBe("Only a captain can pick a team's lead.");
  });

  it("blocks a role that is not on the board", async () => {
    vi.mocked(getHelpWantedView).mockResolvedValue(board([]));
    const p = await HELP_WANTED_PREVIEWS.take_team_role!(
      { team: "kitchen", roleId: ROLE, userId: PAT },
      at(kitchenLead),
    );
    expect(p.blocked).toBe("That role isn't on Help wanted this year.");
  });
});

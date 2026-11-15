import { HELP_WANTED_REFUSAL } from "../../help-wanted-copy";
import { atLeast, GATES, type Gate, type ToolCapability } from "../gates";

// Help wanted (owner's pick A, 2026-10-09). "I'm keen" is any approved
// member's, for themselves. Running a team's roles needs the team-lead rung
// at the door (the actions' captainActionGate("team_lead")); WHICH team (a
// lead of that team, or a captain: roleKeeper) is the tool's own check, and
// the Lead role is a captain's (LEAD_PICKER), both made again by the write.
// Removing a role stays on the page.

export const ROLE_KEEPER_GATE: Gate = {
  who: "Captains, and team leads for their own team's roles",
  allows: atLeast("team_lead"),
  refusal: HELP_WANTED_REFUSAL,
};

const PAGE = "/help-wanted";

export const HELP_WANTED_CAPABILITIES: Readonly<
  Record<string, ToolCapability>
> = {
  get_help_wanted: {
    kind: "read",
    area: "Help wanted",
    gate: GATES.member,
    does: "Every team's roles this year, who fills them, and what you are keen on.",
    page: PAGE,
  },
  set_my_keen: {
    kind: "write",
    area: "Help wanted",
    gate: GATES.member,
    does: "Say you're keen on a team's role, or take that back.",
    page: PAGE,
  },
  add_team_role: {
    kind: "write",
    area: "Help wanted",
    gate: ROLE_KEEPER_GATE,
    does: "Add a role to a team this year.",
    page: PAGE,
  },
  update_team_role: {
    kind: "write",
    area: "Help wanted",
    gate: ROLE_KEEPER_GATE,
    does: "Change a role's name, places or note.",
    page: PAGE,
  },
  set_lead_places: {
    kind: "write",
    area: "Help wanted",
    gate: ROLE_KEEPER_GATE,
    does: "Say how many leads a team wants this year.",
    page: PAGE,
  },
  copy_last_years_roles: {
    kind: "write",
    area: "Help wanted",
    gate: ROLE_KEEPER_GATE,
    does: "Bring back a team's roles from the last year it had any, empty.",
    page: PAGE,
  },
  give_team_role: {
    kind: "write",
    area: "Help wanted",
    gate: ROLE_KEEPER_GATE,
    does: "Give someone a team's role (Lead: captains only).",
    page: PAGE,
  },
  take_team_role: {
    kind: "write",
    area: "Help wanted",
    gate: ROLE_KEEPER_GATE,
    does: "Take a team's role back from someone (Lead: captains only).",
    page: PAGE,
  },
};

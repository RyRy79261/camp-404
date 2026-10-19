import "server-only";

import * as rosterDb from "@camp404/db/roster";
import type { CampHeadcount, CampManagementMember } from "@camp404/db/roster";
import * as teams from "@camp404/db/team-memberships";
import type {
  SetLeadResult,
  TeamCoverage,
  TeamPerson,
  TeamWriteInput,
} from "@camp404/db/team-memberships";
import * as activations from "@camp404/db/activations";
import * as notes from "@camp404/db/member-notes";
import type { MemberNote } from "@camp404/db/member-notes";
import { testStore } from "./test-store";
import { twin } from "./twin";

// Camp-management roster data facade: the captain roster, the member panel's
// reads and the team writes, from the database or, under E2E, the test store,
// so the captain roster renders without a database during Playwright runs.
// The captain pages import the reads from here; the pure view-models stay in
// `lib/camp-roster.ts`. lib/__tests__/memberships-agreement.test.ts holds the
// two sides equal.

export type { CampHeadcount, CampManagementMember, TeamCoverage, TeamPerson };

// The store keeps no audit log, so the captain's id stops here; it models no
// captain notes, so a panel opened in E2E has none.
const storeTeams = {
  getTeamCoverage: () => testStore.getTeamCoverage(),
  listTeamPeople: (team: TeamWriteInput["team"]) =>
    testStore.listTeamPeople(team),
  getTeamMemberships: (userId: string) => testStore.getTeamMemberships(userId),
  assignTeam: ({ userId, team }: TeamWriteInput) =>
    testStore.assignTeam({ userId, team }),
  removeTeam: ({ userId, team }: TeamWriteInput) =>
    testStore.removeTeam({ userId, team }),
  setLead: ({
    userId,
    team,
    isLead,
  }: TeamWriteInput & { isLead: boolean }): SetLeadResult =>
    testStore.setLead({ userId, team, isLead }),
};

const roster = twin(rosterDb, testStore, [
  "getCampHeadcount",
  "getCampManagementRoster",
  "getCampMemberDetail",
]);
const team = twin(teams, storeTeams, [
  "getTeamCoverage",
  "listTeamPeople",
  "getTeamMemberships",
  "assignTeam",
  "removeTeam",
  "setLead",
]);
const gates = twin(activations, testStore, ["listMemberQuestionnaireGates"]);
const captainNotes = twin(
  notes,
  { listMemberNotes: (_userId: string): MemberNote[] => [] },
  ["listMemberNotes"],
);

/**
 * The camp's approved members and waiting sign-ups: the captain's Start menu
 * header. Captain-only; the console layout asks only for a captain.
 */
export const getCampHeadcount = roster.getCampHeadcount;

/** Pass `includeEmail` only for a captain viewer. */
export const getCampManagementRoster = roster.getCampManagementRoster;

/**
 * Head count and lead count per team for THIS year — the Overview's coverage
 * rail. Only teams somebody is on come back; the caller renders the camp's
 * configured teams and fills the missing ones in as empty, so a team with
 * nobody on it still shows.
 */
export const getTeamCoverage = team.getTeamCoverage;

/**
 * Everyone on one team this year, leads first — the team page's people. Only
 * what the member roster shows every approved member, so any approved member's
 * page may read it.
 */
export const listTeamPeople = team.listTeamPeople;

// --- The captain member panel's reads ----------------------------------------
// getMemberDetailAction reads these four. They route here so Playwright can
// open a member on /captains/camp-management; each is captain-gated by the
// action, never by this module.

/** One member's detail. Pass the include* options only for a captain viewer. */
export const getCampMemberDetail = roster.getCampMemberDetail;

/** This year's team memberships for one member. */
export const getTeamMemberships = team.getTeamMemberships;

/** Captain notes on one member, newest first. */
export const listMemberNotes = captainNotes.listMemberNotes;

/** One member's questionnaire gates, oldest first. */
export const listMemberQuestionnaireGates = gates.listMemberQuestionnaireGates;

// --- The captain member panel's team writes ----------------------------------
// assignTeamAction, removeTeamAction and setTeamLeadAction write through these,
// so Playwright can put a member on a team and make them its lead. The action
// gates them to captains and resolves the team key first; this module does not.

/** Put a member on a team for THIS year. Idempotent; never sets the lead flag. */
export const assignTeam = team.assignTeam;

/** Take a member off a team for THIS year. Idempotent; prior years survive. */
export const removeTeam = team.removeTeam;

/** Set or clear the lead flag on a membership that exists THIS year. */
export const setLead = team.setLead;

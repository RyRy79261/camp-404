import "server-only";

import {
  getCampManagementRoster as dbGetCampManagementRoster,
  getCampMemberDetail as dbGetCampMemberDetail,
  type CampManagementMember,
  type CampManagementRosterOptions,
  type CampMemberDetail,
  type CampMemberDetailOptions,
} from "@camp404/db/roster";
import {
  assignTeam as dbAssignTeam,
  getTeamCoverage as dbGetTeamCoverage,
  getTeamMemberships as dbGetTeamMemberships,
  listTeamPeople as dbListTeamPeople,
  removeTeam as dbRemoveTeam,
  setLead as dbSetLead,
  type SetLeadResult,
  type TeamCoverage,
  type TeamMembership,
  type TeamPerson,
  type TeamWriteInput,
  type Team,
} from "@camp404/db/team-memberships";
import { listMemberQuestionnaireGates as dbListMemberQuestionnaireGates } from "@camp404/db/activations";
import {
  listMemberNotes as dbListMemberNotes,
  type MemberNote,
} from "@camp404/db/member-notes";
import { usesTestStore } from "./test-mode";
import { testStore } from "./test-store";

// Camp-management roster data facade. Routes through the Neon-backed
// `@camp404/db/roster` query normally, and through the in-memory test store under
// E2E_TEST_MODE — the same real-vs-test split `lib/notifications.ts` /
// `lib/promotion.ts` use, so the captain roster renders without a database during
// Playwright runs. The captain pages import the read from here; the pure
// view-models stay in `lib/camp-roster.ts`.

export type { CampManagementMember, TeamCoverage, TeamPerson };

type QuestionnaireGate = Awaited<
  ReturnType<typeof dbListMemberQuestionnaireGates>
>[number];

interface RosterBackend {
  getCampManagementRoster(
    options?: CampManagementRosterOptions,
  ): Promise<CampManagementMember[]>;
  getTeamCoverage(): Promise<TeamCoverage[]>;
  listTeamPeople(team: Team): Promise<TeamPerson[]>;
  getCampMemberDetail(
    userId: string,
    options?: CampMemberDetailOptions,
  ): Promise<CampMemberDetail | null>;
  getTeamMemberships(userId: string): Promise<TeamMembership[]>;
  listMemberNotes(userId: string): Promise<MemberNote[]>;
  listMemberQuestionnaireGates(userId: string): Promise<QuestionnaireGate[]>;
  assignTeam(
    input: TeamWriteInput,
  ): Promise<{ created: boolean; cycle: number }>;
  removeTeam(
    input: TeamWriteInput,
  ): Promise<{ removed: boolean; cycle: number }>;
  setLead(input: TeamWriteInput & { isLead: boolean }): Promise<SetLeadResult>;
}

// Each entry calls through at CALL time, so a unit test's vi.mock of the db
// module still intercepts the read.
const realBackend: RosterBackend = {
  getCampManagementRoster: (options) => dbGetCampManagementRoster(options),
  getTeamCoverage: () => dbGetTeamCoverage(),
  listTeamPeople: (team) => dbListTeamPeople(team),
  getCampMemberDetail: (userId, options) =>
    dbGetCampMemberDetail(userId, options),
  getTeamMemberships: (userId) => dbGetTeamMemberships(userId),
  listMemberNotes: (userId) => dbListMemberNotes(userId),
  listMemberQuestionnaireGates: (userId) =>
    dbListMemberQuestionnaireGates(userId),
  assignTeam: (input) => dbAssignTeam(input),
  removeTeam: (input) => dbRemoveTeam(input),
  setLead: (input) => dbSetLead(input),
};

const testBackend: RosterBackend = {
  async getCampManagementRoster(options) {
    return testStore.getCampManagementRoster(options);
  },
  async getTeamCoverage() {
    return testStore.getTeamCoverage();
  },
  async listTeamPeople(team) {
    return testStore.listTeamPeople(team);
  },
  async getCampMemberDetail(userId, options) {
    return testStore.getCampMemberDetail(userId, options);
  },
  async getTeamMemberships(userId) {
    return testStore.getTeamMemberships(userId);
  },
  // The store models no captain notes, so a panel opened in E2E has none.
  async listMemberNotes() {
    return [];
  },
  async listMemberQuestionnaireGates(userId) {
    return testStore.listMemberQuestionnaireGates(userId);
  },
  // The store keeps no audit log, so the captain's id stops here.
  async assignTeam({ userId, team }) {
    return testStore.assignTeam({ userId, team });
  },
  async removeTeam({ userId, team }) {
    return testStore.removeTeam({ userId, team });
  },
  async setLead({ userId, team, isLead }) {
    return testStore.setLead({ userId, team, isLead });
  },
};

function backend(): RosterBackend {
  return usesTestStore() ? testBackend : realBackend;
}

/** Pass `includeEmail` only for a captain viewer. */
export function getCampManagementRoster(
  options?: CampManagementRosterOptions,
): Promise<CampManagementMember[]> {
  return backend().getCampManagementRoster(options);
}

/**
 * Head count and lead count per team for THIS year — the Overview's coverage
 * rail. Only teams somebody is on come back; the caller renders the camp's
 * configured teams and fills the missing ones in as empty, so a team with
 * nobody on it still shows.
 */
export function getTeamCoverage(): Promise<TeamCoverage[]> {
  return backend().getTeamCoverage();
}

/**
 * Everyone on one team this year, leads first — the team page's people. Only
 * what the member roster shows every approved member, so any approved member's
 * page may read it.
 */
export function listTeamPeople(team: Team): Promise<TeamPerson[]> {
  return backend().listTeamPeople(team);
}

// --- The captain member panel's reads ----------------------------------------
// getMemberDetailAction reads these four. They route here so Playwright can
// open a member on /captains/camp-management; each is captain-gated by the
// action, never by this module.

/** One member's detail. Pass the include* options only for a captain viewer. */
export function getCampMemberDetail(
  userId: string,
  options?: CampMemberDetailOptions,
): Promise<CampMemberDetail | null> {
  return backend().getCampMemberDetail(userId, options);
}

/** This year's team memberships for one member. */
export function getTeamMemberships(userId: string): Promise<TeamMembership[]> {
  return backend().getTeamMemberships(userId);
}

/** Captain notes on one member, newest first. */
export function listMemberNotes(userId: string): Promise<MemberNote[]> {
  return backend().listMemberNotes(userId);
}

/** One member's questionnaire gates, oldest first. */
export function listMemberQuestionnaireGates(
  userId: string,
): Promise<QuestionnaireGate[]> {
  return backend().listMemberQuestionnaireGates(userId);
}

// --- The captain member panel's team writes ----------------------------------
// assignTeamAction, removeTeamAction and setTeamLeadAction write through these,
// so Playwright can put a member on a team and make them its lead. The action
// gates them to captains and resolves the team key first; this module does not.

/** Put a member on a team for THIS year. Idempotent; never sets the lead flag. */
export function assignTeam(
  input: TeamWriteInput,
): Promise<{ created: boolean; cycle: number }> {
  return backend().assignTeam(input);
}

/** Take a member off a team for THIS year. Idempotent; prior years survive. */
export function removeTeam(
  input: TeamWriteInput,
): Promise<{ removed: boolean; cycle: number }> {
  return backend().removeTeam(input);
}

/** Set or clear the lead flag on a membership that exists THIS year. */
export function setLead(
  input: TeamWriteInput & { isLead: boolean },
): Promise<SetLeadResult> {
  return backend().setLead(input);
}

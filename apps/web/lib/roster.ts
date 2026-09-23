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
  getTeamCoverage as dbGetTeamCoverage,
  getTeamMemberships as dbGetTeamMemberships,
  type TeamCoverage,
  type TeamMembership,
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

export type { CampManagementMember, TeamCoverage };

type QuestionnaireGate = Awaited<
  ReturnType<typeof dbListMemberQuestionnaireGates>
>[number];

interface RosterBackend {
  getCampManagementRoster(
    options?: CampManagementRosterOptions,
  ): Promise<CampManagementMember[]>;
  getTeamCoverage(): Promise<TeamCoverage[]>;
  getCampMemberDetail(
    userId: string,
    options?: CampMemberDetailOptions,
  ): Promise<CampMemberDetail | null>;
  getTeamMemberships(userId: string): Promise<TeamMembership[]>;
  listMemberNotes(userId: string): Promise<MemberNote[]>;
  listMemberQuestionnaireGates(userId: string): Promise<QuestionnaireGate[]>;
}

// Each entry calls through at CALL time, so a unit test's vi.mock of the db
// module still intercepts the read.
const realBackend: RosterBackend = {
  getCampManagementRoster: (options) => dbGetCampManagementRoster(options),
  getTeamCoverage: () => dbGetTeamCoverage(),
  getCampMemberDetail: (userId, options) =>
    dbGetCampMemberDetail(userId, options),
  getTeamMemberships: (userId) => dbGetTeamMemberships(userId),
  listMemberNotes: (userId) => dbListMemberNotes(userId),
  listMemberQuestionnaireGates: (userId) =>
    dbListMemberQuestionnaireGates(userId),
};

const testBackend: RosterBackend = {
  async getCampManagementRoster(options) {
    return testStore.getCampManagementRoster(options);
  },
  async getTeamCoverage() {
    return testStore.getTeamCoverage();
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

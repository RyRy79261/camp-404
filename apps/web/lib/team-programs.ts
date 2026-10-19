import "server-only";

import * as broadcasts from "@camp404/db/broadcasts";
import type { TeamAnnouncement } from "@camp404/db/broadcasts";
import * as db from "@camp404/db/team-programs";
import type {
  TeamProgram,
  TeamProgramWriteResult,
} from "@camp404/db/team-programs";
import { testStore } from "./test-store";
import { twin } from "./twin";

// A team's program (docs/specs/2026-09-27-team-programs.md), from the
// database or, under E2E, the test store, picked once (twin): its description
// (owner's ruling 4) and the announcements it has sent (ruling 3). Who may
// change the description is canEditTeamProgram (@camp404/core), which both
// sides call; lib/__tests__/team-programs-agreement.test.ts holds the rest
// equal. The write re-checks the actor itself (a captain or a lead of that
// team), so a caller passes only who is acting.

export type { TeamAnnouncement, TeamProgram, TeamProgramWriteResult };

const program = twin(db, testStore, ["getTeamProgram", "saveTeamProgram"]);
const sent = twin(broadcasts, testStore, ["listTeamAnnouncements"]);

export const getTeamProgram = program.getTeamProgram;
export const saveTeamProgram = program.saveTeamProgram;

/** What the team has sent, newest first; only what has gone out. */
export const listTeamAnnouncements = sent.listTeamAnnouncements;

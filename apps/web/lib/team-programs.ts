import "server-only";

import {
  listTeamAnnouncements as dbListTeamAnnouncements,
  type TeamAnnouncement,
} from "@camp404/db/broadcasts";
import * as db from "@camp404/db/team-programs";
import type {
  TeamProgram,
  TeamProgramWriteResult,
} from "@camp404/db/team-programs";
import type { Team } from "@camp404/types";
import { usesTestStore } from "./test-mode";
import { testStore } from "./test-store";

// A team's program (docs/specs/2026-09-27-team-programs.md), from the
// database or, under E2E, the test store: its description (owner's ruling
// 4) and the announcements it has sent (ruling 3). The rules live in
// @camp404/db; the store repeats them. The write re-checks the actor itself
// (a captain or a lead of that team), so a caller passes only who is acting.

export type { TeamAnnouncement, TeamProgram, TeamProgramWriteResult };

export async function getTeamProgram(team: Team): Promise<TeamProgram> {
  return usesTestStore()
    ? testStore.getTeamProgram(team)
    : db.getTeamProgram(team);
}

export async function saveTeamProgram(input: {
  actorId: string;
  team: Team;
  description: string;
  expectedVersion: number;
}): Promise<TeamProgramWriteResult> {
  return usesTestStore()
    ? testStore.saveTeamProgram(input)
    : db.saveTeamProgram(input);
}

/** What the team has sent, newest first; only what has gone out. */
export async function listTeamAnnouncements(
  team: Team,
): Promise<{ items: TeamAnnouncement[]; more: boolean }> {
  return usesTestStore()
    ? testStore.listTeamAnnouncements(team)
    : dbListTeamAnnouncements(team);
}

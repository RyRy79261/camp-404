// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  NOT_A_TEAM_EDITOR,
  TEAM_PROGRAM_CHANGED,
} from "@camp404/db/team-programs";
import { Team } from "@camp404/types";
import { useTestDb } from "../../../../packages/db/src/__tests__/_harness";
import { bothWays } from "./_agreement";

// A team's program (owner's ruling 1, 2026-09-27), through
// lib/team-programs.ts, on the database and on the E2E store: only a captain
// or a lead OF THAT TEAM changes what it says (teamProgramEditor,
// @camp404/core), each change a compare-and-set on the version. The program
// is the Kitchen's, so the Kitchen lead may and the Finance lead (a lead of
// ANOTHER team) may not. See _agreement.ts.

const mode = vi.hoisted(() => ({ on: false }));
vi.mock("@/lib/test-mode", () => ({
  isE2ETestMode: () => mode.on,
  usesTestStore: () => mode.on,
  TEST_USER_COOKIE: "camp404_test_user",
}));

import { testStore } from "../test-store";
import {
  getTeamProgram,
  listTeamAnnouncements,
  saveTeamProgram,
} from "../team-programs";

const KITCHEN = Team.enum.kitchen;

describe("a team's program: the database and the test store agree", () => {
  const h = useTestDb();
  beforeEach(() => {
    mode.on = false;
    testStore.reset();
  });

  it("lets a captain and the team's lead change its description, once from the version they saw", async () => {
    const { db, store } = await bothWays(mode, h, async (p) => {
      const save = (actorId: string, description: string, v: number) =>
        saveTeamProgram({
          actorId,
          team: KITCHEN,
          description,
          expectedVersion: v,
        });
      const before = await getTeamProgram(KITCHEN);
      const lead = await save(p.kitchenLead, "We cook.", 0);
      const firstAgain = await save(p.captain, "We also cook.", 0);
      const captain = await save(p.captain, "We cook dinner.", 1);
      const stale = await save(p.kitchenLead, "Old.", 1);
      const otherLead = await save(p.financeLead, "Mine.", 2);
      const member = await save(p.member, "Mine.", 2);
      const after = await getTeamProgram(KITCHEN);
      return {
        before,
        lead,
        firstAgain,
        captain,
        stale,
        otherLead,
        member,
        after: { ...after, updatedAt: after.updatedAt !== null },
        announcements: await listTeamAnnouncements(KITCHEN),
      };
    });
    const refused = (error: string) => ({ ok: false, error });
    expect(db).toMatchObject({
      before: { description: "", version: 0, updatedAt: null },
      lead: { ok: true, version: 1 },
      firstAgain: refused(TEAM_PROGRAM_CHANGED),
      captain: { ok: true, version: 2 },
      stale: refused(TEAM_PROGRAM_CHANGED),
      otherLead: refused(NOT_A_TEAM_EDITOR),
      member: refused(NOT_A_TEAM_EDITOR),
      after: { description: "We cook dinner.", version: 2, updatedAt: true },
      announcements: { items: [], more: false },
    });
    expect(store).toEqual(db);
  });
});

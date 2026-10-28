import "server-only";

import {
  DEFAULT_JOIN_CONTENT,
  DEFAULT_TEAM_DESCRIPTIONS,
  type JoinSectionKey,
  type JoinSiteContent,
} from "@camp404/types";
import {
  activeTeams,
  currentCycle,
  describeTeam as describeTeamPure,
  resolveCycles,
  UNSET_CYCLE,
} from "@camp404/db/camp-config";
import * as campConfig from "@camp404/db/camp-config";
import * as rollover from "@camp404/db/cycle-rollover";
import * as db from "@camp404/db/join-site";
import { JoinSectionInvalidError, type CampBlurb } from "@camp404/db/join-site";
import { mutateTeamsConfig } from "./camp-config";
import { testStore } from "./test-store";
import { twin } from "./twin";

// The app's side of join.camp-404.com: what the Join site editor reads and
// writes, and each member's "what I am in camp" blurb. Real writes go through
// @camp404/db/join-site (audited in the same transaction); under E2E_TEST_MODE
// the in-memory test store stands in, picked once (twin). The checks both
// sides make live once in @camp404/core (parseJoinSections, campBlurbToSave,
// cyclesWithBurnDates); lib/__tests__/join-site-agreement.test.ts holds the
// answers equal.

const join = twin(db, testStore, [
  "getJoinSiteContent",
  "saveJoinSiteSections",
  "getCampBlurb",
  "setCampBlurb",
]);
const year = twin(campConfig, testStore, ["getCampConfig"]);
const burn = twin(rollover, testStore, ["setCycleBurnDates"]);

export type { CampBlurb };
export { JoinSectionInvalidError };

export type JoinEditorTeam = {
  key: string;
  label: string;
  /** The team's own line, or "" when it shows the default. */
  description: string;
  defaultDescription: string;
};

export type JoinEditorData = {
  /** The year being edited: the camp's year, or the unset sentinel. */
  year: number;
  /** False until a captain names the camp's year; dates need one. */
  yearIsSet: boolean;
  yearName: string | null;
  burn: { start: string; end: string } | null;
  content: JoinSiteContent;
  teams: JoinEditorTeam[];
};

export async function getJoinEditorData(): Promise<JoinEditorData> {
  const config = await year.getCampConfig();
  const cycle = currentCycle(resolveCycles(config));
  const editing = cycle?.year ?? UNSET_CYCLE;
  const { content } = await join.getJoinSiteContent(editing);
  return {
    year: editing,
    yearIsSet: cycle !== null,
    yearName: cycle?.name ?? null,
    burn:
      cycle?.burnStart && cycle.burnEnd
        ? { start: cycle.burnStart, end: cycle.burnEnd }
        : null,
    content,
    teams: activeTeams(config).map((t) => ({
      key: t.key,
      label: t.label,
      description: t.description ?? "",
      defaultDescription: DEFAULT_TEAM_DESCRIPTIONS[t.key] ?? "",
    })),
  };
}

/**
 * Save the sections a captain changed, all at once (the editor's one Save).
 * Throws JoinSectionInvalidError, naming the section, and then saves none.
 */
export async function saveJoinSections(input: {
  year: number;
  sections: Partial<Record<JoinSectionKey, unknown>>;
  actorUserId: string;
}): Promise<void> {
  await join.saveJoinSiteSections(input);
}

export type BurnDatesResult =
  | { ok: true }
  | { ok: false; reason: "unknown-year" | "invalid-dates" };

/** Set or clear the Burn's dates on the camp's year. */
export async function setBurnDates(input: {
  year: number;
  burnStart: string | null;
  burnEnd: string | null;
  actorUserId: string;
}): Promise<BurnDatesResult> {
  const res = await burn.setCycleBurnDates(input);
  return res.ok ? { ok: true } : res;
}

/** Say what a team does on the join site. Blank goes back to the default. */
export async function describeTeam(input: {
  key: string;
  description: string;
  actorUserId: string;
}): Promise<void> {
  await mutateTeamsConfig(
    (current) => describeTeamPure(current, input.key, input.description),
    {
      actorId: input.actorUserId,
      action: "camp.teams.described",
      target: input.key,
      metadata: { description: input.description.trim() || null },
    },
  );
}

export const getCampBlurb = join.getCampBlurb;

/** Stored trimmed and cut to its limits (campBlurbToSave). */
export const setCampBlurb = join.setCampBlurb;

export { DEFAULT_JOIN_CONTENT };

/**
 * The camp fee's floating scale for a year, as the Join site shows it (names,
 * whole-rand amounts, the dollar rate a captain typed, the Subsidy note). The
 * one source of the scale's amounts: fee_tiers is not (owner, 2026-10-27).
 */
export async function getFeeScale(
  cycle: number,
): Promise<JoinSiteContent["fee"]> {
  return (await join.getJoinSiteContent(cycle)).content.fee;
}

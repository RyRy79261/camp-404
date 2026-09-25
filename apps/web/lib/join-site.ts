import "server-only";

import {
  DEFAULT_JOIN_CONTENT,
  DEFAULT_TEAM_DESCRIPTIONS,
  JoinSections,
  resolveJoinContent,
  type JoinSectionKey,
  type JoinSiteContent,
} from "@camp404/types";
import {
  activeTeams,
  currentCycle,
  describeTeam as describeTeamPure,
  getCampConfig,
  isIsoDate,
  resolveCycles,
  UNSET_CYCLE,
} from "@camp404/db/camp-config";
import { setCycleBurnDates } from "@camp404/db/cycle-rollover";
import {
  getCampBlurb as dbGetCampBlurb,
  getJoinSiteContent,
  JoinSectionInvalidError,
  saveJoinSiteSection,
  setCampBlurb as dbSetCampBlurb,
  type CampBlurb,
} from "@camp404/db/join-site";
import { mutateTeamsConfig } from "./camp-config";
import { usesTestStore } from "./test-mode";
import { testStore } from "./test-store";

// The app's side of join.camp-404.com: what the Join site editor reads and
// writes, and each member's "what I am in camp" blurb. Real writes go through
// @camp404/db/join-site (audited in the same transaction); under E2E_TEST_MODE
// the in-memory test store stands in, like lib/camp-config.ts.

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
  const config = usesTestStore()
    ? testStore.getTeamsConfig()
    : await getCampConfig();
  const cycle = currentCycle(resolveCycles(config));
  const year = cycle?.year ?? UNSET_CYCLE;
  const content = usesTestStore()
    ? resolveJoinContent(testStore.getJoinContent(year))
    : (await getJoinSiteContent(year)).content;
  return {
    year,
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

/** Save one section of this year's words. Throws JoinSectionInvalidError. */
export async function saveJoinSection(input: {
  year: number;
  section: JoinSectionKey;
  value: unknown;
  actorUserId: string;
}): Promise<void> {
  if (!usesTestStore()) {
    await saveJoinSiteSection(input);
    return;
  }
  const parsed = JoinSections[input.section].safeParse(input.value);
  if (!parsed.success) {
    throw new JoinSectionInvalidError(
      parsed.error.issues.map((i) => i.message),
    );
  }
  const base = resolveJoinContent(testStore.getJoinContent(input.year));
  testStore.setJoinContent(input.year, {
    ...base,
    [input.section]: parsed.data,
  });
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
  if (!usesTestStore()) {
    const res = await setCycleBurnDates(input);
    return res.ok ? { ok: true } : res;
  }
  const clearing = input.burnStart === null && input.burnEnd === null;
  if (
    !clearing &&
    !(
      isIsoDate(input.burnStart) &&
      isIsoDate(input.burnEnd) &&
      input.burnStart <= input.burnEnd
    )
  ) {
    return { ok: false, reason: "invalid-dates" };
  }
  const config = testStore.getTeamsConfig();
  const cycles = resolveCycles(config);
  if (!cycles.some((c) => c.year === input.year)) {
    return { ok: false, reason: "unknown-year" };
  }
  testStore.setTeamsConfig({
    ...config,
    cycles: cycles.map((c) => {
      if (c.year !== input.year) return c;
      const rest = { ...c };
      delete rest.burnStart;
      delete rest.burnEnd;
      return clearing
        ? rest
        : { ...rest, burnStart: input.burnStart!, burnEnd: input.burnEnd! };
    }),
  } as typeof config);
  return { ok: true };
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

export async function getCampBlurb(userId: string): Promise<CampBlurb> {
  return usesTestStore()
    ? testStore.getCampBlurb(userId)
    : dbGetCampBlurb(userId);
}

export async function setCampBlurb(
  userId: string,
  blurb: CampBlurb,
): Promise<void> {
  if (usesTestStore()) {
    const clean = (v: string | null) => (v ?? "").trim() || null;
    testStore.setCampBlurb(userId, {
      title: clean(blurb.title),
      blurb: clean(blurb.blurb),
      showOnJoin: blurb.showOnJoin,
    });
    return;
  }
  await dbSetCampBlurb(userId, blurb);
}

export { DEFAULT_JOIN_CONTENT };

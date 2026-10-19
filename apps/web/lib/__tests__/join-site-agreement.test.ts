// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_CAMP_BLURB_LENGTH, MAX_CAMP_TITLE_LENGTH } from "@camp404/core";
import { DEFAULT_JOIN_CONTENT, Team } from "@camp404/types";
import { useTestDb } from "../../../../packages/db/src/__tests__/_harness";
import { YEAR, bothWays } from "./_agreement";

// join.camp-404.com's words and the captains' cards, through lib/join-site.ts
// and lib/about.ts, on the database and on the E2E store: one bad section
// saves none (parseJoinSections), the Burn's dates are two real days in order
// on a year the camp has (cyclesWithBurnDates), and a card is stored trimmed
// and cut to its limits (campBlurbToSave), all in @camp404/core. Every caller
// gates to captains (or the member's own card) before it gets here. See
// _agreement.ts.

const mode = vi.hoisted(() => ({ on: false }));
vi.mock("@/lib/test-mode", () => ({
  isE2ETestMode: () => mode.on,
  usesTestStore: () => mode.on,
  TEST_USER_COOKIE: "camp404_test_user",
}));

import { testStore } from "../test-store";
import { getAboutCamp } from "../about";
import {
  describeTeam,
  getCampBlurb,
  getJoinEditorData,
  saveJoinSections,
  setBurnDates,
  setCampBlurb,
} from "../join-site";

/** The class and the section a save threw, or null. */
async function thrown(work: () => Promise<unknown>) {
  try {
    await work();
    return null;
  } catch (error) {
    const e = error as Error & { section?: string };
    return { error: e.constructor.name, section: e.section ?? null };
  }
}

describe("the join site: the database and the test store agree", () => {
  const h = useTestDb();
  beforeEach(() => {
    mode.on = false;
    testStore.reset();
  });

  it("saves the sections a captain changed, all or none, and the Burn's dates by the same rule", async () => {
    const { db, store } = await bothWays(mode, h, async (p) => {
      const before = await getJoinEditorData();
      const teams = { intro: "Pick a team.", outro: ["See you there."] };
      const good = await thrown(() =>
        saveJoinSections({
          year: YEAR,
          sections: { teams },
          actorUserId: p.captain,
        }),
      );
      const bad = await thrown(() =>
        saveJoinSections({
          year: YEAR,
          sections: {
            teams: { ...teams, intro: "Changed" },
            map: { where: 5 },
          },
          actorUserId: p.captain,
        }),
      );
      const backwards = await setBurnDates({
        year: YEAR,
        burnStart: `${YEAR}-04-30`,
        burnEnd: `${YEAR}-04-27`,
        actorUserId: p.captain,
      });
      const notADay = await setBurnDates({
        year: YEAR,
        burnStart: `${YEAR}-02-30`,
        burnEnd: `${YEAR}-03-01`,
        actorUserId: p.captain,
      });
      const otherYear = await setBurnDates({
        year: YEAR + 1,
        burnStart: `${YEAR + 1}-04-27`,
        burnEnd: `${YEAR + 1}-05-03`,
        actorUserId: p.captain,
      });
      const set = await setBurnDates({
        year: YEAR,
        burnStart: `${YEAR}-04-27`,
        burnEnd: `${YEAR}-05-03`,
        actorUserId: p.captain,
      });
      const withDates = await getJoinEditorData();
      await describeTeam({
        key: Team.enum.kitchen,
        description: "  We feed everyone.  ",
        actorUserId: p.captain,
      });
      const cleared = await setBurnDates({
        year: YEAR,
        burnStart: null,
        burnEnd: null,
        actorUserId: p.captain,
      });
      const after = await getJoinEditorData();
      return {
        before: {
          year: before.year,
          yearIsSet: before.yearIsSet,
          burn: before.burn,
          isDefault: before.content.teams === DEFAULT_JOIN_CONTENT.teams,
        },
        good,
        bad,
        backwards,
        notADay,
        otherYear,
        set,
        burn: withDates.burn,
        teamsSection: after.content.teams,
        map: after.content.map,
        kitchen: after.teams.find((t) => t.key === Team.enum.kitchen),
        afterBurn: after.burn,
        cleared,
      };
    });
    expect(db).toMatchObject({
      before: { year: YEAR, yearIsSet: true, burn: null },
      good: null,
      bad: { error: "JoinSectionInvalidError", section: "map" },
      backwards: { ok: false, reason: "invalid-dates" },
      notADay: { ok: false, reason: "invalid-dates" },
      otherYear: { ok: false, reason: "unknown-year" },
      set: { ok: true },
      burn: { start: `${YEAR}-04-27`, end: `${YEAR}-05-03` },
      teamsSection: { intro: "Pick a team.", outro: ["See you there."] },
      map: DEFAULT_JOIN_CONTENT.map,
      afterBurn: null,
      cleared: { ok: true },
    });
    expect(store).toEqual(db);
  });

  it("stores a member's card trimmed and cut, and shows only captains who asked to be shown", async () => {
    const { db, store } = await bothWays(mode, h, async (p) => {
      const none = await getCampBlurb(p.member);
      await setCampBlurb(p.captain, {
        title: `  ${"T".repeat(MAX_CAMP_TITLE_LENGTH + 5)}  `,
        blurb: `  ${"b".repeat(MAX_CAMP_BLURB_LENGTH + 5)}`,
        showOnJoin: true,
      });
      await setCampBlurb(p.member, {
        title: "   ",
        blurb: " I fix things. ",
        showOnJoin: true,
      });
      const captain = await getCampBlurb(p.captain);
      const about = await getAboutCamp();
      return {
        none,
        captain: {
          title: captain.title?.length,
          blurb: captain.blurb?.length,
          showOnJoin: captain.showOnJoin,
        },
        member: await getCampBlurb(p.member),
        captains: about.captains.map((c) => ({
          name: c.name,
          title: c.title.length,
        })),
        year: about.year,
      };
    });
    expect(db).toEqual({
      none: { title: null, blurb: null, showOnJoin: false },
      captain: {
        title: MAX_CAMP_TITLE_LENGTH,
        blurb: MAX_CAMP_BLURB_LENGTH,
        showOnJoin: true,
      },
      member: { title: null, blurb: "I fix things.", showOnJoin: true },
      captains: [{ name: "Cap", title: MAX_CAMP_TITLE_LENGTH }],
      year: YEAR,
    });
    expect(store).toEqual(db);
  });
});

// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  LAYOUT_TEAM,
  copiedLayoutNote,
  emptyLayout,
  newPiece,
  restoredLayoutNote,
} from "@camp404/core";
import {
  ALREADY_HAS_LAYOUT,
  LAYOUT_CHANGED,
  LAYOUT_VERSION_GONE,
  NOT_A_LAYOUT_EDITOR,
  NOT_A_LAYOUT_SHARER,
  NOTHING_TO_SHARE,
  NO_EARLIER_LAYOUT,
} from "@camp404/db/camp-layout";
import * as schema from "@camp404/db/schema";
import { Team, type CampLayout } from "@camp404/types";
import { useTestDb } from "../../../../packages/db/src/__tests__/_harness";
import { YEAR, bothWays, type DB, type Seed } from "./_agreement";

// The camp layout (#271), through lib/camp-layout.ts, on the database and on
// the E2E store: the same people, the same writes, the same answers and
// refusal sentences. Who may save and who may share are one rule each
// (LAYOUT_EDITOR, LAYOUT_SHARER), and the plan's check, its notes and the
// share token's shape live once in @camp404/core; this holds the rest equal,
// the neighbour's read (neighbourView's allowlist and arrival counts)
// included. A Structures lead is this domain's lead; the Kitchen lead is a
// lead of ANOTHER team, refused. See _agreement.ts.

const mode = vi.hoisted(() => ({ on: false }));
vi.mock("@/lib/test-mode", () => ({
  isE2ETestMode: () => mode.on,
  usesTestStore: () => mode.on,
  TEST_USER_COOKIE: "camp404_test_user",
}));

import { testStore } from "../test-store";
import { testLayoutStore } from "../test-store-layout";
import {
  copyLastYearLayout,
  getCampLayout,
  getLayoutShare,
  getSharedLayout,
  layoutArrivalCounts,
  listLayoutVersions,
  previousLayoutCycle,
  restoreLayoutVersion,
  saveCampLayout,
  shareCampLayout,
  unshareCampLayout,
} from "../camp-layout";

const STRUCTURES = Team.enum[LAYOUT_TEAM];

/** A plan with one labelled tent that names a member, and a named edge. */
function plan(label = "Zanele's tent"): CampLayout {
  const layout = emptyLayout();
  layout.plot.edges.right = "Road";
  const tent = { ...newPiece("tent", "p-1", layout.plot), label };
  return { ...layout, pieces: [tent, newPiece("kitchen", "p-2", layout.plot)] };
}

async function structuresLead(seed: Seed): Promise<string> {
  const id = await seed.user("Beam");
  await seed.lead(id, STRUCTURES);
  return id;
}

/** A member's arrival day this year, the way a driver profile holds it. */
async function arrive(seed: Seed, db: DB, userId: string, day: string) {
  const arrivalAt = new Date(`${day}T00:00:00.000Z`);
  if (seed.side === "store") {
    testStore.seedDriverProfile({ userId, cycle: YEAR, arrivalAt });
    return;
  }
  await db
    .insert(schema.driverProfiles)
    .values({ userId, cycle: YEAR, version: "1", arrivalAt });
}

/** An earlier year's saved plan, as version 1 of that year. */
async function savedIn(seed: Seed, db: DB, cycle: number, layout: CampLayout) {
  if (seed.side === "store") {
    testLayoutStore.seedLayout(cycle, layout);
    return;
  }
  await db.insert(schema.campLayouts).values({ cycle, latestVersion: 1 });
  await db
    .insert(schema.campLayoutVersions)
    .values({ cycle, number: 1, body: layout, note: null });
}

/** A share answer with its random token named by its shape. */
const shaped = (result: { ok: boolean; token?: string }) =>
  result.ok
    ? { ...result, token: /^[A-Za-z0-9_-]{32}$/.test(result.token ?? "") }
    : result;

describe("the camp layout: the database and the test store agree", () => {
  const h = useTestDb();
  beforeEach(() => {
    mode.on = false;
    testStore.reset();
    testLayoutStore.reset();
  });

  it("saves the plan for a captain or a Structures lead only, compare-and-set on the latest version", async () => {
    const { db, store } = await bothWays(mode, h, async (p, seed) => {
      const lead = await structuresLead(seed);
      const empty = await getCampLayout();
      const otherLead = await saveCampLayout({
        actorId: p.kitchenLead,
        layout: plan(),
        expectedVersion: 0,
      });
      const member = await saveCampLayout({
        actorId: p.member,
        layout: plan(),
        expectedVersion: 0,
      });
      const bad = await saveCampLayout({
        actorId: lead,
        layout: { ...plan(), pieces: "nope" } as unknown as CampLayout,
        expectedVersion: 0,
      });
      const first = await saveCampLayout({
        actorId: lead,
        layout: plan(),
        expectedVersion: 0,
        note: "  First go  ",
      });
      const stale = await saveCampLayout({
        actorId: p.captain,
        layout: plan("Moved"),
        expectedVersion: 0,
      });
      const second = await saveCampLayout({
        actorId: p.captain,
        layout: plan("Moved"),
        expectedVersion: 1,
        note: "   ",
      });
      const restoreOther = await restoreLayoutVersion({
        actorId: p.kitchenLead,
        number: 1,
        expectedVersion: 2,
      });
      const restoreGone = await restoreLayoutVersion({
        actorId: lead,
        number: 9,
        expectedVersion: 2,
      });
      const restoreStale = await restoreLayoutVersion({
        actorId: lead,
        number: 1,
        expectedVersion: 1,
      });
      const restored = await restoreLayoutVersion({
        actorId: lead,
        number: 1,
        expectedVersion: 2,
      });
      return {
        empty,
        otherLead,
        member,
        bad,
        first,
        stale,
        second,
        restoreOther,
        restoreGone,
        restoreStale,
        restored,
        latest: await getCampLayout(),
        asked: await getCampLayout(undefined, 2),
        notSaved: await getCampLayout(undefined, 7),
        versions: await listLayoutVersions(),
        lastTwo: await listLayoutVersions(undefined, 2),
      };
    });
    expect(db).toMatchObject({
      empty: { cycle: YEAR, version: 0, layout: null, shared: false },
      otherLead: { ok: false, error: NOT_A_LAYOUT_EDITOR },
      member: { ok: false, error: NOT_A_LAYOUT_EDITOR },
      bad: { ok: false },
      first: { ok: true, version: 1 },
      stale: { ok: false, error: LAYOUT_CHANGED },
      second: { ok: true, version: 2 },
      restoreOther: { ok: false, error: NOT_A_LAYOUT_EDITOR },
      restoreGone: { ok: false, error: LAYOUT_VERSION_GONE },
      restoreStale: { ok: false, error: LAYOUT_CHANGED },
      restored: { ok: true, version: 3 },
      latest: {
        version: 3,
        note: restoredLayoutNote(1),
        savedByName: "Beam",
        layout: { pieces: [{ label: "Zanele's tent" }, {}] },
      },
      asked: { version: 2, note: null, savedByName: "Cap" },
      notSaved: { version: 3 },
      versions: [
        { number: 3, pieces: 2 },
        { number: 2, note: null },
        { number: 1, note: "First go", savedByName: "Beam" },
      ],
      lastTwo: [{ number: 3 }, { number: 2 }],
    });
    expect(store).toEqual(db);
  });

  it("shares the plan with neighbours for a captain only, and the shared read is the allowlist and arrival counts", async () => {
    const { db, store } = await bothWays(mode, h, async (p, seed) => {
      const lead = await structuresLead(seed);
      await arrive(seed, h.db(), p.member, "2027-04-20");
      await arrive(seed, h.db(), p.other, "2027-04-20");
      await arrive(seed, h.db(), p.captain, "2027-04-22");
      const nothing = await shareCampLayout({ actorId: p.captain });
      await saveCampLayout({
        actorId: lead,
        layout: plan(),
        expectedVersion: 0,
      });
      const byLead = await shareCampLayout({ actorId: lead });
      const byMember = await shareCampLayout({ actorId: p.member });
      const shared = await shareCampLayout({ actorId: p.captain });
      const token = shared.ok ? shared.token : "";
      const link = await getLayoutShare();
      const neighbour = await getSharedLayout(token);
      const marked = await getCampLayout();
      const offByLead = await unshareCampLayout({ actorId: lead });
      const off = await unshareCampLayout({ actorId: p.captain });
      const offAgain = await unshareCampLayout({ actorId: p.captain });
      return {
        nothing,
        byLead,
        byMember,
        shared: shaped(shared),
        link: { ...link, token: link.token === token },
        neighbour,
        marked: marked.shared,
        arrivals: await layoutArrivalCounts(),
        offByLead,
        off,
        offAgain,
        afterOff: await getSharedLayout(token),
        linkAfterOff: await getLayoutShare(),
        notAToken: await getSharedLayout("not-a-token"),
        unknown: await getSharedLayout("a".repeat(32)),
      };
    });
    expect(db).toMatchObject({
      nothing: { ok: false, error: NOTHING_TO_SHARE },
      byLead: { ok: false, error: NOT_A_LAYOUT_SHARER },
      byMember: { ok: false, error: NOT_A_LAYOUT_SHARER },
      shared: { ok: true, token: true },
      link: { token: true, sharedAt: "<date>" },
      neighbour: {
        cycle: YEAR,
        layout: { pieces: [{ kind: "tent" }, { kind: "kitchen" }] },
        arrivals: [
          { day: "2027-04-20", count: 2 },
          { day: "2027-04-22", count: 1 },
        ],
      },
      marked: true,
      offByLead: { ok: false, error: NOT_A_LAYOUT_SHARER },
      off: { ok: true, changed: true },
      offAgain: { ok: true, changed: false },
      afterOff: null,
      linkAfterOff: { token: null, sharedAt: null },
      notAToken: null,
      unknown: null,
    });
    // The neighbour reads no label, no edge note and no name.
    expect(JSON.stringify(db)).not.toMatch(/Zanele|Road|Beam/);
    expect(store).toEqual(db);
  });

  it("copies last year's plan only while this year has none", async () => {
    const { db, store } = await bothWays(mode, h, async (p, seed) => {
      const lead = await structuresLead(seed);
      const before = await previousLayoutCycle();
      const noneEarlier = await copyLastYearLayout({ actorId: lead });
      await savedIn(seed, h.db(), YEAR - 1, plan("Last year's tent"));
      const after = await previousLayoutCycle();
      const otherLead = await copyLastYearLayout({ actorId: p.kitchenLead });
      const member = await copyLastYearLayout({ actorId: p.member });
      const copied = await copyLastYearLayout({ actorId: lead });
      const again = await copyLastYearLayout({ actorId: p.captain });
      return {
        before,
        noneEarlier,
        after,
        otherLead,
        member,
        copied,
        again,
        now: await getCampLayout(),
        lastYear: await getCampLayout(YEAR - 1),
      };
    });
    expect(db).toMatchObject({
      before: null,
      noneEarlier: { ok: false, error: NO_EARLIER_LAYOUT },
      after: YEAR - 1,
      otherLead: { ok: false, error: NOT_A_LAYOUT_EDITOR },
      member: { ok: false, error: NOT_A_LAYOUT_EDITOR },
      copied: { ok: true, version: 1, fromCycle: YEAR - 1 },
      again: { ok: false, error: ALREADY_HAS_LAYOUT },
      now: {
        cycle: YEAR,
        version: 1,
        note: copiedLayoutNote(YEAR - 1),
        layout: { pieces: [{ label: "Last year's tent" }, {}] },
      },
      lastYear: { cycle: YEAR - 1, version: 1, savedByName: null },
    });
    expect(store).toEqual(db);
  });
});

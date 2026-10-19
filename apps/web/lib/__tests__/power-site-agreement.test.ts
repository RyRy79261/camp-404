// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POWER_TEAM } from "@camp404/core";
import { NOT_A_POWER_EDITOR } from "@camp404/db/power";
import {
  CAN_CHANGED,
  CAN_GONE,
  CAN_OWNER_NOT_MEMBER,
} from "@camp404/db/power-site";
import { CAN_MATERIALS, MAX_CAN_LITRES, Team } from "@camp404/types";
import { useTestDb } from "../../../../packages/db/src/__tests__/_harness";
import { bothWays } from "./_agreement";

// Power on site (#255 the fuel can register), through lib/power-site.ts, on
// the database and on the E2E store: only a captain or a Power & Lighting lead
// (POWER_EDITOR, @camp404/core) changes the list; a can's owner is a camp
// member or the camp; each change and removal is a compare-and-set on the
// version; the list is numbered in the order cans were added. The Kitchen
// lead is a lead of ANOTHER team and is refused. See _agreement.ts.

const mode = vi.hoisted(() => ({ on: false }));
vi.mock("@/lib/test-mode", () => ({
  isE2ETestMode: () => mode.on,
  usesTestStore: () => mode.on,
  TEST_USER_COOKIE: "camp404_test_user",
}));

import { testStore } from "../test-store";
import {
  addFuelCan,
  listFuelCans,
  removeFuelCan,
  updateFuelCan,
} from "../power-site";

const POWER = Team.enum[POWER_TEAM];
const [METAL, PLASTIC] = CAN_MATERIALS;
const NOBODY = "00000000-0000-4000-8000-000000000000";

const can = (ownerUserId: string | null, sizeLitres = 20) => ({
  ownerUserId,
  sizeLitres,
  material: METAL!,
  travelsWithUserId: null,
  note: null,
});

const refused = (error: string) => ({ ok: false, error });

describe("the fuel can register: the database and the test store agree", () => {
  const h = useTestDb();
  beforeEach(() => {
    mode.on = false;
    testStore.reset();
  });

  it("lets a captain and the Power lead list, change and remove cans, each once from the version seen", async () => {
    const { db, store } = await bothWays(mode, h, async (p, seed) => {
      const powerLead = await seed.user("Volt");
      await seed.lead(powerLead, POWER);
      const first = await addFuelCan({ ...can(p.member), actorId: powerLead });
      const camps = await addFuelCan({ ...can(null, 25), actorId: p.captain });
      const otherLead = await addFuelCan({
        ...can(null),
        actorId: p.kitchenLead,
      });
      const member = await addFuelCan({ ...can(p.member), actorId: p.member });
      const strangerOwns = await addFuelCan({
        ...can(NOBODY),
        actorId: p.captain,
      });
      const id = first.ok ? first.id : "";
      const changed = await updateFuelCan({
        ...can(p.other, MAX_CAN_LITRES),
        material: PLASTIC!,
        note: "Red cap",
        canId: id,
        expectedVersion: 1,
        actorId: powerLead,
      });
      const stale = await updateFuelCan({
        ...can(p.other),
        canId: id,
        expectedVersion: 1,
        actorId: p.captain,
      });
      const staleRemove = await removeFuelCan({
        canId: id,
        expectedVersion: 1,
        actorId: p.captain,
      });
      const listed = await listFuelCans();
      const removed = await removeFuelCan({
        canId: camps.ok ? camps.id : "",
        expectedVersion: 1,
        actorId: powerLead,
      });
      const gone = await removeFuelCan({
        canId: NOBODY,
        expectedVersion: 1,
        actorId: powerLead,
      });
      return {
        first: first.ok && first.number,
        camps: camps.ok && camps.number,
        otherLead,
        member,
        strangerOwns,
        changed,
        stale,
        staleRemove,
        listed: listed.map((c) => ({
          sort: c.sort,
          ownerName: c.ownerName,
          sizeLitres: c.sizeLitres,
          material: c.material,
          note: c.note,
        })),
        removed,
        gone,
        after: (await listFuelCans()).map((c) => c.sizeLitres),
      };
    });
    expect(db).toMatchObject({
      first: 1,
      camps: 2,
      otherLead: refused(NOT_A_POWER_EDITOR),
      member: refused(NOT_A_POWER_EDITOR),
      strangerOwns: refused(CAN_OWNER_NOT_MEMBER),
      changed: { ok: true },
      stale: refused(CAN_CHANGED),
      staleRemove: refused(CAN_CHANGED),
      listed: [
        {
          ownerName: "Zed",
          sizeLitres: MAX_CAN_LITRES,
          material: PLASTIC,
          note: "Red cap",
        },
        { ownerName: null, sizeLitres: 25 },
      ],
      removed: { ok: true },
      gone: refused(CAN_GONE),
      after: [MAX_CAN_LITRES],
    });
    expect(store).toEqual(db);
  });
});

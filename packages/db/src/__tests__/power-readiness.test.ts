import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { POWER_TEAM } from "@camp404/core";
import {
  GeneratorInput,
  POWER_WORK_PLAN_TEMPLATE,
  READINESS_TEMPLATE,
  SharingAgreementInput,
  type Team,
} from "@camp404/types";
import type { CampConfig } from "../camp-config";
import { NOT_A_POWER_EDITOR, addGenerator } from "../power";
import {
  READINESS_ALREADY_STARTED,
  READINESS_ITEM_CHANGED,
  READINESS_OWNER_NOT_MEMBER,
  READINESS_TICKED_FIRST,
  SHARING_CHANGED,
  WORK_PLAN_ALREADY_ON_BOARD,
  addReadinessItem,
  addWorkPlanToBoard,
  getSharingAgreement,
  listReadinessItems,
  listWorkPlanTasks,
  removeSharingAgreement,
  saveSharingAgreement,
  startReadinessChecklist,
  tickReadinessItem,
  updateReadinessItem,
} from "../power-readiness";
import * as schema from "../schema";
import { assignTeam, setLead } from "../team-memberships";
import { useTestDb } from "./_harness";
import { makeUser } from "./_factories";

// Before the burn (#257) on PGlite: the readiness checklist (owners, due
// dates, ticks as compare-and-set), the work plan on the task board (once a
// year, last year's as the team left it), and the sharing agreement.

type DB = ReturnType<ReturnType<typeof useTestDb>["db"]>;

async function campYear(db: DB, year: number, earlier: number[] = []) {
  const cycles: CampConfig["cycles"] = [
    ...earlier.map((y) => ({
      year: y,
      startedAt: `${y}-01-01T00:00:00.000Z`,
      endedAt: `${y}-12-31T00:00:00.000Z`,
    })),
    { year, startedAt: `${year}-01-01T00:00:00.000Z`, endedAt: null },
  ];
  await db
    .insert(schema.campSettings)
    .values({ id: true })
    .onConflictDoNothing({ target: schema.campSettings.id });
  const [row] = await db
    .select({ config: schema.campSettings.config })
    .from(schema.campSettings)
    .limit(1);
  await db
    .update(schema.campSettings)
    .set({ config: { ...row!.config, cycles } })
    .where(eq(schema.campSettings.id, true));
}

const GENNY = GeneratorInput.parse({
  model: "Test 5.5",
  ratedKva: 5.5,
  maxKva: 6,
  tankLitres: 13.5,
  runtime50Hours: 9.8,
  runtime100Hours: 5.5,
  fuelType: "petrol",
  owner: "camp",
});

describe("before the burn", () => {
  const h = useTestDb();

  async function leadOf(team: Team) {
    const user = await makeUser(h.db());
    await assignTeam({ userId: user.id, team });
    await setLead({ userId: user.id, team, isLead: true });
    return user;
  }

  async function setup() {
    await campYear(h.db(), 2026, [2025]);
    const captain = await makeUser(h.db(), { rank: "captain" });
    const powerLead = await leadOf(POWER_TEAM as Team);
    const kitchenLead = await leadOf("kitchen");
    const member = await makeUser(h.db(), { displayName: "Sam Spark" });
    const gen = await addGenerator({ ...GENNY, actorId: captain.id });
    if (!gen.ok) throw new Error(gen.error);
    return { captain, powerLead, kitchenLead, member, generatorId: gen.id };
  }

  describe("the readiness checklist", () => {
    it("starts from the template once, for an editor only", async () => {
      const { powerLead, kitchenLead, generatorId } = await setup();
      expect(
        await startReadinessChecklist({ actorId: kitchenLead.id, generatorId }),
      ).toEqual({ ok: false, error: NOT_A_POWER_EDITOR });
      expect(
        await startReadinessChecklist({ actorId: powerLead.id, generatorId }),
      ).toEqual({ ok: true, count: READINESS_TEMPLATE.length });
      expect(
        await startReadinessChecklist({ actorId: powerLead.id, generatorId }),
      ).toEqual({ ok: false, error: READINESS_ALREADY_STARTED });
      const items = await listReadinessItems();
      expect(items.map((i) => i.itemKey)).toEqual(
        READINESS_TEMPLATE.map((t) => t.key),
      );
      const added = await addReadinessItem({
        actorId: powerLead.id,
        generatorId,
        label: "Borrow the trailer",
      });
      expect(added.ok).toBe(true);
      expect((await listReadinessItems()).at(-1)).toMatchObject({
        itemKey: "custom",
        label: "Borrow the trailer",
      });
    });

    it("gives an item an owner and a due day, compare-and-set", async () => {
      const { captain, powerLead, member, generatorId } = await setup();
      await startReadinessChecklist({ actorId: powerLead.id, generatorId });
      const [item] = await listReadinessItems();
      const set = (actorId: string, ownerUserId: string | null) =>
        updateReadinessItem({
          actorId,
          itemId: item!.id,
          expectedVersion: 1,
          ownerUserId,
          dueOn: "2026-04-10",
        });
      const pending = await makeUser(h.db(), { approvalStatus: "pending" });
      expect(await set(powerLead.id, pending.id)).toEqual({
        ok: false,
        error: READINESS_OWNER_NOT_MEMBER,
      });
      expect(await set(powerLead.id, member.id)).toEqual({ ok: true });
      expect(await set(captain.id, null)).toEqual({
        ok: false,
        error: READINESS_ITEM_CHANGED,
      });
      const [after] = await listReadinessItems();
      expect(after).toMatchObject({
        ownerName: "Sam Spark",
        dueOn: "2026-04-10",
        version: 2,
      });
    });

    it("a tick is a compare-and-set on the state the member saw", async () => {
      const { captain, powerLead, generatorId } = await setup();
      await startReadinessChecklist({ actorId: powerLead.id, generatorId });
      const [item] = await listReadinessItems();
      const tick = (actorId: string, done: boolean) =>
        tickReadinessItem({ actorId, itemId: item!.id, done });
      expect(await tick(powerLead.id, true)).toEqual({ ok: true });
      expect(await tick(captain.id, true)).toEqual({
        ok: false,
        error: READINESS_TICKED_FIRST,
      });
      const [done] = await listReadinessItems();
      expect(done?.doneAt).toBeInstanceOf(Date);
      expect(await tick(captain.id, false)).toEqual({ ok: true });
      const [undone] = await listReadinessItems();
      expect(undone?.doneAt).toBeNull();
    });
  });

  describe("the work plan", () => {
    it("puts the template on the board once as Power & Lighting tasks", async () => {
      const { powerLead, kitchenLead } = await setup();
      expect(await addWorkPlanToBoard({ actorId: kitchenLead.id })).toEqual({
        ok: false,
        error: NOT_A_POWER_EDITOR,
      });
      expect(await addWorkPlanToBoard({ actorId: powerLead.id })).toEqual({
        ok: true,
        count: POWER_WORK_PLAN_TEMPLATE.length,
        fromCycle: null,
      });
      expect(await addWorkPlanToBoard({ actorId: powerLead.id })).toEqual({
        ok: false,
        error: WORK_PLAN_ALREADY_ON_BOARD,
      });
      const tasks = await h.db().select().from(schema.tasks);
      expect(tasks).toHaveLength(POWER_WORK_PLAN_TEMPLATE.length);
      expect(new Set(tasks.map((t) => t.team))).toEqual(new Set([POWER_TEAM]));
      expect((await listWorkPlanTasks()).map((t) => t.title)).toEqual(
        POWER_WORK_PLAN_TEMPLATE.map((t) => t.title),
      );
    });

    it("copies last year's plan as the team left it on the board", async () => {
      const { captain } = await setup();
      await campYear(h.db(), 2025);
      await addWorkPlanToBoard({ actorId: captain.id });
      const [first] = await listWorkPlanTasks();
      await h
        .db()
        .update(schema.tasks)
        .set({ title: "Generator: service at Joe's workshop" })
        .where(eq(schema.tasks.id, first!.taskId));
      await campYear(h.db(), 2026, [2025]);
      expect(await listWorkPlanTasks()).toEqual([]);
      expect(await addWorkPlanToBoard({ actorId: captain.id })).toEqual({
        ok: true,
        count: POWER_WORK_PLAN_TEMPLATE.length,
        fromCycle: 2025,
      });
      const now = await listWorkPlanTasks();
      expect(now[0]?.title).toBe("Generator: service at Joe's workshop");
      expect(now[0]?.taskId).not.toBe(first!.taskId);
      expect(now.every((t) => t.status === "open")).toBe(true);
    });
  });

  describe("the sharing agreement", () => {
    const agreement = (generatorId: string, expectedVersion: number) =>
      SharingAgreementInput.parse({
        partnerCamp: "Camp Moonbeam",
        contactRole: "their power lead",
        generatorSource: "ours",
        generatorId,
        watchCover: "They cover 00:00–08:00",
        expectedVersion,
      });

    it("saves once, then compare-and-set, for an editor only", async () => {
      const { captain, powerLead, kitchenLead, generatorId } = await setup();
      expect(
        await saveSharingAgreement({
          ...agreement(generatorId, 0),
          actorId: kitchenLead.id,
        }),
      ).toEqual({ ok: false, error: NOT_A_POWER_EDITOR });
      expect(
        await saveSharingAgreement({
          ...agreement(generatorId, 0),
          actorId: powerLead.id,
        }),
      ).toEqual({ ok: true, version: 1 });
      expect(
        await saveSharingAgreement({
          ...agreement(generatorId, 0),
          actorId: captain.id,
        }),
      ).toEqual({ ok: false, error: SHARING_CHANGED });
      expect(
        await saveSharingAgreement({
          ...agreement(generatorId, 1),
          partnerFuelPct: 40,
          actorId: captain.id,
        }),
      ).toEqual({ ok: true, version: 2 });
      expect(await getSharingAgreement()).toMatchObject({
        partnerCamp: "Camp Moonbeam",
        partnerFuelPct: 40,
        version: 2,
      });
      expect(
        await removeSharingAgreement({
          actorId: captain.id,
          expectedVersion: 1,
        }),
      ).toEqual({ ok: false, error: SHARING_CHANGED });
      expect(
        await removeSharingAgreement({
          actorId: captain.id,
          expectedVersion: 2,
        }),
      ).toEqual({ ok: true });
      expect(await getSharingAgreement()).toBeNull();
    });
  });
});

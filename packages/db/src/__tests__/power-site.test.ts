import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { POWER_TEAM, canTotals, fillingCar } from "@camp404/core";
import { FuelCanInput, type Team } from "@camp404/types";
import type { CampConfig } from "../camp-config";
import { NOT_A_POWER_EDITOR } from "../power";
import {
  CAN_CAR_GONE,
  CAN_CHANGED,
  CAN_GONE,
  CAN_OWNER_NOT_MEMBER,
  addFuelCan,
  listFuelCans,
  removeFuelCan,
  updateFuelCan,
} from "../power-site";
import { getTransportBoard } from "../transport";
import { sanitiseAccount } from "../account";
import * as schema from "../schema";
import { assignTeam, setLead } from "../team-memberships";
import { useTestDb } from "./_harness";
import { makeDriverProfile, makeUser } from "./_factories";

// The fuel can register (#255; owner, 2026-10-02) on a real Postgres
// (PGlite). What matters: only a captain or a Power & Lighting lead writes,
// checked inside the write; a change is a compare-and-set on the version; each
// write leaves its audit row in the same transaction; a can's car counts only
// while its driver drives this year; and who fills a can is that car's driver,
// derived from the stored rows and never stored.

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

const can = (over: Partial<FuelCanInput> = {}): FuelCanInput =>
  FuelCanInput.parse({
    ownerUserId: null,
    sizeLitres: 20,
    material: "plastic",
    travelsWithUserId: null,
    ...over,
  });

describe("the fuel can register", () => {
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
    const member = await makeUser(h.db(), { displayName: "Pat Mokoena" });
    const dana = await makeUser(h.db(), { displayName: "Dana Driver" });
    await makeDriverProfile(h.db(), { userId: dana.id, cycle: 2026 });
    const sipho = await makeUser(h.db(), { displayName: "Sipho Ndlovu" });
    await makeDriverProfile(h.db(), { userId: sipho.id, cycle: 2026 });
    return { captain, powerLead, kitchenLead, member, dana, sipho };
  }

  async function add(actorId: string, over: Partial<FuelCanInput> = {}) {
    const made = await addFuelCan({ ...can(over), actorId });
    if (!made.ok) throw new Error(made.error);
    return made;
  }

  async function audit(action: string) {
    return h
      .db()
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.action, action));
  }

  it("lets a captain and a Power lead add cans, numbered in the sheet's order", async () => {
    const { captain, powerLead, member, dana } = await setup();
    const first = await add(captain.id, { sizeLitres: 25, material: "metal" });
    const second = await add(powerLead.id, {
      ownerUserId: member.id,
      travelsWithUserId: dana.id,
      note: "Green, dented lid",
    });
    expect([first.number, second.number]).toEqual([1, 2]);

    const rows = await listFuelCans();
    expect(rows.map((r) => [r.sizeLitres, r.material, r.ownerName])).toEqual([
      [25, "metal", null],
      [20, "plastic", "Pat Mokoena"],
    ]);
    expect(rows[1]!.travelsWithUserId).toBe(dana.id);
    expect(rows[1]!.note).toBe("Green, dented lid");
    expect(rows.every((r) => r.cycle === 2026)).toBe(true);

    // Each add leaves its row, naming the can and who added it.
    const added = await audit("power.fuel_can_added");
    expect(added.map((a) => a.actorId).sort()).toEqual(
      [captain.id, powerLead.id].sort(),
    );
    expect(added.find((a) => a.target === second.id)?.metadata).toMatchObject({
      cycle: 2026,
      number: 2,
      sizeLitres: 20,
      material: "plastic",
      ownerUserId: member.id,
      travelsWithUserId: dana.id,
    });
  });

  it("refuses a lead of another team and a plain member, with nothing written", async () => {
    const { kitchenLead, member } = await setup();
    for (const actor of [kitchenLead, member]) {
      expect(await addFuelCan({ ...can(), actorId: actor.id })).toEqual({
        ok: false,
        error: NOT_A_POWER_EDITOR,
      });
    }
    expect(await listFuelCans()).toEqual([]);
    expect(await audit("power.fuel_can_added")).toEqual([]);
  });

  it("refuses a change or a removal by a member, and leaves the can as it was", async () => {
    const { powerLead, member } = await setup();
    const made = await add(powerLead.id);
    const [row] = await listFuelCans();
    expect(
      await updateFuelCan({
        ...can({ sizeLitres: 5 }),
        canId: made.id,
        expectedVersion: row!.version,
        actorId: member.id,
      }),
    ).toEqual({ ok: false, error: NOT_A_POWER_EDITOR });
    expect(
      await removeFuelCan({
        canId: made.id,
        expectedVersion: row!.version,
        actorId: member.id,
      }),
    ).toEqual({ ok: false, error: NOT_A_POWER_EDITOR });
    expect((await listFuelCans())[0]!.sizeLitres).toBe(20);
  });

  it("changes a can from the version seen, and refuses a stale one", async () => {
    const { captain, powerLead, sipho } = await setup();
    const made = await add(powerLead.id);
    const [before] = await listFuelCans();

    expect(
      await updateFuelCan({
        ...can({ material: "metal", travelsWithUserId: sipho.id }),
        canId: made.id,
        expectedVersion: before!.version,
        actorId: powerLead.id,
      }),
    ).toEqual({ ok: true });
    // A second editor still holding the old version loses, with a sentence.
    expect(
      await updateFuelCan({
        ...can({ sizeLitres: 10 }),
        canId: made.id,
        expectedVersion: before!.version,
        actorId: captain.id,
      }),
    ).toEqual({ ok: false, error: CAN_CHANGED });
    expect(
      await removeFuelCan({
        canId: made.id,
        expectedVersion: before!.version,
        actorId: captain.id,
      }),
    ).toEqual({ ok: false, error: CAN_CHANGED });

    const [after] = await listFuelCans();
    expect(after).toMatchObject({
      sizeLitres: 20,
      material: "metal",
      travelsWithUserId: sipho.id,
      version: before!.version + 1,
    });
    expect(await audit("power.fuel_can_changed")).toHaveLength(1);
  });

  it("removes a can, numbers the rest again, and says when it is already gone", async () => {
    const { powerLead } = await setup();
    const one = await add(powerLead.id, { sizeLitres: 25 });
    await add(powerLead.id, { sizeLitres: 10 });
    const [first] = await listFuelCans();
    expect(
      await removeFuelCan({
        canId: one.id,
        expectedVersion: first!.version,
        actorId: powerLead.id,
      }),
    ).toEqual({ ok: true });
    expect((await listFuelCans()).map((r) => r.sizeLitres)).toEqual([10]);
    expect(
      await removeFuelCan({
        canId: one.id,
        expectedVersion: first!.version,
        actorId: powerLead.id,
      }),
    ).toEqual({ ok: false, error: CAN_GONE });
    const [removed] = await audit("power.fuel_can_removed");
    expect(removed?.metadata).toMatchObject({ number: 1, sizeLitres: 25 });
  });

  it("refuses an owner who is not a camp member, and a car not driving this year", async () => {
    const { powerLead, member } = await setup();
    const pending = await makeUser(h.db(), { approvalStatus: "pending" });
    expect(
      await addFuelCan({
        ...can({ ownerUserId: pending.id }),
        actorId: powerLead.id,
      }),
    ).toEqual({ ok: false, error: CAN_OWNER_NOT_MEMBER });
    // The member drives no car, and last year's driver is not this year's.
    const lastYear = await makeUser(h.db());
    await makeDriverProfile(h.db(), { userId: lastYear.id, cycle: 2025 });
    for (const driver of [member.id, lastYear.id]) {
      expect(
        await addFuelCan({
          ...can({ travelsWithUserId: driver }),
          actorId: powerLead.id,
        }),
      ).toEqual({ ok: false, error: CAN_CAR_GONE });
    }
    expect(await listFuelCans()).toEqual([]);
  });

  it("derives who fills each can from its car, and drops a car whose driver stops", async () => {
    const { powerLead, dana, sipho } = await setup();
    await add(powerLead.id, { sizeLitres: 25, travelsWithUserId: dana.id });
    await add(powerLead.id, { sizeLitres: 25, travelsWithUserId: sipho.id });
    await add(powerLead.id, { sizeLitres: 20, travelsWithUserId: dana.id });
    await add(powerLead.id, { sizeLitres: 15 });

    const board = await getTransportBoard();
    let rows = await listFuelCans();
    expect(rows.map((r) => fillingCar(r, board.cars)?.driverName)).toEqual([
      "Dana Driver",
      "Sipho Ndlovu",
      "Dana Driver",
      undefined,
    ]);
    let totals = canTotals(rows, board.cars);
    expect(
      totals.cars.map((c) => [c.car.driverName, c.cans, c.litres]),
    ).toEqual([
      ["Dana Driver", 2, 45],
      ["Sipho Ndlovu", 1, 25],
    ]);
    expect(totals.notOnCar).toEqual({ cans: 1, litres: 15 });

    // Sipho stops driving: his can is on no car, and nobody fills it yet.
    await h
      .db()
      .update(schema.driverProfiles)
      .set({ intendsToDrive: false })
      .where(
        and(
          eq(schema.driverProfiles.userId, sipho.id),
          eq(schema.driverProfiles.cycle, 2026),
        ),
      );
    rows = await listFuelCans();
    expect(rows[1]!.travelsWithUserId).toBeNull();
    totals = canTotals(rows, (await getTransportBoard()).cars);
    expect(totals.notOnCar).toEqual({ cans: 2, litres: 40 });
    expect(totals.all).toEqual({ cans: 4, litres: 85 });
  });

  it("keeps last year's cans out of this year's list", async () => {
    const { powerLead } = await setup();
    await h
      .db()
      .insert(schema.fuelCans)
      .values({ cycle: 2025, sizeLitres: 20, material: "metal" });
    await add(powerLead.id, { sizeLitres: 10 });
    expect((await listFuelCans()).map((r) => r.sizeLitres)).toEqual([10]);
    expect((await listFuelCans(2025)).map((r) => r.sizeLitres)).toEqual([20]);
  });

  it("makes an erased member's can the camp's, on no car", async () => {
    const { powerLead, dana } = await setup();
    await add(powerLead.id, {
      ownerUserId: dana.id,
      travelsWithUserId: dana.id,
    });
    await sanitiseAccount(dana.id);
    const [row] = await listFuelCans();
    expect(row).toMatchObject({ ownerUserId: null, travelsWithUserId: null });
  });
});

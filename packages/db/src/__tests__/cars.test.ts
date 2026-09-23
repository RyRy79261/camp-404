import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { useTestDb } from "./_harness";
import { makeDriverProfile, makeUser } from "./_factories";
import {
  addCarRider,
  getMyLift,
  listCarRiders,
  listDrivers,
  removeCarRider,
} from "../cars";
import * as schema from "../schema";

// Lifts for this year: the seat limit holds, only this year's drivers count,
// and each change writes its audit row. The camp has no year here, so this
// year is the sentinel (1).

describe("lifts", () => {
  const h = useTestDb();

  it("lists this year's drivers with a rider count", async () => {
    const db = h.db();
    const ada = await makeUser(db, {
      displayName: "Ada",
      approvalStatus: "approved",
    });
    const bob = await makeUser(db, {
      displayName: "Bob",
      approvalStatus: "approved",
    });
    const old = await makeUser(db, {
      displayName: "Old",
      approvalStatus: "approved",
    });
    await makeDriverProfile(db, { userId: ada.id });
    await makeDriverProfile(db, { userId: old.id, cycle: 2020 });
    await makeDriverProfile(db, { userId: bob.id, intendsToDrive: false });
    await db
      .update(schema.driverProfiles)
      .set({ seatsOffered: 2, departureCity: "Cape Town" })
      .where(eq(schema.driverProfiles.userId, ada.id));

    const rider = await makeUser(db, { approvalStatus: "approved" });
    expect(
      await addCarRider({
        driverUserId: ada.id,
        memberUserId: rider.id,
        actorId: ada.id,
      }),
    ).toEqual({ ok: true });

    expect(await listDrivers()).toEqual([
      expect.objectContaining({
        name: "Ada",
        seatsOffered: 2,
        departureCity: "Cape Town",
        riders: 1,
      }),
    ]);
    expect((await listCarRiders(ada.id)).map((r) => r.userId)).toEqual([
      rider.id,
    ]);
  });

  it("refuses a full car, the driver, a non-driver, an unapproved member and a repeat", async () => {
    const db = h.db();
    const driver = await makeUser(db, { approvalStatus: "approved" });
    await makeDriverProfile(db, { userId: driver.id });
    await db
      .update(schema.driverProfiles)
      .set({ seatsOffered: 1 })
      .where(eq(schema.driverProfiles.userId, driver.id));
    const first = await makeUser(db, { approvalStatus: "approved" });
    const second = await makeUser(db, { approvalStatus: "approved" });
    const pending = await makeUser(db, { approvalStatus: "pending" });
    const add = (memberUserId: string, driverUserId = driver.id) =>
      addCarRider({ driverUserId, memberUserId, actorId: driver.id });

    expect(await add(driver.id)).toEqual({ ok: false, reason: "own_car" });
    expect(await add(pending.id)).toEqual({
      ok: false,
      reason: "not_a_member",
    });
    expect(await add(first.id, second.id)).toEqual({
      ok: false,
      reason: "not_a_driver",
    });
    expect(await add(first.id)).toEqual({ ok: true });
    expect(await add(first.id)).toEqual({
      ok: false,
      reason: "already_in_this_car",
    });
    expect(await add(second.id)).toEqual({ ok: false, reason: "car_full" });
  });

  it("removes a rider once, with an audit row each way", async () => {
    const db = h.db();
    const driver = await makeUser(db, { approvalStatus: "approved" });
    const rider = await makeUser(db, { approvalStatus: "approved" });
    await makeDriverProfile(db, { userId: driver.id });
    await addCarRider({
      driverUserId: driver.id,
      memberUserId: rider.id,
      actorId: driver.id,
    });
    const input = {
      driverUserId: driver.id,
      memberUserId: rider.id,
      actorId: driver.id,
    };
    expect(await removeCarRider(input)).toBe(true);
    expect(await removeCarRider(input)).toBe(false);
    const audit = await db.select().from(schema.auditLog);
    expect(audit.map((a) => [a.action, a.target])).toEqual([
      ["car.rider_added", rider.id],
      ["car.rider_removed", rider.id],
    ]);
  });
});

describe("my lift", () => {
  const h = useTestDb();

  it("tells a driver their car and riders, a rider whose car they are in, and nobody else anything", async () => {
    const db = h.db();
    const ada = await makeUser(db, {
      displayName: "Ada",
      approvalStatus: "approved",
    });
    const rider = await makeUser(db, {
      displayName: "Ren",
      approvalStatus: "approved",
    });
    const walker = await makeUser(db, { approvalStatus: "approved" });
    await makeDriverProfile(db, { userId: ada.id });
    await db
      .update(schema.driverProfiles)
      .set({
        seatsOffered: 3,
        vehicleMake: "Toyota",
        vehicleModel: "Hilux",
        departureCity: "Cape Town",
      })
      .where(eq(schema.driverProfiles.userId, ada.id));
    await addCarRider({
      driverUserId: ada.id,
      memberUserId: rider.id,
      actorId: ada.id,
    });

    expect(await getMyLift(ada.id)).toMatchObject({
      role: "driver",
      vehicle: "Toyota Hilux",
      seatsOffered: 3,
      riders: ["Ren"],
      departureCity: "Cape Town",
    });
    expect(await getMyLift(rider.id)).toMatchObject({
      role: "rider",
      driverName: "Ada",
      vehicle: "Toyota Hilux",
      departureCity: "Cape Town",
    });
    expect(await getMyLift(walker.id)).toBeNull();
  });

  it("ignores last year's car", async () => {
    const db = h.db();
    const old = await makeUser(db, { approvalStatus: "approved" });
    await makeDriverProfile(db, { userId: old.id, cycle: 2020 });
    expect(await getMyLift(old.id)).toBeNull();
  });
});

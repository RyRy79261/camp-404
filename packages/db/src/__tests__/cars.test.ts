import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { useTestDb } from "./_harness";
import { makeDriverProfile, makeUser } from "./_factories";
import { getMyLift } from "../cars";
import { addRider } from "../transport";
import * as schema from "../schema";

// A member's own lift this year (seats are written by transport.ts, tested in
// transport.test.ts). The camp has no year here, so this year is the sentinel
// (1).

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
    expect(
      await addRider({
        driverUserId: ada.id,
        memberUserId: rider.id,
        actorId: ada.id,
      }),
    ).toEqual({ ok: true });

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

  it("shows a rider no lift once the driver stops driving", async () => {
    const db = h.db();
    const ada = await makeUser(db, {
      displayName: "Ada",
      approvalStatus: "approved",
    });
    const rider = await makeUser(db, { approvalStatus: "approved" });
    await makeDriverProfile(db, { userId: ada.id });
    await db
      .update(schema.driverProfiles)
      .set({ seatsOffered: 2 })
      .where(eq(schema.driverProfiles.userId, ada.id));
    expect(
      await addRider({
        driverUserId: ada.id,
        memberUserId: rider.id,
        actorId: ada.id,
      }),
    ).toEqual({ ok: true });
    expect(await getMyLift(rider.id)).toMatchObject({ role: "rider" });

    await db
      .update(schema.driverProfiles)
      .set({ intendsToDrive: false })
      .where(eq(schema.driverProfiles.userId, ada.id));
    expect(await getMyLift(rider.id)).toBeNull();
  });

  it("ignores last year's car", async () => {
    const db = h.db();
    const old = await makeUser(db, { approvalStatus: "approved" });
    await makeDriverProfile(db, { userId: old.id, cycle: 2020 });
    expect(await getMyLift(old.id)).toBeNull();
  });

  it("reads the year a caller passes, the same as the one it would read itself", async () => {
    const db = h.db();
    const old = await makeUser(db, { approvalStatus: "approved" });
    await makeDriverProfile(db, { userId: old.id, cycle: 2020 });
    // The camp has no year, so its own read lands on the sentinel (1).
    expect(await getMyLift(old.id, 1)).toEqual(await getMyLift(old.id));
    expect(await getMyLift(old.id, 1)).toBeNull();
    expect(await getMyLift(old.id, 2020)).toMatchObject({ role: "driver" });
  });
});

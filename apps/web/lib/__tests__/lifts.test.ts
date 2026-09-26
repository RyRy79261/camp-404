// @vitest-environment node
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@camp404/db/schema";
import { addCarRider } from "@camp404/db/cars";
import { useTestDb } from "../../../../packages/db/src/__tests__/_harness";
import {
  makeDriverProfile,
  makeUser,
} from "../../../../packages/db/src/__tests__/_factories";

// getMyLift's E2E twin (the owner's decision 11 A): the home page's lift card
// and the My lift program read it, so under Playwright it must answer what
// the database answers. Each case seeds one camp both ways, against real
// Postgres (PGlite) and the test store, and compares.

const store = vi.hoisted(() => ({ on: false }));
vi.mock("@/lib/test-mode", () => ({
  isE2ETestMode: () => store.on,
  usesTestStore: () => store.on,
  TEST_USER_COOKIE: "camp404_test_user",
}));

import { testStore } from "../test-store";
import { getMyLift } from "../lifts";

type DB = ReturnType<ReturnType<typeof useTestDb>["db"]>;

interface Car {
  vehicleMake: string;
  vehicleModel: string;
  seatsOffered: number;
  departureCity: string;
}
const HILUX: Car = {
  vehicleMake: "Toyota",
  vehicleModel: "Hilux",
  seatsOffered: 3,
  departureCity: "Cape Town",
};

async function dbDriver(db: DB, name: string, car: Car, cycle = 1) {
  const user = await makeUser(db, {
    displayName: name,
    approvalStatus: "approved",
  });
  await makeDriverProfile(db, { userId: user.id, cycle });
  await db
    .update(schema.driverProfiles)
    .set(car)
    .where(eq(schema.driverProfiles.userId, user.id));
  return user;
}

function storeUser(name: string) {
  return testStore.createUser({
    authUserId: `auth-${name}`,
    displayName: name,
    inviteCode: "seed",
  });
}

describe("getMyLift: the database and the test store agree", () => {
  const h = useTestDb();

  beforeEach(() => {
    store.on = false;
    testStore.reset();
  });
  afterEach(() => {
    store.on = false;
  });

  it("for a driver with two riders, each rider, and a member with no lift", async () => {
    const db = h.db();
    const ada = await dbDriver(db, "Ada", HILUX);
    const ren = await makeUser(db, {
      displayName: "Ren",
      approvalStatus: "approved",
    });
    const sam = await makeUser(db, {
      displayName: "Sam",
      approvalStatus: "approved",
    });
    const walker = await makeUser(db, { approvalStatus: "approved" });
    for (const rider of [ren, sam]) {
      await addCarRider({
        driverUserId: ada.id,
        memberUserId: rider.id,
        actorId: ada.id,
      });
    }
    const fromDb = {
      driver: await getMyLift(ada.id),
      rider: await getMyLift(ren.id),
      walker: await getMyLift(walker.id),
    };

    store.on = true;
    const sAda = storeUser("Ada");
    const sRen = storeUser("Ren");
    const sSam = storeUser("Sam");
    const sWalker = storeUser("Walker");
    testStore.seedDriverProfile({ userId: sAda.id, ...HILUX });
    testStore.seedCarRider({ driverUserId: sAda.id, memberUserId: sRen.id });
    testStore.seedCarRider({ driverUserId: sAda.id, memberUserId: sSam.id });
    const fromStore = {
      driver: await getMyLift(sAda.id),
      rider: await getMyLift(sRen.id),
      walker: await getMyLift(sWalker.id),
    };

    expect(fromDb.driver).toMatchObject({
      role: "driver",
      vehicle: "Toyota Hilux",
      riders: ["Ren", "Sam"],
    });
    expect(fromDb.rider).toMatchObject({ role: "rider", driverName: "Ada" });
    expect(fromDb.walker).toBeNull();
    expect(fromStore).toEqual(fromDb);
  });

  it("for a rider whose driver stopped driving, and last year's driver", async () => {
    const db = h.db();
    const ada = await dbDriver(db, "Ada", HILUX);
    const ren = await makeUser(db, {
      displayName: "Ren",
      approvalStatus: "approved",
    });
    await addCarRider({
      driverUserId: ada.id,
      memberUserId: ren.id,
      actorId: ada.id,
    });
    await db
      .update(schema.driverProfiles)
      .set({ intendsToDrive: false })
      .where(eq(schema.driverProfiles.userId, ada.id));
    const old = await dbDriver(db, "Old", HILUX, 2020);
    const fromDb = {
      rider: await getMyLift(ren.id),
      stopped: await getMyLift(ada.id),
      old: await getMyLift(old.id),
    };

    store.on = true;
    const sAda = storeUser("Ada");
    const sRen = storeUser("Ren");
    const sOld = storeUser("Old");
    testStore.seedDriverProfile({ userId: sAda.id, ...HILUX });
    testStore.seedCarRider({ driverUserId: sAda.id, memberUserId: sRen.id });
    testStore.seedDriverProfile({
      userId: sAda.id,
      ...HILUX,
      intendsToDrive: false,
    });
    testStore.seedDriverProfile({ userId: sOld.id, ...HILUX, cycle: 2020 });
    const fromStore = {
      rider: await getMyLift(sRen.id),
      stopped: await getMyLift(sAda.id),
      old: await getMyLift(sOld.id),
    };

    expect(fromDb).toEqual({ rider: null, stopped: null, old: null });
    expect(fromStore).toEqual(fromDb);
  });
});

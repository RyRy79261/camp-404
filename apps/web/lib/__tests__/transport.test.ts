// @vitest-environment node
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@camp404/db/schema";
import { useTestDb } from "../../../../packages/db/src/__tests__/_harness";
import {
  makeDriverProfile,
  makeMembership,
  makeUser,
} from "../../../../packages/db/src/__tests__/_factories";

// The Transport twins (#270): the Transport page and its E2E specs read and
// write the test store, so under Playwright it must answer what the database
// answers. One camp is built both ways, through the same facade calls, against
// real Postgres (PGlite) and the test store, and every read and every write's
// answer is compared with the ids swapped for names.

const store = vi.hoisted(() => ({ on: false }));
vi.mock("@/lib/test-mode", () => ({
  isE2ETestMode: () => store.on,
  usesTestStore: () => store.on,
  TEST_USER_COOKIE: "camp404_test_user",
}));

import { testStore } from "../test-store";
import * as transport from "../transport";

type DB = ReturnType<ReturnType<typeof useTestDb>["db"]>;

const NAMES = ["Ada", "Cai", "Bea", "Dee", "Eve", "Fay", "Tran", "Kit", "Gus"];
type Ids = Record<string, string>;

/** When a member's open request was made, as the answerer's page shows it. */
async function seen(userId: string): Promise<string> {
  const request = (await transport.listLiftRequests()).find(
    (r) => r.userId === userId,
  );
  return (request?.createdAt ?? new Date(0)).toISOString();
}

/** The same script, whichever backend the facade is on. */
async function script(id: Ids) {
  const results: unknown[] = [];
  const note = (r: unknown) => results.push(r);
  note(
    await transport.requestLift({ actorId: id.Bea!, driverUserId: id.Ada! }),
  );
  note(await transport.requestLift({ actorId: id.Dee!, driverUserId: null }));
  note(await transport.requestLift({ actorId: id.Ada!, driverUserId: null }));
  note(
    await transport.answerLiftRequest({
      actorId: id.Kit!,
      memberUserId: id.Bea!,
      accept: true,
      requestedAt: await seen(id.Bea!),
    }),
  );
  note(
    await transport.answerLiftRequest({
      actorId: id.Ada!,
      memberUserId: id.Bea!,
      accept: true,
      requestedAt: await seen(id.Bea!),
    }),
  );
  note(
    await transport.addRider({
      actorId: id.Cai!,
      driverUserId: id.Cai!,
      memberUserId: id.Fay!,
    }),
  );
  note(
    await transport.addRider({
      actorId: id.Cai!,
      driverUserId: id.Cai!,
      memberUserId: id.Eve!,
    }),
  );
  note(
    await transport.setSeatsOffered({
      actorId: id.Ada!,
      driverUserId: id.Ada!,
      seatsOffered: 0,
    }),
  );
  const trailer = await transport.addTrailer({
    actorId: id.Tran!,
    name: "Box",
    notes: null,
  });
  note(trailer.ok);
  note(
    await transport.addTrailer({ actorId: id.Kit!, name: "No", notes: null }),
  );
  if (trailer.ok) {
    note(
      await transport.setTrailerTow({
        actorId: id.Tran!,
        trailerId: trailer.id,
        driverUserId: id.Cai!,
        expectedVersion: 0,
      }),
    );
    note(
      await transport.setTrailerTow({
        actorId: id.Tran!,
        trailerId: trailer.id,
        driverUserId: id.Ada!,
        expectedVersion: 0,
      }),
    );
  }
  const sent = await transport.sendCarMessage({
    senderId: id.Ada!,
    title: "Hi",
    body: "Leaving at 6",
  });
  note(sent.ok ? sent.recipientCount : sent);
  note(
    await transport.sendCarMessage({
      senderId: id.Bea!,
      title: "Hi",
      body: "Hello",
    }),
  );

  const board = await transport.getTransportBoard();
  return {
    results,
    cars: board.cars.map((c) => ({ ...c, trailer: c.trailer?.name ?? null })),
    trailers: board.trailers.map((t) => ({
      name: t.name,
      towedByName: t.towedByName,
    })),
    requests: (await transport.listLiftRequests()).map((r) => ({
      name: r.name,
      driverUserId: r.driverUserId,
    })),
    unseated: await transport.listUnseated(),
    drives: await transport.drivesThisYear(id.Ada!),
  };
}

/** Swap every id for its name, so the two backends compare. */
function named(value: unknown, id: Ids): unknown {
  let text = JSON.stringify(value);
  for (const [name, uid] of Object.entries(id)) {
    text = text.split(uid).join(`<${name}>`);
  }
  return JSON.parse(text);
}

async function dbCamp(db: DB): Promise<Ids> {
  const id: Ids = {};
  for (const name of NAMES) {
    id[name] = (
      await makeUser(db, { displayName: name, approvalStatus: "approved" })
    ).id;
  }
  for (const [name, seats, canTow] of [
    ["Ada", 2, true],
    ["Cai", 1, false],
  ] as const) {
    await makeDriverProfile(db, { userId: id[name]! });
    await db
      .update(schema.driverProfiles)
      .set({
        seatsOffered: seats,
        canTow,
        vehicleMake: "Toyota",
        vehicleModel: name === "Ada" ? "Hilux" : "Corolla",
        departureCity: "Cape Town",
      })
      .where(eq(schema.driverProfiles.userId, id[name]!));
  }
  await makeMembership(db, {
    userId: id.Tran!,
    team: "transport_and_logistics",
    isLead: true,
  });
  await makeMembership(db, { userId: id.Kit!, team: "kitchen", isLead: true });
  for (const [name, status] of [
    ["Bea", "accepted"],
    ["Dee", "applied"],
    ["Eve", "not_attending"],
    ["Fay", "maybe"],
    ["Gus", "maybe"],
  ] as const) {
    await db.insert(schema.campParticipations).values({
      userId: id[name]!,
      status,
      intent:
        status === "maybe"
          ? "maybe"
          : status === "not_attending"
            ? "no"
            : "yes",
    });
  }
  return id;
}

function storeCamp(): Ids {
  const id: Ids = {};
  for (const name of NAMES) {
    id[name] = testStore.createUser({
      authUserId: `auth-${name}`,
      displayName: name,
      inviteCode: "seed",
    }).id;
  }
  testStore.seedDriverProfile({
    userId: id.Ada!,
    seatsOffered: 2,
    canTow: true,
    vehicleMake: "Toyota",
    vehicleModel: "Hilux",
    departureCity: "Cape Town",
  });
  testStore.seedDriverProfile({
    userId: id.Cai!,
    seatsOffered: 1,
    canTow: false,
    vehicleMake: "Toyota",
    vehicleModel: "Corolla",
    departureCity: "Cape Town",
  });
  testStore.seedTeamMembership({
    userId: id.Tran!,
    team: "transport_and_logistics",
    isLead: true,
  });
  testStore.seedTeamMembership({
    userId: id.Kit!,
    team: "kitchen",
    isLead: true,
  });
  for (const [name, status] of [
    ["Bea", "accepted"],
    ["Dee", "applied"],
    ["Eve", "not_attending"],
    ["Fay", "maybe"],
    ["Gus", "maybe"],
  ] as const) {
    testStore.seedParticipation({ userId: id[name]!, status });
  }
  return id;
}

describe("Transport: the database and the test store agree", () => {
  const h = useTestDb();

  beforeEach(() => {
    store.on = false;
    testStore.reset();
  });
  afterEach(() => {
    store.on = false;
  });

  it("on every read and every write's answer, through one camp's evening", async () => {
    const dbIds = await dbCamp(h.db());
    const fromDb = named(await script(dbIds), dbIds);

    store.on = true;
    const storeIds = storeCamp();
    const fromStore = named(await script(storeIds), storeIds);

    // A few anchors, so agreeing on nothing cannot pass.
    expect(fromDb).toMatchObject({
      cars: [
        {
          driverName: "Ada",
          riders: [{ name: "Bea" }],
          trailer: "Box",
        },
        { driverName: "Cai", riders: [{ name: "Fay" }] },
      ],
      requests: [{ name: "Dee", driverUserId: null }],
      unseated: [
        { name: "Dee", status: "applied" },
        { name: "Gus", status: "maybe" },
      ],
      drives: true,
    });
    expect(fromStore).toEqual(fromDb);
  });
});

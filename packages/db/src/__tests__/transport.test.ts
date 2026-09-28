import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { TRANSPORT_TEAM } from "@camp404/core";
import { useTestDb } from "./_harness";
import {
  makeCarMember,
  makeDriverProfile,
  makeMembership,
  makeUser,
} from "./_factories";
import {
  ALREADY_SEATED,
  ALREADY_TOWING,
  CANNOT_TOW,
  CAR_EMPTY,
  CAR_FULL,
  CAR_MESSAGE_REFUSED,
  IS_DRIVING,
  NOT_A_MEMBER,
  NOT_A_TRANSPORT_EDITOR,
  NOT_YOUR_CAR,
  SEATS_BELOW_RIDERS,
  TRAILER_CHANGED,
  YOU_ARE_DRIVING,
  YOU_HAVE_A_SEAT,
  addRider,
  addTrailer,
  answerLiftRequest,
  getTransportBoard,
  listLiftRequests,
  listUnseated,
  removeRider,
  requestLift,
  sendCarMessage,
  setSeatsOffered,
  setTrailerTow,
  updateTrailer,
  withdrawLiftRequest,
} from "../transport";
import { sanitiseAccount } from "../account";
import * as schema from "../schema";

// Transport (#270) against real Postgres. The camp has no year here, so this
// year is the sentinel (1). Every write re-reads its actor, so the refusals
// below come from the rows, never from what a caller claimed.

type DB = ReturnType<ReturnType<typeof useTestDb>["db"]>;

const approved = (db: DB, displayName: string) =>
  makeUser(db, { displayName, approvalStatus: "approved" });

async function driver(
  db: DB,
  name: string,
  car: { seatsOffered?: number | null; canTow?: boolean; cycle?: number } = {},
) {
  const user = await approved(db, name);
  await makeDriverProfile(db, { userId: user.id, cycle: car.cycle });
  await db
    .update(schema.driverProfiles)
    .set({
      vehicleMake: "Toyota",
      vehicleModel: "Hilux",
      departureCity: "Cape Town",
      seatsOffered: car.seatsOffered === undefined ? 3 : car.seatsOffered,
      canTow: car.canTow ?? false,
      vehicleRegistration: "CA 123-456",
    })
    .where(eq(schema.driverProfiles.userId, user.id));
  return user;
}

async function lead(db: DB, name: string, team: string) {
  const user = await approved(db, name);
  await makeMembership(db, {
    userId: user.id,
    team: team as (typeof schema.teamEnum.enumValues)[number],
    isLead: true,
  });
  return user;
}

async function coming(
  db: DB,
  userId: string,
  status: (typeof schema.participationStatusEnum.enumValues)[number],
) {
  await db.insert(schema.campParticipations).values({
    userId,
    cycle: 1,
    status,
    intent:
      status === "maybe" ? "maybe" : status === "not_attending" ? "no" : "yes",
  });
}

async function deliveriesOf(db: DB, broadcastId: string) {
  return db
    .select({
      userId: schema.notificationDeliveries.userId,
      kind: schema.notificationDeliveries.kind,
      title: schema.notificationDeliveries.title,
      refType: schema.notificationDeliveries.refType,
      emailStatus: schema.notificationDeliveries.emailStatus,
    })
    .from(schema.notificationDeliveries)
    .where(eq(schema.notificationDeliveries.broadcastId, broadcastId));
}

describe("the car list", () => {
  const h = useTestDb();

  it("lists this year's cars with riders and trailer, and no private detail", async () => {
    const db = h.db();
    const ada = await driver(db, "Ada", { canTow: true });
    const bea = await approved(db, "Bea");
    await makeCarMember(db, { driverUserId: ada.id, memberUserId: bea.id });
    // Not listed: last year's car, and someone who said they won't drive.
    await driver(db, "Old", { cycle: 2020 });
    const off = await approved(db, "Off");
    await makeDriverProfile(db, { userId: off.id, intendsToDrive: false });
    const captain = await makeUser(db, {
      rank: "captain",
      approvalStatus: "approved",
    });
    const added = await addTrailer({
      actorId: captain.id,
      name: "Box trailer",
      notes: null,
    });
    expect(added.ok).toBe(true);
    const trailerId = (added as { id: string }).id;
    expect(
      await setTrailerTow({
        actorId: captain.id,
        trailerId,
        driverUserId: ada.id,
        expectedVersion: 0,
      }),
    ).toEqual({ ok: true });

    const board = await getTransportBoard();
    expect(board.cars).toEqual([
      {
        driverUserId: ada.id,
        driverName: "Ada",
        vehicle: "Toyota Hilux",
        departureCity: "Cape Town",
        seatsOffered: 3,
        canTow: true,
        riders: [{ userId: bea.id, name: "Bea" }],
        trailer: { id: trailerId, name: "Box trailer" },
      },
    ]);
    // The registration was seeded and is captain-only: it is not on the list.
    expect(JSON.stringify(board)).not.toContain("CA 123-456");
    expect(board.trailers[0]).toMatchObject({
      towedByUserId: ada.id,
      towedByName: "Ada",
    });

    // A driver who stops driving no longer tows anything on the list.
    await db
      .update(schema.driverProfiles)
      .set({ intendsToDrive: false })
      .where(eq(schema.driverProfiles.userId, ada.id));
    const after = await getTransportBoard();
    expect(after.cars).toEqual([]);
    expect(after.trailers[0]).toMatchObject({
      towedByUserId: null,
      towedByName: null,
    });
  });

  it("lists the members still without a seat: coming, not driving, not seated", async () => {
    const db = h.db();
    const ada = await driver(db, "Ada");
    await coming(db, ada.id, "accepted");
    const seated = await approved(db, "Seated");
    await coming(db, seated.id, "accepted");
    await makeCarMember(db, { driverUserId: ada.id, memberUserId: seated.id });
    const yes = await approved(db, "Yes");
    await coming(db, yes.id, "applied");
    const maybe = await approved(db, "Maybe");
    await coming(db, maybe.id, "maybe");
    const no = await approved(db, "No");
    await coming(db, no.id, "not_attending");
    const waiting = await approved(db, "Waiting");
    await coming(db, waiting.id, "waitlisted");
    await approved(db, "Silent");

    expect((await listUnseated()).map((m) => m.name)).toEqual(["Maybe", "Yes"]);
  });
});

describe("seats", () => {
  const h = useTestDb();

  it("lets the driver, a captain and a Transport & Logistics lead seat people, and no one else", async () => {
    const db = h.db();
    const ada = await driver(db, "Ada");
    const cai = await driver(db, "Cai");
    const member = await approved(db, "Member");
    const kitchenLead = await lead(db, "Kitchen lead", "kitchen");
    const transportLead = await lead(db, "Transport lead", TRANSPORT_TEAM);
    const captain = await makeUser(db, {
      rank: "captain",
      approvalStatus: "approved",
    });
    const riders = await Promise.all(
      ["R1", "R2", "R3"].map((n) => approved(db, n)),
    );
    const seat = (actorId: string, memberUserId: string) =>
      addRider({ actorId, driverUserId: ada.id, memberUserId });

    // Refused: a plain member, another driver, a lead of another team.
    expect(await seat(member.id, riders[0]!.id)).toEqual({
      ok: false,
      error: NOT_YOUR_CAR,
    });
    expect(await seat(cai.id, riders[0]!.id)).toEqual({
      ok: false,
      error: NOT_YOUR_CAR,
    });
    expect(await seat(kitchenLead.id, riders[0]!.id)).toEqual({
      ok: false,
      error: NOT_YOUR_CAR,
    });

    expect(await seat(ada.id, riders[0]!.id)).toEqual({ ok: true });
    expect(await seat(transportLead.id, riders[1]!.id)).toEqual({ ok: true });
    expect(await seat(captain.id, riders[2]!.id)).toEqual({ ok: true });
    // Three seats offered, three taken.
    expect(await seat(ada.id, member.id)).toEqual({
      ok: false,
      error: CAR_FULL,
    });

    const audit = await db
      .select({
        action: schema.auditLog.action,
        actorId: schema.auditLog.actorId,
      })
      .from(schema.auditLog)
      .where(eq(schema.auditLog.action, "car.rider_added"));
    expect(audit.map((a) => a.actorId).sort()).toEqual(
      [ada.id, transportLead.id, captain.id].sort(),
    );
  });

  it("refuses a second seat, a driver as rider, and an unapproved member", async () => {
    const db = h.db();
    const ada = await driver(db, "Ada");
    const cai = await driver(db, "Cai");
    const rider = await approved(db, "Rider");
    const pending = await makeUser(db, { approvalStatus: "pending" });
    expect(
      await addRider({
        actorId: ada.id,
        driverUserId: ada.id,
        memberUserId: rider.id,
      }),
    ).toEqual({ ok: true });
    expect(
      await addRider({
        actorId: cai.id,
        driverUserId: cai.id,
        memberUserId: rider.id,
      }),
    ).toEqual({ ok: false, error: ALREADY_SEATED });
    expect(
      await addRider({
        actorId: ada.id,
        driverUserId: ada.id,
        memberUserId: cai.id,
      }),
    ).toEqual({ ok: false, error: IS_DRIVING });
    expect(
      await addRider({
        actorId: ada.id,
        driverUserId: ada.id,
        memberUserId: pending.id,
      }),
    ).toEqual({ ok: false, error: NOT_A_MEMBER });
  });

  it("lets a rider leave, but not take someone else out", async () => {
    const db = h.db();
    const ada = await driver(db, "Ada");
    const r1 = await approved(db, "R1");
    const r2 = await approved(db, "R2");
    await makeCarMember(db, { driverUserId: ada.id, memberUserId: r1.id });
    await makeCarMember(db, { driverUserId: ada.id, memberUserId: r2.id });
    expect(
      await removeRider({
        actorId: r1.id,
        driverUserId: ada.id,
        memberUserId: r2.id,
      }),
    ).toEqual({ ok: false, error: NOT_YOUR_CAR });
    expect(
      await removeRider({
        actorId: r1.id,
        driverUserId: ada.id,
        memberUserId: r1.id,
      }),
    ).toEqual({ ok: true });
    const left = await db
      .select()
      .from(schema.carMembers)
      .where(eq(schema.carMembers.driverUserId, ada.id));
    expect(left.map((r) => r.memberUserId)).toEqual([r2.id]);
  });

  it("keeps seats offered at or above the riders, for the driver or an editor only", async () => {
    const db = h.db();
    const ada = await driver(db, "Ada");
    const cai = await driver(db, "Cai");
    const r1 = await approved(db, "R1");
    const r2 = await approved(db, "R2");
    await makeCarMember(db, { driverUserId: ada.id, memberUserId: r1.id });
    await makeCarMember(db, { driverUserId: ada.id, memberUserId: r2.id });
    expect(
      await setSeatsOffered({
        actorId: cai.id,
        driverUserId: ada.id,
        seatsOffered: 4,
      }),
    ).toEqual({ ok: false, error: NOT_YOUR_CAR });
    expect(
      await setSeatsOffered({
        actorId: ada.id,
        driverUserId: ada.id,
        seatsOffered: 1,
      }),
    ).toEqual({ ok: false, error: SEATS_BELOW_RIDERS });
    expect(
      await setSeatsOffered({
        actorId: ada.id,
        driverUserId: ada.id,
        seatsOffered: 2,
      }),
    ).toEqual({ ok: true });
    const [row] = await db
      .select({ seats: schema.driverProfiles.seatsOffered })
      .from(schema.driverProfiles)
      .where(eq(schema.driverProfiles.userId, ada.id));
    expect(row?.seats).toBe(2);
  });
});

describe("lift requests", () => {
  const h = useTestDb();

  it("lets a member ask, and the asked driver accept, which spends the request", async () => {
    const db = h.db();
    const ada = await driver(db, "Ada");
    const cai = await driver(db, "Cai");
    const kitchenLead = await lead(db, "Kitchen lead", "kitchen");
    const bea = await approved(db, "Bea");

    expect(
      await requestLift({ actorId: bea.id, driverUserId: ada.id }),
    ).toEqual({
      ok: true,
    });
    expect(await listLiftRequests()).toEqual([
      expect.objectContaining({ userId: bea.id, driverUserId: ada.id }),
    ]);
    // Another driver and a lead of another team may not answer it.
    for (const actor of [cai, kitchenLead]) {
      expect(
        await answerLiftRequest({
          actorId: actor.id,
          memberUserId: bea.id,
          accept: true,
        }),
      ).toEqual({ ok: false, error: NOT_YOUR_CAR });
    }
    expect(
      await answerLiftRequest({
        actorId: ada.id,
        memberUserId: bea.id,
        accept: true,
      }),
    ).toEqual({ ok: true });
    expect(await listLiftRequests()).toEqual([]);
    expect((await getTransportBoard()).cars[0]?.riders).toEqual([
      { userId: bea.id, name: "Bea" },
    ]);
    // Seated now, so a second ask is refused.
    expect(await requestLift({ actorId: bea.id, driverUserId: null })).toEqual({
      ok: false,
      error: YOU_HAVE_A_SEAT,
    });
    expect(await requestLift({ actorId: ada.id, driverUserId: null })).toEqual({
      ok: false,
      error: YOU_ARE_DRIVING,
    });
  });

  it("leaves an any-car request to the transport team, who match it by seating", async () => {
    const db = h.db();
    const ada = await driver(db, "Ada");
    const transportLead = await lead(db, "Transport lead", TRANSPORT_TEAM);
    const bea = await approved(db, "Bea");
    const cid = await approved(db, "Cid");
    await requestLift({ actorId: bea.id, driverUserId: null });
    await requestLift({ actorId: cid.id, driverUserId: null });
    // A driver may not answer a request that did not ask for their car.
    expect(
      await answerLiftRequest({
        actorId: ada.id,
        memberUserId: bea.id,
        accept: false,
      }),
    ).toEqual({ ok: false, error: NOT_YOUR_CAR });
    expect(
      await addRider({
        actorId: transportLead.id,
        driverUserId: ada.id,
        memberUserId: bea.id,
      }),
    ).toEqual({ ok: true });
    expect(
      await answerLiftRequest({
        actorId: transportLead.id,
        memberUserId: cid.id,
        accept: false,
      }),
    ).toEqual({ ok: true });
    expect(await listLiftRequests()).toEqual([]);
  });

  it("lets a member withdraw their own request", async () => {
    const db = h.db();
    const bea = await approved(db, "Bea");
    await requestLift({ actorId: bea.id, driverUserId: null });
    expect(await withdrawLiftRequest({ actorId: bea.id })).toEqual({
      ok: true,
    });
    expect(await listLiftRequests()).toEqual([]);
  });
});

describe("trailers", () => {
  const h = useTestDb();

  it("are kept by captains and Transport & Logistics leads only, one per car that can tow", async () => {
    const db = h.db();
    const tower = await driver(db, "Tower", { canTow: true });
    const sedan = await driver(db, "Sedan", { canTow: false });
    const member = await approved(db, "Member");
    const kitchenLead = await lead(db, "Kitchen lead", "kitchen");
    const transportLead = await lead(db, "Transport lead", TRANSPORT_TEAM);

    for (const actor of [member, kitchenLead, tower]) {
      expect(
        await addTrailer({ actorId: actor.id, name: "Nope", notes: null }),
      ).toEqual({ ok: false, error: NOT_A_TRANSPORT_EDITOR });
    }
    const a = await addTrailer({
      actorId: transportLead.id,
      name: "A",
      notes: null,
    });
    const b = await addTrailer({
      actorId: transportLead.id,
      name: "B",
      notes: "Water",
    });
    const aId = (a as { id: string }).id;
    const bId = (b as { id: string }).id;

    expect(
      await setTrailerTow({
        actorId: transportLead.id,
        trailerId: aId,
        driverUserId: sedan.id,
        expectedVersion: 0,
      }),
    ).toEqual({ ok: false, error: CANNOT_TOW });
    expect(
      await setTrailerTow({
        actorId: transportLead.id,
        trailerId: aId,
        driverUserId: tower.id,
        expectedVersion: 0,
      }),
    ).toEqual({ ok: true });
    expect(
      await setTrailerTow({
        actorId: transportLead.id,
        trailerId: bId,
        driverUserId: tower.id,
        expectedVersion: 0,
      }),
    ).toEqual({ ok: false, error: ALREADY_TOWING });
    // A stale version loses, in a sentence.
    expect(
      await updateTrailer({
        actorId: transportLead.id,
        trailerId: aId,
        name: "A2",
        notes: null,
        expectedVersion: 0,
      }),
    ).toEqual({ ok: false, error: TRAILER_CHANGED });
    expect(
      await updateTrailer({
        actorId: transportLead.id,
        trailerId: aId,
        name: "A2",
        notes: null,
        expectedVersion: 1,
      }),
    ).toEqual({ ok: true });
  });
});

describe("the car message", () => {
  const h = useTestDb();

  it("reaches the sender's own riders this year, and no one else", async () => {
    const db = h.db();
    const ada = await driver(db, "Ada");
    const cai = await driver(db, "Cai");
    const mine = await approved(db, "Mine");
    const alsoMine = await approved(db, "Also mine");
    const theirs = await approved(db, "Theirs");
    await makeCarMember(db, { driverUserId: ada.id, memberUserId: mine.id });
    await makeCarMember(db, {
      driverUserId: ada.id,
      memberUserId: alsoMine.id,
    });
    await makeCarMember(db, { driverUserId: cai.id, memberUserId: theirs.id });
    // Last year Ada drove someone else: not reached.
    const lastYear = await approved(db, "Last year");
    await makeDriverProfile(db, { userId: ada.id, cycle: 2020 });
    await makeCarMember(db, {
      driverUserId: ada.id,
      memberUserId: lastYear.id,
      cycle: 2020,
    });

    const sent = await sendCarMessage({
      senderId: ada.id,
      title: "Leaving at 6",
      body: "Meet at the garage.",
    });
    expect(sent).toMatchObject({ ok: true, recipientCount: 2 });
    const { broadcastId } = sent as { broadcastId: string };
    const deliveries = await deliveriesOf(db, broadcastId);
    expect(deliveries.map((d) => d.userId).sort()).toEqual(
      [mine.id, alsoMine.id].sort(),
    );
    for (const d of deliveries) {
      expect(d).toMatchObject({
        kind: "car_message",
        title: "Leaving at 6",
        refType: "car_message",
        emailStatus: "skipped",
      });
    }
    const [b] = await db
      .select()
      .from(schema.broadcasts)
      .where(eq(schema.broadcasts.id, broadcastId));
    expect(b).toMatchObject({
      scope: "car",
      kind: "car_message",
      senderId: ada.id,
    });
    expect(b?.dispatchedAt).not.toBeNull();
  });

  it("refuses a rider, a captain who is not driving, a driver who stopped, and an empty car", async () => {
    const db = h.db();
    const ada = await driver(db, "Ada");
    const rider = await approved(db, "Rider");
    await makeCarMember(db, { driverUserId: ada.id, memberUserId: rider.id });
    const captain = await makeUser(db, {
      rank: "captain",
      approvalStatus: "approved",
    });
    const empty = await driver(db, "Empty");
    const msg = { title: "Hi", body: "Hello" };

    expect(await sendCarMessage({ senderId: rider.id, ...msg })).toEqual({
      ok: false,
      error: CAR_MESSAGE_REFUSED,
    });
    expect(await sendCarMessage({ senderId: captain.id, ...msg })).toEqual({
      ok: false,
      error: CAR_MESSAGE_REFUSED,
    });
    expect(await sendCarMessage({ senderId: empty.id, ...msg })).toEqual({
      ok: false,
      error: CAR_EMPTY,
    });
    await db
      .update(schema.driverProfiles)
      .set({ intendsToDrive: false })
      .where(eq(schema.driverProfiles.userId, ada.id));
    expect(await sendCarMessage({ senderId: ada.id, ...msg })).toEqual({
      ok: false,
      error: CAR_MESSAGE_REFUSED,
    });
    // Nothing was written by any refusal.
    expect(await db.select().from(schema.broadcasts)).toEqual([]);
    expect(await db.select().from(schema.notificationDeliveries)).toEqual([]);
  });
});

describe("erasure", () => {
  const h = useTestDb();

  it("deletes the member's lift request, turns requests for their car into any car, and frees their trailer", async () => {
    const db = h.db();
    const ada = await driver(db, "Ada", { canTow: true });
    const bea = await approved(db, "Bea");
    const captain = await makeUser(db, {
      rank: "captain",
      approvalStatus: "approved",
    });
    await requestLift({ actorId: bea.id, driverUserId: ada.id });
    const cid = await approved(db, "Cid");
    await requestLift({ actorId: cid.id, driverUserId: null });
    const t = await addTrailer({ actorId: captain.id, name: "T", notes: null });
    await setTrailerTow({
      actorId: captain.id,
      trailerId: (t as { id: string }).id,
      driverUserId: ada.id,
      expectedVersion: 0,
    });

    await sanitiseAccount(ada.id);
    await sanitiseAccount(cid.id);

    const requests = await db.select().from(schema.liftRequests);
    expect(requests).toEqual([
      expect.objectContaining({ userId: bea.id, driverUserId: null }),
    ]);
    const [trailer] = await db
      .select({ towedBy: schema.transportTrailers.towedByUserId })
      .from(schema.transportTrailers);
    expect(trailer?.towedBy).toBeNull();
    expect(
      await db
        .select()
        .from(schema.liftRequests)
        .where(and(eq(schema.liftRequests.userId, cid.id))),
    ).toEqual([]);
  });
});

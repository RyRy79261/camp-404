// @vitest-environment node
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TRANSPORT_TEAM } from "@camp404/core";
import * as schema from "@camp404/db/schema";
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
  NOT_DRIVING,
  NOT_IN_CAR,
  NOT_YOUR_CAR,
  OWN_CAR,
  REQUEST_CHANGED,
  REQUEST_GONE,
  SEATS_BELOW_RIDERS,
  TRAILER_CHANGED,
  TRAILER_GONE,
  YOU_ARE_DRIVING,
  YOU_HAVE_A_SEAT,
} from "@camp404/db/transport";
import { PARTICIPATION_STATUSES, Team } from "@camp404/types";
import { useTestDb } from "../../../../packages/db/src/__tests__/_harness";
import { makeDriverProfile } from "../../../../packages/db/src/__tests__/_factories";
import { YEAR, bothWays, type DB, type Seed } from "./_agreement";

// Transport (#270), through lib/transport.ts, on the database and on the E2E
// store: this year's cars and who rides in them, lift requests, trailers and
// a driver's message to their car. The same people, the same writes, the
// same answers and refusal sentences. Who may do what is core's
// (canEditTransport, canManageCar, canRemoveRider, canSendToAudience), and
// the seat, lift, seats and towing checks live once there too (seatProblem,
// liftRequestProblem, liftAnswerProblem, seatsOfferedProblem, towProblem);
// this holds the rest equal. A Transport and Logistics lead is this domain's
// lead; the Finance and Kitchen leads are leads of ANOTHER team, refused; a
// driver manages only their own car, and a member only their own request
// and seat. See _agreement.ts.

const mode = vi.hoisted(() => ({ on: false }));
vi.mock("@/lib/test-mode", () => ({
  isE2ETestMode: () => mode.on,
  usesTestStore: () => mode.on,
  TEST_USER_COOKIE: "camp404_test_user",
}));

import { testStore } from "../test-store";
import {
  addRider,
  addTrailer,
  answerLiftRequest,
  drivesThisYear,
  getTransportBoard,
  liftRequestsFor,
  listLiftRequests,
  listUnseated,
  removeRider,
  removeTrailer,
  requestLift,
  sendCarMessage,
  setSeatsOffered,
  setTrailerTow,
  updateTrailer,
  withdrawLiftRequest,
} from "../transport";

const TRANSPORT = Team.enum[TRANSPORT_TEAM];
const [APPLIED, MAYBE, ACCEPTED] = PARTICIPATION_STATUSES;

/** `userId` drives this year, offering `seats` (null: not said yet). */
async function drives(
  seed: Seed,
  db: DB,
  userId: string,
  car: { seats: number | null; canTow?: boolean; model: string },
): Promise<void> {
  const fields = {
    seatsOffered: car.seats,
    canTow: car.canTow ?? false,
    vehicleMake: "Toyota",
    vehicleModel: car.model,
    departureCity: "Cape Town",
  };
  if (seed.side === "store") {
    testStore.seedDriverProfile({ userId, cycle: YEAR, ...fields });
    return;
  }
  await makeDriverProfile(db, { userId, cycle: YEAR });
  await db
    .update(schema.driverProfiles)
    .set(fields)
    .where(
      and(
        eq(schema.driverProfiles.userId, userId),
        eq(schema.driverProfiles.cycle, YEAR),
      ),
    );
}

/** When a member's open request was made, as the answerer's page shows it. */
async function seen(userId: string): Promise<string> {
  const request = (await listLiftRequests()).find((r) => r.userId === userId);
  return (request?.createdAt ?? new Date(0)).toISOString();
}

const refused = (error: string) => ({ ok: false, error });
const ok = { ok: true };

describe("transport: the database and the test store agree", () => {
  const h = useTestDb();
  beforeEach(() => {
    mode.on = false;
    testStore.reset();
  });

  it("seats riders: the driver in their own car, a captain or Transport and Logistics lead in any, never past the seats offered", async () => {
    const { db, store } = await bothWays(mode, h, async (p, seed) => {
      const lead = await seed.user("Tran");
      await seed.lead(lead, TRANSPORT);
      const ada = await seed.user("Ada");
      const cai = await seed.user("Cai");
      const pending = await seed.user("Late", { approval: "pending" });
      await drives(seed, h.db(), ada, { seats: 2, model: "Hilux" });
      await drives(seed, h.db(), cai, { seats: 1, model: "Corolla" });
      await seed.participation(p.member, ACCEPTED);
      await seed.participation(p.other, MAYBE);
      await seed.participation(p.kitchenLead, APPLIED);
      const unseatedBefore = await listUnseated();
      const seat = (
        actorId: string,
        driverUserId: string,
        memberUserId: string,
      ) => addRider({ actorId, driverUserId, memberUserId });
      const ownSeat = await seat(ada, ada, p.member);
      const otherCar = await seat(ada, cai, p.other);
      const otherLead = await seat(p.kitchenLead, ada, p.other);
      const member = await seat(p.member, ada, p.other);
      const ownCar = await seat(p.captain, ada, ada);
      const isDriving = await seat(lead, ada, cai);
      const notMember = await seat(lead, ada, pending);
      const notDriving = await seat(lead, p.financeLead, p.other);
      const already = await seat(lead, cai, p.member);
      const leadSeat = await seat(lead, cai, p.other);
      const full = await seat(p.captain, cai, p.kitchenLead);
      const fewer = await setSeatsOffered({
        actorId: ada,
        driverUserId: ada,
        seatsOffered: 0,
      });
      const notYours = await setSeatsOffered({
        actorId: cai,
        driverUserId: ada,
        seatsOffered: 3,
      });
      const seats = await setSeatsOffered({
        actorId: lead,
        driverUserId: ada,
        seatsOffered: 3,
      });
      const seatsNotDriving = await setSeatsOffered({
        actorId: p.captain,
        driverUserId: p.member,
        seatsOffered: 3,
      });
      // A rider may always take themself out; nobody else but the car's
      // manager may.
      const removeOther = await removeRider({
        actorId: p.kitchenLead,
        driverUserId: cai,
        memberUserId: p.other,
      });
      const leaves = await removeRider({
        actorId: p.other,
        driverUserId: cai,
        memberUserId: p.other,
      });
      const leavesAgain = await removeRider({
        actorId: p.other,
        driverUserId: cai,
        memberUserId: p.other,
      });
      return {
        unseatedBefore,
        ownSeat,
        otherCar,
        otherLead,
        member,
        ownCar,
        isDriving,
        notMember,
        notDriving,
        already,
        leadSeat,
        full,
        fewer,
        notYours,
        seats,
        seatsNotDriving,
        removeOther,
        leaves,
        leavesAgain,
        board: await getTransportBoard(),
        unseated: await listUnseated(),
        adaDrives: await drivesThisYear(ada),
        memberDrives: await drivesThisYear(p.member),
      };
    });
    expect(db).toMatchObject({
      unseatedBefore: [
        { userId: "@kitchenLead", name: "Cook", status: "applied" },
        { userId: "@member", name: "Nova", status: "accepted" },
        { userId: "@other", name: "Zed", status: "maybe" },
      ],
      ownSeat: ok,
      otherCar: refused(NOT_YOUR_CAR),
      otherLead: refused(NOT_YOUR_CAR),
      member: refused(NOT_YOUR_CAR),
      ownCar: refused(OWN_CAR),
      isDriving: refused(IS_DRIVING),
      notMember: refused(NOT_A_MEMBER),
      notDriving: refused(NOT_DRIVING),
      already: refused(ALREADY_SEATED),
      leadSeat: ok,
      full: refused(CAR_FULL),
      fewer: refused(SEATS_BELOW_RIDERS),
      notYours: refused(NOT_YOUR_CAR),
      seats: ok,
      seatsNotDriving: refused(NOT_DRIVING),
      removeOther: refused(NOT_YOUR_CAR),
      leaves: ok,
      leavesAgain: refused(NOT_IN_CAR),
      board: {
        cycle: YEAR,
        cars: [
          {
            driverName: "Ada",
            vehicle: "Toyota Hilux",
            seatsOffered: 3,
            riders: [{ userId: "@member", name: "Nova" }],
          },
          { driverName: "Cai", seatsOffered: 1, riders: [] },
        ],
        trailers: [],
      },
      unseated: [
        { name: "Cook", status: "applied" },
        { name: "Zed", status: "maybe" },
      ],
      adaDrives: true,
      memberDrives: false,
    });
    expect(store).toEqual(db);
  });

  it("lets a member ask for a lift for themself, and the asked driver or a transport editor answer it on the request they saw", async () => {
    const { db, store } = await bothWays(mode, h, async (p, seed) => {
      const lead = await seed.user("Tran");
      await seed.lead(lead, TRANSPORT);
      const ada = await seed.user("Ada");
      const cai = await seed.user("Cai");
      await drives(seed, h.db(), ada, { seats: 2, model: "Hilux" });
      await drives(seed, h.db(), cai, { seats: 2, model: "Corolla" });
      const ask = (actorId: string, driverUserId: string | null) =>
        requestLift({ actorId, driverUserId });
      const driverAsks = await ask(ada, cai);
      const notDriving = await ask(p.member, p.financeLead);
      const first = await ask(p.member, cai);
      const firstSeen = await seen(p.member);
      const renewed = await ask(p.member, ada);
      const anyCar = await ask(p.other, null);
      const answer = (
        actorId: string,
        memberUserId: string,
        accept: boolean,
        requestedAt: string,
      ) => answerLiftRequest({ actorId, memberUserId, accept, requestedAt });
      const stale = await answer(ada, p.member, true, firstSeen);
      const notTheCar = await answer(cai, p.member, true, await seen(p.member));
      const otherLead = await answer(
        p.kitchenLead,
        p.other,
        false,
        await seen(p.other),
      );
      const anyAccepted = await answer(
        lead,
        p.other,
        true,
        await seen(p.other),
      );
      const memberView = liftRequestsFor(await listLiftRequests(), {
        userId: p.member,
        canEdit: false,
      });
      const driverView = liftRequestsFor(await listLiftRequests(), {
        userId: ada,
        canEdit: false,
      });
      const accepted = await answer(ada, p.member, true, await seen(p.member));
      const seated = await ask(p.member, null);
      const gone = await answer(ada, p.member, true, firstSeen);
      const declined = await answer(lead, p.other, false, await seen(p.other));
      const mine = await ask(p.kitchenLead, null);
      const withdrawn = await withdrawLiftRequest({ actorId: p.kitchenLead });
      const withdrawnAgain = await withdrawLiftRequest({
        actorId: p.kitchenLead,
      });
      return {
        driverAsks,
        notDriving,
        first,
        renewed,
        anyCar,
        stale,
        notTheCar,
        otherLead,
        anyAccepted,
        memberView,
        driverView,
        accepted,
        seated,
        gone,
        declined,
        mine,
        withdrawn,
        withdrawnAgain,
        requests: await listLiftRequests(),
        board: (await getTransportBoard()).cars,
      };
    });
    expect(db).toMatchObject({
      driverAsks: refused(YOU_ARE_DRIVING),
      notDriving: refused(NOT_DRIVING),
      first: ok,
      renewed: ok,
      anyCar: ok,
      stale: refused(REQUEST_CHANGED),
      notTheCar: refused(NOT_YOUR_CAR),
      otherLead: refused(NOT_YOUR_CAR),
      anyAccepted: refused(REQUEST_GONE),
      memberView: [{ userId: "@member", driverUserId: "#6" }],
      driverView: [{ userId: "@member", driverUserId: "#6" }],
      accepted: ok,
      seated: refused(YOU_HAVE_A_SEAT),
      gone: refused(REQUEST_GONE),
      declined: ok,
      mine: ok,
      withdrawn: ok,
      withdrawnAgain: refused(REQUEST_GONE),
      requests: [],
      board: [
        { driverName: "Ada", riders: [{ userId: "@member" }] },
        { driverName: "Cai", riders: [] },
      ],
    });
    expect(store).toEqual(db);
  });

  it("keeps the trailers for transport editors, one per car that can tow, and lets a driver write to the riders in their own car", async () => {
    const { db, store } = await bothWays(mode, h, async (p, seed) => {
      const lead = await seed.user("Tran");
      await seed.lead(lead, TRANSPORT);
      const ada = await seed.user("Ada");
      const cai = await seed.user("Cai");
      await drives(seed, h.db(), ada, {
        seats: 2,
        canTow: true,
        model: "Hilux",
      });
      await drives(seed, h.db(), cai, { seats: 2, model: "Corolla" });
      const box = await addTrailer({ actorId: lead, name: "Box", notes: null });
      const flat = await addTrailer({
        actorId: p.captain,
        name: "Flatbed",
        notes: "Needs a new tyre",
      });
      if (!box.ok || !flat.ok) throw new Error("no trailer");
      const otherLead = await addTrailer({
        actorId: p.financeLead,
        name: "No",
        notes: null,
      });
      const driver = await addTrailer({
        actorId: ada,
        name: "No",
        notes: null,
      });
      const tow = (
        actorId: string,
        trailerId: string,
        driverUserId: string | null,
        expectedVersion: number,
      ) => setTrailerTow({ actorId, trailerId, driverUserId, expectedVersion });
      const cannotTow = await tow(lead, box.id, cai, 0);
      const notDriving = await tow(lead, box.id, p.member, 0);
      const towed = await tow(lead, box.id, ada, 0);
      const already = await tow(p.captain, flat.id, ada, 0);
      const stale = await tow(lead, box.id, null, 0);
      const renamed = await updateTrailer({
        actorId: lead,
        trailerId: flat.id,
        name: "Flat",
        notes: null,
        expectedVersion: 0,
      });
      const renameStale = await updateTrailer({
        actorId: p.captain,
        trailerId: flat.id,
        name: "Flatter",
        notes: null,
        expectedVersion: 0,
      });
      const removeLead = await removeTrailer({
        actorId: p.kitchenLead,
        trailerId: flat.id,
        expectedVersion: 1,
      });
      const removed = await removeTrailer({
        actorId: lead,
        trailerId: flat.id,
        expectedVersion: 1,
      });
      const removedAgain = await removeTrailer({
        actorId: lead,
        trailerId: flat.id,
        expectedVersion: 1,
      });
      const nowhere = await updateTrailer({
        actorId: lead,
        trailerId: randomUUID(),
        name: "Ghost",
        notes: null,
        expectedVersion: 0,
      });
      const empty = await sendCarMessage({
        senderId: ada,
        title: "Hi",
        body: "Leaving at 6",
      });
      await addRider({
        actorId: ada,
        driverUserId: ada,
        memberUserId: p.member,
      });
      await addRider({
        actorId: ada,
        driverUserId: ada,
        memberUserId: p.other,
      });
      const rider = await sendCarMessage({
        senderId: p.member,
        title: "Hi",
        body: "Can we stop?",
      });
      const captain = await sendCarMessage({
        senderId: p.captain,
        title: "Hi",
        body: "Not my car",
      });
      const sent = await sendCarMessage({
        senderId: ada,
        title: "Hi",
        body: "Leaving at 6",
      });
      return {
        otherLead,
        driver,
        cannotTow,
        notDriving,
        towed,
        already,
        stale,
        renamed,
        renameStale,
        removeLead,
        removed,
        removedAgain,
        nowhere,
        empty,
        rider,
        captain,
        sent: sent.ok
          ? { ok: true, recipientCount: sent.recipientCount }
          : sent,
        board: await getTransportBoard(),
      };
    });
    expect(db).toMatchObject({
      otherLead: refused(NOT_A_TRANSPORT_EDITOR),
      driver: refused(NOT_A_TRANSPORT_EDITOR),
      cannotTow: refused(CANNOT_TOW),
      notDriving: refused(NOT_DRIVING),
      towed: ok,
      already: refused(ALREADY_TOWING),
      stale: refused(TRAILER_CHANGED),
      renamed: ok,
      renameStale: refused(TRAILER_CHANGED),
      removeLead: refused(NOT_A_TRANSPORT_EDITOR),
      removed: ok,
      removedAgain: refused(TRAILER_GONE),
      nowhere: refused(TRAILER_GONE),
      empty: refused(CAR_EMPTY),
      rider: refused(CAR_MESSAGE_REFUSED),
      captain: refused(CAR_MESSAGE_REFUSED),
      sent: { ok: true, recipientCount: 2 },
      board: {
        cars: [
          { driverName: "Ada", trailer: { name: "Box" } },
          { driverName: "Cai", trailer: null },
        ],
        trailers: [
          { name: "Box", version: 1, towedByName: "Ada", notes: null },
        ],
      },
    });
    expect(store).toEqual(db);
  });
});

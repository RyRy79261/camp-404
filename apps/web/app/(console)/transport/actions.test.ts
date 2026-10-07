// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

// The Transport page's actions (#270), end to end against the test store: the
// action, its strict Zod boundary, the facade and the store's twin of the
// database rules. What matters here:
//  1. The car message goes only to the SENDER's own riders. Its input is a
//     title and a message; forcing another car's id (or a rider list) into
//     the send is refused before anything is written.
//  2. A rider, a captain who is not driving, and a lead of another team
//     cannot message a car or work another driver's car.
//  3. Transport & Logistics leads keep the trailers; a lead of another team
//     and a plain member are refused.
// The same rules run on real Postgres in packages/db (transport.test.ts).

const store = vi.hoisted(() => ({ on: true }));
vi.mock("@/lib/test-mode", () => ({
  isE2ETestMode: () => store.on,
  usesTestStore: () => store.on,
  TEST_USER_COOKIE: "camp404_test_user",
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn() }));
vi.mock("@/lib/background-work", () => ({ deliverAfterResponse: vi.fn() }));
vi.mock("@/lib/captain-gate", () => ({ captainActionGate: vi.fn() }));

import {
  CAR_MESSAGE_REFUSED,
  NOT_A_TRANSPORT_EDITOR,
  NOT_YOUR_CAR,
} from "@camp404/db/transport";
import { deliverAfterResponse } from "@/lib/background-work";
import { captainActionGate } from "@/lib/captain-gate";
import { testStore } from "@/lib/test-store";
import {
  addRiderAction,
  addTrailerAction,
  answerLiftRequestAction,
  requestLiftAction,
  sendCarMessageAction,
} from "./actions";

/** Signed in as this store user; the gate lets any approved member through. */
function actAs(user: { id: string }) {
  vi.mocked(captainActionGate).mockResolvedValue({
    ok: true,
    campUser: { id: user.id } as never,
    rank: "camp_member",
  });
}

/** When a member's open request was made, as the answerer's page shows it. */
function seen(userId: string): string {
  const request = testStore.listLiftRequests().find((r) => r.userId === userId);
  return (request?.createdAt ?? new Date(0)).toISOString();
}

function person(name: string, rank: "member" | "captain" = "member") {
  return testStore.createUser({
    authUserId: `auth-${name}`,
    displayName: name,
    inviteCode: "seed",
    rank,
  });
}

function inbox(userId: string) {
  return testStore.listInbox(userId).items.map((i) => ({
    title: i.title,
    kind: i.kind,
    senderName: i.senderName,
    link: i.link,
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
  store.on = true;
  testStore.reset();
});

describe("sendCarMessageAction", () => {
  function camp() {
    const ada = person("Ada");
    const cai = person("Cai");
    const mine = person("Mine");
    const theirs = person("Theirs");
    testStore.seedDriverProfile({ userId: ada.id, seatsOffered: 3 });
    testStore.seedDriverProfile({ userId: cai.id, seatsOffered: 3 });
    testStore.seedCarRider({ driverUserId: ada.id, memberUserId: mine.id });
    testStore.seedCarRider({ driverUserId: cai.id, memberUserId: theirs.id });
    return { ada, cai, mine, theirs };
  }

  it("reaches the sender's own riders, names the sender, and delivers after the response", async () => {
    const { ada, cai, mine, theirs } = camp();
    actAs(ada);
    expect(
      await sendCarMessageAction({ title: "Leaving at 6", body: "Garage." }),
    ).toEqual({ ok: true, data: { recipientCount: 1 } });
    expect(inbox(mine.id)).toEqual([
      {
        title: "Leaving at 6",
        kind: "car_message",
        senderName: "Ada",
        link: "/lift",
      },
    ]);
    expect(inbox(theirs.id)).toEqual([]);
    expect(inbox(cai.id)).toEqual([]);
    expect(inbox(ada.id)).toEqual([]);
    expect(deliverAfterResponse).toHaveBeenCalledTimes(1);
  });

  it("refuses another car's id forced into the send, and writes nothing", async () => {
    const { ada, cai, mine, theirs } = camp();
    actAs(ada);
    for (const forced of [
      { driverUserId: cai.id },
      { carId: cai.id },
      { riderIds: [theirs.id] },
      { scope: "everyone" },
    ]) {
      const result = await sendCarMessageAction({
        title: "Hi",
        body: "Hello",
        ...forced,
      });
      expect(result.ok).toBe(false);
    }
    expect(inbox(theirs.id)).toEqual([]);
    expect(inbox(mine.id)).toEqual([]);
    expect(deliverAfterResponse).not.toHaveBeenCalled();
  });

  it("refuses a rider and a captain who is not driving", async () => {
    const { mine, theirs } = camp();
    const captain = person("Cap", "captain");
    for (const sender of [mine, captain]) {
      actAs(sender);
      expect(
        await sendCarMessageAction({ title: "Hi", body: "Hello" }),
      ).toEqual({ ok: false, error: CAR_MESSAGE_REFUSED });
    }
    expect(inbox(theirs.id)).toEqual([]);
    expect(deliverAfterResponse).not.toHaveBeenCalled();
  });
});

describe("seats and requests", () => {
  it("lets the asked driver accept, and refuses a lead of another team", async () => {
    const ada = person("Ada");
    const bea = person("Bea");
    const kitchenLead = person("Kit");
    testStore.seedTeamMembership({
      userId: kitchenLead.id,
      team: "kitchen",
      isLead: true,
    });
    testStore.seedDriverProfile({ userId: ada.id, seatsOffered: 2 });

    actAs(bea);
    expect(await requestLiftAction({ driverUserId: ada.id })).toEqual({
      ok: true,
    });
    actAs(kitchenLead);
    expect(
      await answerLiftRequestAction({
        memberUserId: bea.id,
        accept: true,
        requestedAt: seen(bea.id),
      }),
    ).toEqual({ ok: false, error: NOT_YOUR_CAR });
    expect(
      await addRiderAction({ driverUserId: ada.id, memberUserId: bea.id }),
    ).toEqual({ ok: false, error: NOT_YOUR_CAR });
    actAs(ada);
    expect(
      await answerLiftRequestAction({
        memberUserId: bea.id,
        accept: true,
        requestedAt: seen(bea.id),
      }),
    ).toEqual({ ok: true });
    expect(
      testStore.getTransportBoard().cars[0]?.riders.map((r) => r.name),
    ).toEqual(["Bea"]);
    expect(testStore.listLiftRequests()).toEqual([]);
  });
});

describe("trailers", () => {
  it("are kept by a Transport & Logistics lead, not a Kitchen lead or a member", async () => {
    const member = person("Member");
    const kitchenLead = person("Kit");
    const transportLead = person("Tran");
    testStore.seedTeamMembership({
      userId: kitchenLead.id,
      team: "kitchen",
      isLead: true,
    });
    testStore.seedTeamMembership({
      userId: transportLead.id,
      team: "transport_and_logistics",
      isLead: true,
    });
    for (const actor of [member, kitchenLead]) {
      actAs(actor);
      expect(
        await addTrailerAction({ name: "Box trailer", notes: "" }),
      ).toEqual({ ok: false, error: NOT_A_TRANSPORT_EDITOR });
    }
    actAs(transportLead);
    expect(await addTrailerAction({ name: "Box trailer", notes: "" })).toEqual({
      ok: true,
    });
    expect(testStore.getTransportBoard().trailers).toEqual([
      expect.objectContaining({ name: "Box trailer", notes: null }),
    ]);
  });
});

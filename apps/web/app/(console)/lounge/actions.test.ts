import { beforeEach, describe, expect, it, vi } from "vitest";

// The lounge programme's actions (#269). What matters here:
//  1. Any approved member offers something, changes and withdraws: the gate is
//     camp_member, and the write gets the signed-in actor only (the facade
//     keeps them to their own offer).
//  2. Deciding, placing, taking off and the music note need a captain or a
//     Ministry of Vibes lead: a lead of any other team is refused before the
//     facade is called, although their clearance is the global team_lead
//     rung. A plain member is refused too.
//  3. Every write names the signed-in actor and nothing else.
// The rule is checked again inside each write (packages/db, on PGlite).

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn() }));
vi.mock("@/lib/captain-gate", () => ({ captainActionGate: vi.fn() }));
vi.mock("@/lib/users", () => ({ getLeadTeams: vi.fn(async () => []) }));
vi.mock("@/lib/lounge", () => ({
  addLoungeOffer: vi.fn(async () => ({ ok: true, id: "offer-new" })),
  updateLoungeOffer: vi.fn(async () => ({ ok: true })),
  withdrawLoungeOffer: vi.fn(async () => ({ ok: true })),
  decideLoungeOffer: vi.fn(async () => ({ ok: true })),
  placeLoungeOffer: vi.fn(async () => ({ ok: true, id: "slot-new" })),
  removeLoungeSlot: vi.fn(async () => ({ ok: true })),
  setLoungeMusicPolicy: vi.fn(async () => ({ ok: true, version: 2 })),
}));

import { revalidatePath } from "next/cache";
import { LOUNGE_TEAM } from "@camp404/core";
import type { ViewerRank } from "@camp404/types";
import { captainActionGate } from "@/lib/captain-gate";
import {
  addLoungeOffer,
  decideLoungeOffer,
  placeLoungeOffer,
  removeLoungeSlot,
  setLoungeMusicPolicy,
  updateLoungeOffer,
  withdrawLoungeOffer,
} from "@/lib/lounge";
import { LOUNGE_PATH, LOUNGE_REFUSAL } from "@/lib/lounge-copy";
import { getLeadTeams } from "@/lib/users";
import {
  decideOfferAction,
  editOfferAction,
  offerAction,
  placeOfferAction,
  removeSlotAction,
  saveMusicPolicyAction,
  withdrawOfferAction,
} from "./actions";

const LADDER: ViewerRank[] = ["camp_member", "team_lead", "captain"];

function actAs(rank: ViewerRank, led: string[] = [], id = "user-1") {
  vi.mocked(captainActionGate).mockImplementation(async (required, refusal) =>
    LADDER.indexOf(rank) >= LADDER.indexOf(required)
      ? { ok: true, campUser: { id } as never, rank }
      : { ok: false, error: refusal ?? "refused" },
  );
  vi.mocked(getLeadTeams).mockResolvedValue(led);
}

const OFFER = {
  title: "Sunset set",
  kind: "dj_set",
  durationMinutes: 90,
  needs: ["sound"],
  preferredDays: [2],
  preferredBands: ["sunset"],
};

const DECIDE = {
  offerId: "offer-1",
  decision: "accepted",
  expectedStatus: "offered",
  expectedVersion: 1,
};

beforeEach(() => {
  vi.clearAllMocks();
  actAs("camp_member", [], "member-1");
});

describe("offers: any approved member", () => {
  it("sends a member's offer with their own id and no one else's", async () => {
    expect(
      await offerAction({ ...OFFER, actorId: "someone-else", hostId: "x" }),
    ).toEqual({ ok: true, data: { id: "offer-new" } });
    expect(captainActionGate).toHaveBeenCalledWith("camp_member");
    const arg = vi.mocked(addLoungeOffer).mock.calls[0]![0];
    expect(arg.actorId).toBe("member-1");
    expect(arg).not.toHaveProperty("hostId");
    expect(revalidatePath).toHaveBeenCalledWith(LOUNGE_PATH);
  });

  it("says what to fix when the offer does not parse", async () => {
    const result = await offerAction({ ...OFFER, title: "" });
    expect(result).toEqual({ ok: false, error: "Give it a name." });
    expect(addLoungeOffer).not.toHaveBeenCalled();
  });

  it("edits and withdraws as the signed-in member", async () => {
    await editOfferAction({ ...OFFER, offerId: "o1", expectedVersion: 1 });
    expect(vi.mocked(updateLoungeOffer).mock.calls[0]![0].actorId).toBe(
      "member-1",
    );
    await withdrawOfferAction({ offerId: "o1" });
    expect(withdrawLoungeOffer).toHaveBeenCalledWith({
      offerId: "o1",
      actorId: "member-1",
    });
  });
});

describe("running the programme", () => {
  const runs = [
    () => decideOfferAction(DECIDE),
    () => placeOfferAction({ offerId: "o1", day: 2, startMinute: 18 * 60 }),
    () => removeSlotAction({ slotId: "s1" }),
    () =>
      saveMusicPolicyAction({ musicPolicy: "Downtempo", expectedVersion: 0 }),
  ];
  const facades = [
    decideLoungeOffer,
    placeLoungeOffer,
    removeLoungeSlot,
    setLoungeMusicPolicy,
  ];

  it("refuses a lead of another team before the facade is called", async () => {
    actAs("team_lead", ["kitchen"]);
    for (const run of runs) {
      expect(await run()).toEqual({ ok: false, error: LOUNGE_REFUSAL });
    }
    for (const f of facades) expect(f).not.toHaveBeenCalled();
  });

  it("refuses a plain member", async () => {
    for (const run of runs) {
      expect(await run()).toEqual({ ok: false, error: LOUNGE_REFUSAL });
    }
    for (const f of facades) expect(f).not.toHaveBeenCalled();
  });

  it("lets a Ministry of Vibes lead and a captain through, as themselves", async () => {
    for (const [rank, led, id] of [
      ["team_lead", [LOUNGE_TEAM], "vibes-1"],
      ["captain", [], "captain-1"],
    ] as const) {
      vi.clearAllMocks();
      actAs(rank, [...led], id);
      for (const run of runs) expect((await run()).ok).toBe(true);
      for (const f of facades) {
        expect(vi.mocked(f).mock.calls[0]![0]).toMatchObject({ actorId: id });
      }
    }
  });

  it("needs a reason to decline", async () => {
    actAs("captain", [], "captain-1");
    expect(
      await decideOfferAction({ ...DECIDE, decision: "declined" }),
    ).toEqual({ ok: false, error: "Say why, so the host knows what to do." });
    expect(decideLoungeOffer).not.toHaveBeenCalled();
  });
});

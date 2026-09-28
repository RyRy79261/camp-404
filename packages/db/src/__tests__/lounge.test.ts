import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { LOUNGE_TEAM, type AuditAction } from "@camp404/core";
import {
  DecideLoungeOfferInput,
  EditLoungeOfferInput,
  LoungeOfferInput,
  type Team,
} from "@camp404/types";
import type { CampConfig } from "../camp-config";
import * as schema from "../schema";
import {
  ALREADY_PLACED,
  NOT_A_LOUNGE_RUNNER,
  NOT_YOUR_OFFER,
  OFFER_CHANGED,
  OFFER_DECIDED,
  OFFER_NOT_ACCEPTED,
  SETTINGS_CHANGED,
  addLoungeOffer,
  decideLoungeOffer,
  getLoungeProgramme,
  getLoungeSettings,
  listLoungeOffers,
  listMyLoungeOffers,
  placeLoungeOffer,
  removeLoungeSlot,
  setLoungeMusicPolicy,
  updateLoungeOffer,
  withdrawLoungeOffer,
} from "../lounge";
import { sanitiseAccount } from "../account";
import { assignTeam, setLead } from "../team-memberships";
import { useTestDb } from "./_harness";
import { makeUser } from "./_factories";

// The lounge programme (#269) on a real Postgres (PGlite). What matters: any
// member offers and changes only their own offer; only a captain or a Ministry
// of Vibes lead decides, places and writes the music note, checked again
// inside each write, so a lead of another team is refused even with the
// button forced; a decision is compare-and-set and audited in the same
// transaction; members read the programme without anyone's private notes;
// and everything belongs to the year it was written in.

type DB = ReturnType<ReturnType<typeof useTestDb>["db"]>;

/** Put the camp in `year`, with the years before it closed. */
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

const YOGA = LoungeOfferInput.parse({
  title: "Sunrise yoga",
  description: "Bring a mat.",
  kind: "activity",
  durationMinutes: 60,
  needs: ["space"],
  preferredDays: [3, 2],
  preferredBands: ["morning"],
  recurring: true,
  publicGuide: true,
});

const SET = LoungeOfferInput.parse({
  title: "Sunset set",
  kind: "dj_set",
  durationMinutes: 90,
  needs: ["sound", "power"],
  needsNote: "Two CDJs",
});

async function auditRows(db: DB, action: AuditAction) {
  return db
    .select()
    .from(schema.auditLog)
    .where(eq(schema.auditLog.action, action));
}

describe("lounge", () => {
  const h = useTestDb();

  async function leadOf(team: Team) {
    const user = await makeUser(h.db());
    await assignTeam({ userId: user.id, team });
    const led = await setLead({ userId: user.id, team, isLead: true });
    expect(led).toEqual({ ok: true, changed: true });
    return user;
  }

  async function people() {
    await campYear(h.db(), 2027);
    const captain = await makeUser(h.db(), { rank: "captain" });
    const vibesLead = await leadOf(LOUNGE_TEAM as Team);
    const kitchenLead = await leadOf("kitchen");
    const member = await makeUser(h.db(), { displayName: "Sam Moon" });
    const other = await makeUser(h.db());
    return { captain, vibesLead, kitchenLead, member, other };
  }

  async function offer(actorId: string, input = YOGA) {
    const made = await addLoungeOffer({ ...input, actorId });
    if (!made.ok) throw new Error(made.error);
    return made.id;
  }

  async function stored(id: string) {
    const [row] = await h
      .db()
      .select()
      .from(schema.loungeOffers)
      .where(eq(schema.loungeOffers.id, id));
    return row;
  }

  function decide(
    offerId: string,
    decision: "accepted" | "declined" | "needs_changes",
    expectedStatus: "offered" | "accepted" | "declined" | "needs_changes",
    expectedVersion: number,
    reason: string | null = null,
  ) {
    return DecideLoungeOfferInput.parse({
      offerId,
      decision,
      expectedStatus,
      expectedVersion,
      reason,
    });
  }

  describe("offers", () => {
    it("stamps a member's offer with this year, sorted days, waiting for a decision", async () => {
      const { member } = await people();
      const id = await offer(member.id);
      expect(await stored(id)).toMatchObject({
        cycle: 2027,
        hostId: member.id,
        status: "offered",
        preferredDays: [2, 3],
        version: 1,
      });
      const mine = await listMyLoungeOffers(member.id);
      expect(mine.map((o) => [o.title, o.hostName])).toEqual([
        ["Sunrise yoga", "Sam Moon"],
      ]);
    });

    it("lets the host change their offer, and refuses anyone else", async () => {
      const { member, other, captain } = await people();
      const id = await offer(member.id);
      const edit = EditLoungeOfferInput.parse({
        ...YOGA,
        title: "Sunrise yin yoga",
        offerId: id,
        expectedVersion: 1,
      });
      for (const intruder of [other, captain]) {
        expect(
          await updateLoungeOffer({ ...edit, actorId: intruder.id }),
        ).toEqual({ ok: false, error: NOT_YOUR_OFFER });
        expect(
          await withdrawLoungeOffer({ actorId: intruder.id, offerId: id }),
        ).toEqual({ ok: false, error: NOT_YOUR_OFFER });
      }
      expect(await updateLoungeOffer({ ...edit, actorId: member.id })).toEqual({
        ok: true,
      });
      expect(await stored(id)).toMatchObject({
        title: "Sunrise yin yoga",
        version: 2,
      });
      // The same stale version again loses the race, in a sentence.
      expect(await updateLoungeOffer({ ...edit, actorId: member.id })).toEqual({
        ok: false,
        error: OFFER_CHANGED,
      });
    });

    it("sends an offer back to waiting when the host answers a request for changes", async () => {
      const { member, vibesLead } = await people();
      const id = await offer(member.id);
      expect(
        await decideLoungeOffer({
          ...decide(id, "needs_changes", "offered", 1, "Shorter, please"),
          actorId: vibesLead.id,
        }),
      ).toEqual({ ok: true });
      const [mine] = await listMyLoungeOffers(member.id);
      expect(mine).toMatchObject({
        status: "needs_changes",
        decisionNote: "Shorter, please",
      });
      expect(
        await updateLoungeOffer({
          ...EditLoungeOfferInput.parse({
            ...YOGA,
            durationMinutes: 45,
            offerId: id,
            expectedVersion: 2,
          }),
          actorId: member.id,
        }),
      ).toEqual({ ok: true });
      expect(await stored(id)).toMatchObject({
        status: "offered",
        durationMinutes: 45,
      });
    });

    it("locks an accepted or declined offer against the host's edits, but lets them withdraw it", async () => {
      const { member, captain } = await people();
      const id = await offer(member.id);
      await decideLoungeOffer({
        ...decide(id, "accepted", "offered", 1),
        actorId: captain.id,
      });
      await placeLoungeOffer({
        offerId: id,
        day: 2,
        startMinute: 7 * 60,
        actorId: captain.id,
      });
      expect(
        await updateLoungeOffer({
          ...EditLoungeOfferInput.parse({
            ...YOGA,
            offerId: id,
            expectedVersion: 2,
          }),
          actorId: member.id,
        }),
      ).toEqual({ ok: false, error: OFFER_DECIDED });
      expect(
        await withdrawLoungeOffer({ actorId: member.id, offerId: id }),
      ).toEqual({ ok: true });
      expect(await stored(id)).toBeUndefined();
      expect((await getLoungeProgramme()).slots).toEqual([]);
    });
  });

  describe("who may run the programme", () => {
    it("lets a captain and a Ministry of Vibes lead decide and place, with an audit row each", async () => {
      const { member, captain, vibesLead } = await people();
      for (const actor of [captain, vibesLead]) {
        const id = await offer(member.id);
        expect(
          await decideLoungeOffer({
            ...decide(id, "accepted", "offered", 1),
            actorId: actor.id,
          }),
        ).toEqual({ ok: true });
        const placed = await placeLoungeOffer({
          offerId: id,
          day: 2,
          startMinute: 7 * 60,
          actorId: actor.id,
        });
        expect(placed.ok).toBe(true);
      }
      const decided = await auditRows(h.db(), "lounge.offer_decided");
      expect(decided.map((r) => r.actorId).sort()).toEqual(
        [captain.id, vibesLead.id].sort(),
      );
      expect(decided[0]!.metadata).toMatchObject({
        from: "offered",
        to: "accepted",
        title: "Sunrise yoga",
        cycle: 2027,
      });
      expect(await auditRows(h.db(), "lounge.offer_placed")).toHaveLength(2);
    });

    it("refuses a lead of another team and a plain member, even with the button forced", async () => {
      const { member, other, kitchenLead, captain } = await people();
      const id = await offer(member.id);
      for (const actor of [kitchenLead, other, member]) {
        expect(
          await decideLoungeOffer({
            ...decide(id, "accepted", "offered", 1),
            actorId: actor.id,
          }),
        ).toEqual({ ok: false, error: NOT_A_LOUNGE_RUNNER });
      }
      await decideLoungeOffer({
        ...decide(id, "accepted", "offered", 1),
        actorId: captain.id,
      });
      const placed = await placeLoungeOffer({
        offerId: id,
        day: 1,
        startMinute: 7 * 60,
        actorId: captain.id,
      });
      if (!placed.ok) throw new Error(placed.error);
      for (const actor of [kitchenLead, other]) {
        expect(
          await placeLoungeOffer({
            offerId: id,
            day: 2,
            startMinute: 7 * 60,
            actorId: actor.id,
          }),
        ).toEqual({ ok: false, error: NOT_A_LOUNGE_RUNNER });
        expect(
          await removeLoungeSlot({ actorId: actor.id, slotId: placed.id }),
        ).toEqual({ ok: false, error: NOT_A_LOUNGE_RUNNER });
        expect(
          await setLoungeMusicPolicy({
            actorId: actor.id,
            musicPolicy: "Anything goes",
            expectedVersion: 0,
          }),
        ).toEqual({ ok: false, error: NOT_A_LOUNGE_RUNNER });
      }
      expect(await stored(id)).toMatchObject({
        status: "accepted",
        version: 2,
      });
      expect((await getLoungeProgramme()).slots).toHaveLength(1);
      expect(await auditRows(h.db(), "lounge.slot_removed")).toHaveLength(0);
    });

    it("stops a lead whose lead role was taken away", async () => {
      const { member, vibesLead } = await people();
      const id = await offer(member.id);
      await setLead({
        userId: vibesLead.id,
        team: LOUNGE_TEAM as Team,
        isLead: false,
      });
      expect(
        await decideLoungeOffer({
          ...decide(id, "accepted", "offered", 1),
          actorId: vibesLead.id,
        }),
      ).toEqual({ ok: false, error: NOT_A_LOUNGE_RUNNER });
    });
  });

  describe("decisions", () => {
    it("is a compare-and-set on what the reviewer saw", async () => {
      const { member, captain, vibesLead } = await people();
      const id = await offer(member.id);
      expect(
        await decideLoungeOffer({
          ...decide(id, "accepted", "offered", 1),
          actorId: captain.id,
        }),
      ).toEqual({ ok: true });
      // The lead saw it waiting; the captain got there first.
      expect(
        await decideLoungeOffer({
          ...decide(id, "declined", "offered", 1, "Clashes with the burn"),
          actorId: vibesLead.id,
        }),
      ).toEqual({ ok: false, error: OFFER_CHANGED });
      expect(await stored(id)).toMatchObject({ status: "accepted" });
      expect(await auditRows(h.db(), "lounge.offer_decided")).toHaveLength(1);
    });

    it("refuses a decision on a version the host has since changed, or a status it no longer has", async () => {
      const { member, captain } = await people();
      const id = await offer(member.id);
      // The status matches, but the host changed the offer after the reviewer looked.
      await updateLoungeOffer({
        ...EditLoungeOfferInput.parse({
          ...YOGA,
          title: "Sunrise yin yoga",
          offerId: id,
          expectedVersion: 1,
        }),
        actorId: member.id,
      });
      expect(
        await decideLoungeOffer({
          ...decide(id, "accepted", "offered", 1),
          actorId: captain.id,
        }),
      ).toEqual({ ok: false, error: OFFER_CHANGED });
      // The version matches, but the status the reviewer names is not the one it has.
      expect(
        await decideLoungeOffer({
          ...decide(id, "accepted", "needs_changes", 2),
          actorId: captain.id,
        }),
      ).toEqual({ ok: false, error: OFFER_CHANGED });
      expect(await stored(id)).toMatchObject({ status: "offered", version: 2 });
    });

    it("takes a declined offer off the programme and keeps the reason for the host", async () => {
      const { member, captain } = await people();
      const id = await offer(member.id);
      await decideLoungeOffer({
        ...decide(id, "accepted", "offered", 1),
        actorId: captain.id,
      });
      await placeLoungeOffer({
        offerId: id,
        day: 2,
        startMinute: 7 * 60,
        actorId: captain.id,
      });
      expect(
        await decideLoungeOffer({
          ...decide(id, "declined", "accepted", 2, "We lost the tent"),
          actorId: captain.id,
        }),
      ).toEqual({ ok: true });
      expect((await getLoungeProgramme()).slots).toEqual([]);
      const [mine] = await listMyLoungeOffers(member.id);
      expect(mine).toMatchObject({
        status: "declined",
        decisionNote: "We lost the tent",
      });
      const rows = await auditRows(h.db(), "lounge.offer_decided");
      expect(rows.at(-1)!.metadata).toMatchObject({
        from: "accepted",
        to: "declined",
        unplaced: 1,
        withReason: true,
      });
    });
  });

  describe("the programme", () => {
    it("places only an accepted offer, and each time once", async () => {
      const { member, captain } = await people();
      const id = await offer(member.id);
      const at = { offerId: id, day: 2, startMinute: 7 * 60 };
      expect(await placeLoungeOffer({ ...at, actorId: captain.id })).toEqual({
        ok: false,
        error: OFFER_NOT_ACCEPTED,
      });
      await decideLoungeOffer({
        ...decide(id, "accepted", "offered", 1),
        actorId: captain.id,
      });
      expect((await placeLoungeOffer({ ...at, actorId: captain.id })).ok).toBe(
        true,
      );
      expect(await placeLoungeOffer({ ...at, actorId: captain.id })).toEqual({
        ok: false,
        error: ALREADY_PLACED,
      });
      // A recurring offer goes on another day too.
      expect(
        (await placeLoungeOffer({ ...at, day: 3, actorId: captain.id })).ok,
      ).toBe(true);
      expect(await auditRows(h.db(), "lounge.offer_placed")).toHaveLength(2);
    });

    it("shows members the accepted offers and slots, with no host id or private notes", async () => {
      const { member, captain } = await people();
      const yoga = await offer(member.id);
      const set = await offer(member.id, SET);
      await decideLoungeOffer({
        ...decide(yoga, "accepted", "offered", 1),
        actorId: captain.id,
      });
      await decideLoungeOffer({
        ...decide(set, "needs_changes", "offered", 1, "Private note"),
        actorId: captain.id,
      });
      const placed = await placeLoungeOffer({
        offerId: yoga,
        day: 2,
        startMinute: 7 * 60,
        actorId: captain.id,
      });
      if (!placed.ok) throw new Error(placed.error);
      const programme = await getLoungeProgramme();
      expect(programme.offers).toEqual([
        {
          id: yoga,
          kind: "activity",
          title: "Sunrise yoga",
          description: "Bring a mat.",
          durationMinutes: 60,
          recurring: true,
          publicGuide: true,
          hostName: "Sam Moon",
        },
      ]);
      expect(programme.slots).toEqual([
        { id: placed.id, offerId: yoga, day: 2, startMinute: 7 * 60 },
      ]);
      expect(JSON.stringify(programme)).not.toContain("Private note");
      expect(JSON.stringify(programme)).not.toContain(member.id);
    });

    it("takes an item off and audits it, leaving the offer accepted", async () => {
      const { member, vibesLead } = await people();
      const id = await offer(member.id);
      await decideLoungeOffer({
        ...decide(id, "accepted", "offered", 1),
        actorId: vibesLead.id,
      });
      const placed = await placeLoungeOffer({
        offerId: id,
        day: 1,
        startMinute: 20 * 60,
        actorId: vibesLead.id,
      });
      if (!placed.ok) throw new Error(placed.error);
      expect(
        await removeLoungeSlot({ actorId: vibesLead.id, slotId: placed.id }),
      ).toEqual({ ok: true });
      expect(await stored(id)).toMatchObject({ status: "accepted" });
      const [row] = await auditRows(h.db(), "lounge.slot_removed");
      expect(row!.metadata).toMatchObject({ title: "Sunrise yoga", day: 1 });
    });

    it("keeps each year's offers to itself", async () => {
      const { member } = await people();
      await offer(member.id);
      await campYear(h.db(), 2028, [2027]);
      expect(await listLoungeOffers()).toEqual([]);
      expect(await listMyLoungeOffers(member.id)).toEqual([]);
      expect(await listLoungeOffers(2027)).toHaveLength(1);
    });
  });

  describe("the music note", () => {
    it("saves, then changes only from the version the editor saw", async () => {
      const { vibesLead, captain } = await people();
      expect(await getLoungeSettings()).toEqual({
        cycle: 2027,
        musicPolicy: null,
        version: 0,
      });
      expect(
        await setLoungeMusicPolicy({
          actorId: vibesLead.id,
          musicPolicy: "Downtempo, ambient, groovy.",
          expectedVersion: 0,
        }),
      ).toEqual({ ok: true, version: 1 });
      expect(
        await setLoungeMusicPolicy({
          actorId: captain.id,
          musicPolicy: "Anything",
          expectedVersion: 0,
        }),
      ).toEqual({ ok: false, error: SETTINGS_CHANGED });
      expect(
        await setLoungeMusicPolicy({
          actorId: captain.id,
          musicPolicy: "Downtempo only.",
          expectedVersion: 1,
        }),
      ).toEqual({ ok: true, version: 2 });
      expect((await getLoungeSettings()).musicPolicy).toBe("Downtempo only.");
      expect(
        await auditRows(h.db(), "lounge.music_policy_changed"),
      ).toHaveLength(2);
    });
  });

  it("deletes a member's offers, and their slots, when they erase their account", async () => {
    const { member, captain } = await people();
    const id = await offer(member.id);
    await decideLoungeOffer({
      ...decide(id, "accepted", "offered", 1),
      actorId: captain.id,
    });
    await placeLoungeOffer({
      offerId: id,
      day: 1,
      startMinute: 20 * 60,
      actorId: captain.id,
    });
    await sanitiseAccount(member.id);
    expect(await stored(id)).toBeUndefined();
    expect(await h.db().select().from(schema.loungeSlots)).toEqual([]);
  });
});

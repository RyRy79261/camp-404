import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { useTestDb } from "./_harness";
import { makeMembership, makeUser } from "./_factories";
import {
  createAnnouncementDraft,
  updateAnnouncementDraft,
  listAnnouncements,
  listPinnedForUser,
  PIN_ALREADY,
  PIN_NOT_PUBLISHED,
  PIN_TEAM_NOT_LED,
  publishAnnouncement,
  setAnnouncementPinned,
  type Audience,
} from "../broadcasts";
import * as schema from "../schema";

// Pinning an announcement: the second axis beside `presentation`. These are the
// two halves that can leak, so both are exercised against real Postgres:
//
//   READ  — who sees a pin. The join to `notification_deliveries` IS the
//           audience, settled at fan-out; nothing re-resolves it.
//   WRITE — who may set one. Pinning authority follows posting authority, and
//           the claim re-checks the audience in its own WHERE.

type DB = ReturnType<ReturnType<typeof useTestDb>["db"]>;

const DRAFT = {
  title: "Water",
  body: "Truck at 9.",
  presentation: "feed" as const,
};

/** Compose and publish one announcement, and hand back its id. */
async function publish(
  senderId: string,
  audience: Audience,
  overrides: Partial<typeof DRAFT> = {},
): Promise<string> {
  const { id } = await createAnnouncementDraft({
    senderId,
    ...DRAFT,
    ...overrides,
    audience,
  });
  const result = await publishAnnouncement({ id, senderId });
  expect(result.ok).toBe(true);
  return id;
}

async function auditRows(db: DB, target: string) {
  return db
    .select({
      action: schema.auditLog.action,
      actorId: schema.auditLog.actorId,
      metadata: schema.auditLog.metadata,
    })
    .from(schema.auditLog)
    .where(eq(schema.auditLog.target, target));
}

describe("announcement pins — who sees one", () => {
  const h = useTestDb();

  it("shows a team pin to that team, and to nobody else", async () => {
    const db = h.db();
    const captain = await makeUser(db, {
      rank: "captain",
      approvalStatus: "approved",
    });
    const cook = await makeUser(db, { approvalStatus: "approved" });
    const builder = await makeUser(db, { approvalStatus: "approved" });
    await makeMembership(db, { userId: cook.id, team: "kitchen" });
    await makeMembership(db, { userId: builder.id, team: "structures" });

    const id = await publish(captain.id, { scope: "team", team: "kitchen" });
    expect(
      await setAnnouncementPinned({ id, actorId: captain.id, pinned: true }),
    ).toEqual({ ok: true });

    expect((await listPinnedForUser(cook.id)).map((p) => p.id)).toEqual([id]);
    // The builder is on another team, so the fan-out never reached them —
    // and the pin does not reach them either.
    expect(await listPinnedForUser(builder.id)).toEqual([]);
    // Nor does it reach its own author, who is excluded from every fan-out.
    expect(await listPinnedForUser(captain.id)).toEqual([]);
  });

  it("never shows an unpublished pin, and never an unpinned announcement", async () => {
    const db = h.db();
    const captain = await makeUser(db, {
      rank: "captain",
      approvalStatus: "approved",
    });
    const member = await makeUser(db, { approvalStatus: "approved" });

    // A draft marked "keep it at the top" in the composer, never published.
    await createAnnouncementDraft({
      senderId: captain.id,
      ...DRAFT,
      title: "Still a draft",
      pinned: true,
    });
    // ...and a published announcement nobody pinned.
    const sent = await publish(captain.id, { scope: "everyone" });

    expect(await listPinnedForUser(member.id)).toEqual([]);

    // Seed the opposite case and watch the assertion move: pinning the
    // published one makes exactly it appear, and the draft still does not.
    await setAnnouncementPinned({
      id: sent,
      actorId: captain.id,
      pinned: true,
    });
    expect((await listPinnedForUser(member.id)).map((p) => p.id)).toEqual([
      sent,
    ]);
  });

  it("loses the pin when the delivery is gone", async () => {
    const db = h.db();
    const captain = await makeUser(db, {
      rank: "captain",
      approvalStatus: "approved",
    });
    const member = await makeUser(db, { approvalStatus: "approved" });
    const id = await publish(captain.id, { scope: "everyone" });
    await setAnnouncementPinned({ id, actorId: captain.id, pinned: true });
    expect(await listPinnedForUser(member.id)).toHaveLength(1);

    // The delivery is the permission. Take it away and the banner goes with
    // it — the pin is not a second, parallel answer to "who may see this".
    await db
      .delete(schema.notificationDeliveries)
      .where(eq(schema.notificationDeliveries.userId, member.id));
    expect(await listPinnedForUser(member.id)).toEqual([]);
  });

  it("shows EVERY pin, newest pinned first — none is dropped off the end", async () => {
    const db = h.db();
    const captain = await makeUser(db, {
      rank: "captain",
      approvalStatus: "approved",
    });
    const member = await makeUser(db, { approvalStatus: "approved" });

    let day = 0;
    for (const title of ["First", "Second", "Third", "Fourth"]) {
      const id = await publish(captain.id, { scope: "everyone" }, { title });
      await setAnnouncementPinned({ id, actorId: captain.id, pinned: true });
      // The rows are stamped from JS inside one test, so two pins can land on
      // the same millisecond; space them out so the order under test is the
      // comparator's and not the clock's luck.
      day += 1;
      await db
        .update(schema.broadcasts)
        .set({ pinnedAt: new Date(2026, 0, day) })
        .where(eq(schema.broadcasts.id, id));
    }

    // Four pinned, four shown (owner's call, 2026-09-22: the banner scrolls,
    // it does not truncate).
    const pins = await listPinnedForUser(member.id);
    expect(pins.map((p) => p.title)).toEqual([
      "Fourth",
      "Third",
      "Second",
      "First",
    ]);

    // The order is on the PIN's time, not the publish time: re-pinning the
    // oldest announcement brings it to the front without republishing it.
    const first = pins.at(-1)!;
    await db
      .update(schema.broadcasts)
      .set({ pinnedAt: new Date(2026, 0, day + 1) })
      .where(eq(schema.broadcasts.id, first.id));
    expect((await listPinnedForUser(member.id)).map((p) => p.title)).toEqual([
      "First",
      "Fourth",
      "Third",
      "Second",
    ]);
  });

  it("puts a captain's pin above a lead's when the two were pinned at once", async () => {
    const db = h.db();
    const captain = await makeUser(db, {
      rank: "captain",
      approvalStatus: "approved",
    });
    const lead = await makeUser(db, { approvalStatus: "approved" });
    const cook = await makeUser(db, { approvalStatus: "approved" });
    await makeMembership(db, {
      userId: lead.id,
      team: "kitchen",
      isLead: true,
    });
    await makeMembership(db, { userId: cook.id, team: "kitchen" });

    const fromLead = await publish(
      lead.id,
      { scope: "team", team: "kitchen" },
      { title: "Lead's" },
    );
    const fromCaptain = await publish(
      captain.id,
      { scope: "everyone" },
      { title: "Captain's" },
    );
    await setAnnouncementPinned({
      id: fromLead,
      actorId: lead.id,
      pinned: true,
      allowedTeams: ["kitchen"],
    });
    await setAnnouncementPinned({
      id: fromCaptain,
      actorId: captain.id,
      pinned: true,
    });

    // Force the exact tie the rule is for, so the rank is the only thing left
    // to decide it.
    const tie = new Date(2026, 0, 5);
    await db.update(schema.broadcasts).set({ pinnedAt: tie });

    expect((await listPinnedForUser(cook.id)).map((p) => p.title)).toEqual([
      "Captain's",
      "Lead's",
    ]);

    // Seed the opposite case and watch it move: demote the captain and the
    // tie-break no longer favours their pin, so the total order falls through
    // to the id and the answer changes with it.
    await db
      .update(schema.users)
      .set({ rank: "member" })
      .where(eq(schema.users.id, captain.id));
    const byId = [fromCaptain, fromLead].sort();
    expect((await listPinnedForUser(cook.id)).map((p) => p.id)).toEqual(byId);
  });

  it("reports the pinner's rank, and forgets it when the pinner is gone", async () => {
    const db = h.db();
    const captain = await makeUser(db, {
      rank: "captain",
      approvalStatus: "approved",
    });
    const member = await makeUser(db, { approvalStatus: "approved" });
    const id = await publish(captain.id, { scope: "everyone" });
    await setAnnouncementPinned({ id, actorId: captain.id, pinned: true });

    expect((await listPinnedForUser(member.id))[0]).toMatchObject({
      id,
      pinnedByCaptain: true,
    });

    // `pinned_by` is `set null` on delete: losing the captain must leave the
    // camp's standing notice up, just no longer claiming a captain set it.
    await db
      .update(schema.broadcasts)
      .set({ pinnedBy: null })
      .where(eq(schema.broadcasts.id, id));
    expect((await listPinnedForUser(member.id))[0]).toMatchObject({
      id,
      pinnedByCaptain: false,
    });
  });
});

describe("announcement pins — who may set one", () => {
  const h = useTestDb();

  it("records a pin and an unpin in the audit log, with the audience", async () => {
    const db = h.db();
    const captain = await makeUser(db, {
      rank: "captain",
      approvalStatus: "approved",
    });
    const member = await makeUser(db, { approvalStatus: "approved" });
    await makeMembership(db, { userId: member.id, team: "kitchen" });
    const id = await publish(captain.id, { scope: "team", team: "kitchen" });

    await setAnnouncementPinned({ id, actorId: captain.id, pinned: true });
    await setAnnouncementPinned({ id, actorId: captain.id, pinned: false });

    const rows = await auditRows(db, id);
    expect(rows.map((r) => r.action).sort()).toEqual([
      "announcement.pinned",
      "announcement.unpinned",
    ]);
    for (const row of rows) {
      expect(row.actorId).toBe(captain.id);
      expect(row.metadata).toMatchObject({ scope: "team", team: "kitchen" });
    }

    // The unpin really cleared the column, so the banner is empty again.
    expect(await listPinnedForUser(member.id)).toEqual([]);
    const [summary] = await listAnnouncements();
    expect(summary!.pinnedAt).toBeNull();
  });

  it("refuses a pin on a draft, and writes no audit row", async () => {
    const db = h.db();
    const captain = await makeUser(db, {
      rank: "captain",
      approvalStatus: "approved",
    });
    const { id } = await createAnnouncementDraft({
      senderId: captain.id,
      ...DRAFT,
    });

    expect(
      await setAnnouncementPinned({ id, actorId: captain.id, pinned: true }),
    ).toEqual({ ok: false, error: PIN_NOT_PUBLISHED });
    expect(await auditRows(db, id)).toEqual([]);
  });

  it("holds a team lead to the teams they lead", async () => {
    const db = h.db();
    const lead = await makeUser(db, { approvalStatus: "approved" });
    const cook = await makeUser(db, { approvalStatus: "approved" });
    await makeMembership(db, {
      userId: lead.id,
      team: "kitchen",
      isLead: true,
    });
    await makeMembership(db, { userId: cook.id, team: "kitchen" });

    const kitchen = await publish(lead.id, { scope: "team", team: "kitchen" });
    const camp = await publish(lead.id, { scope: "everyone" });

    // Their own team: allowed.
    expect(
      await setAnnouncementPinned({
        id: kitchen,
        actorId: lead.id,
        pinned: true,
        allowedTeams: ["kitchen"],
      }),
    ).toEqual({ ok: true });

    // A camp-wide announcement is outside a lead's reach, even one they wrote
    // — the claim's WHERE refuses it, not only the screen.
    expect(
      await setAnnouncementPinned({
        id: camp,
        actorId: lead.id,
        pinned: true,
        allowedTeams: ["kitchen"],
      }),
    ).toEqual({ ok: false, error: PIN_TEAM_NOT_LED });
    expect(await auditRows(db, camp)).toEqual([]);

    // A lead who has since lost the team cannot pin to it any more.
    expect(
      await setAnnouncementPinned({
        id: kitchen,
        actorId: lead.id,
        pinned: false,
        allowedTeams: [],
      }),
    ).toEqual({ ok: false, error: PIN_TEAM_NOT_LED });
    expect((await listPinnedForUser(cook.id)).map((p) => p.id)).toEqual([
      kitchen,
    ]);
  });

  it("is a compare-and-set: the second pin loses instead of overwriting", async () => {
    const db = h.db();
    const captain = await makeUser(db, {
      rank: "captain",
      approvalStatus: "approved",
    });
    await makeUser(db, { approvalStatus: "approved" });
    const id = await publish(captain.id, { scope: "everyone" });

    expect(
      await setAnnouncementPinned({ id, actorId: captain.id, pinned: true }),
    ).toEqual({ ok: true });
    expect(
      await setAnnouncementPinned({ id, actorId: captain.id, pinned: true }),
    ).toEqual({ ok: false, error: PIN_ALREADY });
    // One act, one receipt.
    expect(await auditRows(db, id)).toHaveLength(1);
  });
});

describe("announcement pins — the composer's mark", () => {
  const ctx = useTestDb();

  /** The pin columns as the table holds them. */
  async function pinRow(db: DB, id: string) {
    const [row] = await db
      .select({
        pinnedAt: schema.broadcasts.pinnedAt,
        pinnedBy: schema.broadcasts.pinnedBy,
        pinOnPublish: schema.broadcasts.pinOnPublish,
      })
      .from(schema.broadcasts)
      .where(eq(schema.broadcasts.id, id));
    return row!;
  }

  it("a draft records the intent and no pin, however often it is edited", async () => {
    const db = ctx.db();
    const captain = await makeUser(db, { rank: "captain" });

    const { id } = await createAnnouncementDraft({
      senderId: captain.id,
      ...DRAFT,
      audience: { scope: "everyone" },
      pinned: true,
    });
    expect(await pinRow(db, id)).toMatchObject({
      pinnedAt: null,
      pinnedBy: null,
      pinOnPublish: true,
    });

    await updateAnnouncementDraft({
      id,
      senderId: captain.id,
      ...DRAFT,
      body: "Truck at 10.",
      pinned: true,
    });
    // Still no pin, and nothing to audit: a draft is on nobody's screen.
    expect(await pinRow(db, id)).toMatchObject({ pinnedAt: null });
    expect(await auditRows(db, id)).toHaveLength(0);
  });

  it("publishing spends the intent, writes the pin, and records it", async () => {
    const db = ctx.db();
    const captain = await makeUser(db, { rank: "captain" });
    await makeUser(db, { rank: "member" });

    const { id } = await createAnnouncementDraft({
      senderId: captain.id,
      ...DRAFT,
      audience: { scope: "everyone" },
      pinned: true,
    });
    const before = new Date();
    expect((await publishAnnouncement({ id, senderId: captain.id })).ok).toBe(
      true,
    );

    const row = await pinRow(db, id);
    expect(row.pinnedBy).toBe(captain.id);
    expect(row.pinOnPublish).toBe(false);
    // The pin is stamped when it reaches screens, not when the draft was saved.
    expect(row.pinnedAt!.getTime()).toBeGreaterThanOrEqual(before.getTime());

    const audit = await auditRows(db, id);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      action: "announcement.pinned",
      actorId: captain.id,
    });
  });

  it("a draft saved without the mark publishes unpinned and unaudited", async () => {
    const db = ctx.db();
    const captain = await makeUser(db, { rank: "captain" });
    await makeUser(db, { rank: "member" });

    const { id } = await createAnnouncementDraft({
      senderId: captain.id,
      ...DRAFT,
      audience: { scope: "everyone" },
    });
    await publishAnnouncement({ id, senderId: captain.id });

    expect(await pinRow(db, id)).toMatchObject({
      pinnedAt: null,
      pinOnPublish: false,
    });
    expect(await auditRows(db, id)).toHaveLength(0);
  });
});

import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { LAYOUT_TEAM, emptyLayout, newPiece } from "@camp404/core";
import type { CampLayout, Team } from "@camp404/types";
import type { CampConfig } from "../camp-config";
import {
  ALREADY_HAS_LAYOUT,
  LAYOUT_CHANGED,
  NOT_A_LAYOUT_EDITOR,
  NOT_A_LAYOUT_SHARER,
  NOTHING_TO_SHARE,
  NO_EARLIER_LAYOUT,
  copyLastYearLayout,
  getCampLayout,
  getLayoutShare,
  getSharedLayout,
  layoutArrivalCounts,
  layoutAuditTarget,
  listLayoutVersions,
  previousLayoutCycle,
  restoreLayoutVersion,
  saveCampLayout,
  shareCampLayout,
  unshareCampLayout,
} from "../camp-layout";
import * as schema from "../schema";
import { assignTeam, setLead } from "../team-memberships";
import { useTestDb } from "./_harness";
import { makeUser } from "./_factories";

// The camp layout (#271) on a real Postgres (PGlite). What matters: only a
// captain or a Structures lead saves, checked inside the write; a lead of
// another team and a plain member are refused; a save is compare-and-set;
// "copy last year" never replaces a plan; only a captain shares, with an
// audit row; a turned-off link reads as nothing; and the neighbour's read
// carries no label, no name and no per-person arrival.

type DB = ReturnType<ReturnType<typeof useTestDb>["db"]>;

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

/** A plan with one labelled tent that names a member, and a named edge. */
function plan(): CampLayout {
  const layout = emptyLayout();
  layout.plot.edges.right = "Road";
  const tent = {
    ...newPiece("tent", "p-1", layout.plot),
    label: "Zanele's tent",
  };
  return { ...layout, pieces: [tent, newPiece("kitchen", "p-2", layout.plot)] };
}

describe("camp layout", () => {
  const h = useTestDb();

  async function leadOf(team: Team, name?: string) {
    const user = await makeUser(h.db(), name ? { displayName: name } : {});
    await assignTeam({ userId: user.id, team });
    const led = await setLead({ userId: user.id, team, isLead: true });
    expect(led).toEqual({ ok: true, changed: true });
    return user;
  }

  async function people() {
    await campYear(h.db(), 2027, [2026]);
    const captain = await makeUser(h.db(), { rank: "captain" });
    const structuresLead = await leadOf(LAYOUT_TEAM as Team, "Sipho Lead");
    const kitchenLead = await leadOf("kitchen");
    const member = await makeUser(h.db());
    return { captain, structuresLead, kitchenLead, member };
  }

  describe("who may save", () => {
    it("lets a captain and a Structures lead save, each a new version", async () => {
      const { captain, structuresLead } = await people();
      expect(
        await saveCampLayout({
          actorId: structuresLead.id,
          layout: plan(),
          expectedVersion: 0,
          note: "First go",
        }),
      ).toEqual({ ok: true, version: 1 });
      expect(
        await saveCampLayout({
          actorId: captain.id,
          layout: emptyLayout(),
          expectedVersion: 1,
        }),
      ).toEqual({ ok: true, version: 2 });

      const state = await getCampLayout();
      expect(state).toMatchObject({ cycle: 2027, version: 2, shared: false });
      expect(state.layout?.pieces).toEqual([]);
      const first = await getCampLayout(undefined, 1);
      expect(first.layout?.pieces).toHaveLength(2);
      expect(first.savedByName).toBe("Sipho Lead");

      const versions = await listLayoutVersions();
      expect(versions.map((v) => [v.number, v.note, v.pieces])).toEqual([
        [2, null, 0],
        [1, "First go", 2],
      ]);
    });

    it("refuses a lead of another team and a plain member, and writes nothing", async () => {
      const { kitchenLead, member } = await people();
      for (const actor of [kitchenLead, member]) {
        expect(
          await saveCampLayout({
            actorId: actor.id,
            layout: plan(),
            expectedVersion: 0,
          }),
        ).toEqual({ ok: false, error: NOT_A_LAYOUT_EDITOR });
      }
      expect(await h.db().select().from(schema.campLayoutVersions)).toEqual([]);
      expect((await getCampLayout()).version).toBe(0);
    });

    it("sees a demotion: a Structures lead who no longer leads is refused", async () => {
      const { structuresLead } = await people();
      await setLead({
        userId: structuresLead.id,
        team: LAYOUT_TEAM as Team,
        isLead: false,
      });
      expect(
        await saveCampLayout({
          actorId: structuresLead.id,
          layout: plan(),
          expectedVersion: 0,
        }),
      ).toEqual({ ok: false, error: NOT_A_LAYOUT_EDITOR });
    });

    it("refuses a plan with a piece off the plot", async () => {
      const { captain } = await people();
      const bad = plan();
      bad.pieces[0] = { ...bad.pieces[0]!, x: bad.plot.widthM };
      const result = await saveCampLayout({
        actorId: captain.id,
        layout: bad,
        expectedVersion: 0,
      });
      expect(result.ok).toBe(false);
    });
  });

  describe("compare-and-set", () => {
    it("tells the second of two saves from the same version to reload", async () => {
      const { captain, structuresLead } = await people();
      await saveCampLayout({
        actorId: captain.id,
        layout: plan(),
        expectedVersion: 0,
      });
      expect(
        await saveCampLayout({
          actorId: structuresLead.id,
          layout: emptyLayout(),
          expectedVersion: 0,
        }),
      ).toEqual({ ok: false, error: LAYOUT_CHANGED });
      expect((await getCampLayout()).layout?.pieces).toHaveLength(2);
    });

    it("brings back an old version as the newest", async () => {
      const { captain } = await people();
      await saveCampLayout({
        actorId: captain.id,
        layout: plan(),
        expectedVersion: 0,
      });
      await saveCampLayout({
        actorId: captain.id,
        layout: emptyLayout(),
        expectedVersion: 1,
      });
      expect(
        await restoreLayoutVersion({
          actorId: captain.id,
          number: 1,
          expectedVersion: 2,
        }),
      ).toEqual({ ok: true, version: 3 });
      const state = await getCampLayout();
      expect(state.layout?.pieces).toHaveLength(2);
      expect(state.note).toBe("Brought back version 1");
    });
  });

  describe("copy last year", () => {
    it("starts this year from last year's latest plan, once", async () => {
      const { captain, structuresLead } = await people();
      expect(await copyLastYearLayout({ actorId: captain.id })).toEqual({
        ok: false,
        error: NO_EARLIER_LAYOUT,
      });
      // Last year's plan, two versions; the latest has only the kitchen.
      const last = plan();
      await h
        .db()
        .insert(schema.campLayouts)
        .values({ cycle: 2026, latestVersion: 2 });
      await h
        .db()
        .insert(schema.campLayoutVersions)
        .values([
          { cycle: 2026, number: 1, body: emptyLayout() },
          {
            cycle: 2026,
            number: 2,
            body: { ...last, pieces: [last.pieces[1]!] },
          },
        ]);
      expect(await previousLayoutCycle()).toBe(2026);

      expect(await copyLastYearLayout({ actorId: structuresLead.id })).toEqual({
        ok: true,
        version: 1,
        fromCycle: 2026,
      });
      const state = await getCampLayout();
      expect(state.layout?.pieces.map((p) => p.kind)).toEqual(["kitchen"]);
      expect(state.note).toBe("Copied from 2026");

      expect(await copyLastYearLayout({ actorId: captain.id })).toEqual({
        ok: false,
        error: ALREADY_HAS_LAYOUT,
      });
    });
  });

  describe("the neighbour link", () => {
    async function arrive(userId: string, day: string, cycle = 2027) {
      await h
        .db()
        .insert(schema.driverProfiles)
        .values({
          userId,
          cycle,
          version: "1",
          arrivalAt: new Date(`${day}T00:00:00.000Z`),
        });
    }

    it("is a captain's to turn on, needs a saved plan, and writes an audit row", async () => {
      const { captain, structuresLead, member } = await people();
      expect(await shareCampLayout({ actorId: captain.id })).toEqual({
        ok: false,
        error: NOTHING_TO_SHARE,
      });
      await saveCampLayout({
        actorId: captain.id,
        layout: plan(),
        expectedVersion: 0,
      });
      for (const actor of [structuresLead, member]) {
        expect(await shareCampLayout({ actorId: actor.id })).toEqual({
          ok: false,
          error: NOT_A_LAYOUT_SHARER,
        });
        expect(await unshareCampLayout({ actorId: actor.id })).toEqual({
          ok: false,
          error: NOT_A_LAYOUT_SHARER,
        });
      }
      expect((await getLayoutShare()).token).toBeNull();

      const shared = await shareCampLayout({ actorId: captain.id });
      if (!shared.ok) throw new Error(shared.error);
      expect(shared.token).toMatch(/^[A-Za-z0-9_-]{32}$/);
      expect((await getLayoutShare()).token).toBe(shared.token);
      expect((await getCampLayout()).shared).toBe(true);

      const audit = await h
        .db()
        .select()
        .from(schema.auditLog)
        .where(eq(schema.auditLog.target, layoutAuditTarget(2027)));
      expect(audit.map((a) => [a.action, a.actorId])).toEqual([
        ["camp.layout.shared", captain.id],
      ]);
    });

    it("shows the plan without labels, names or edge notes, and arrivals as counts", async () => {
      const { captain, structuresLead, member, kitchenLead } = await people();
      await saveCampLayout({
        actorId: structuresLead.id,
        layout: plan(),
        expectedVersion: 0,
      });
      await arrive(member.id, "2027-04-26");
      await arrive(kitchenLead.id, "2027-04-26");
      await arrive(captain.id, "2027-04-23");
      // Last year's arrival does not count this year.
      await arrive(structuresLead.id, "2026-04-20", 2026);

      const shared = await shareCampLayout({ actorId: captain.id });
      if (!shared.ok) throw new Error(shared.error);
      const page = await getSharedLayout(shared.token);
      // Present first: the plan and the counts are there.
      expect(page?.layout?.pieces.map((p) => p.kind)).toEqual([
        "tent",
        "kitchen",
      ]);
      expect(page?.arrivals).toEqual([
        { day: "2027-04-23", count: 1 },
        { day: "2027-04-26", count: 2 },
      ]);
      expect(await layoutArrivalCounts()).toEqual(page?.arrivals);
      // Then the absences.
      const text = JSON.stringify(page);
      for (const secret of [
        "Zanele",
        "Road",
        "Sipho",
        structuresLead.id,
        member.id,
        member.displayName,
      ]) {
        expect(text).not.toContain(secret);
      }
    });

    it("reads as nothing once turned off, or once replaced", async () => {
      const { captain } = await people();
      await saveCampLayout({
        actorId: captain.id,
        layout: plan(),
        expectedVersion: 0,
      });
      const first = await shareCampLayout({ actorId: captain.id });
      if (!first.ok) throw new Error(first.error);
      const second = await shareCampLayout({ actorId: captain.id });
      if (!second.ok) throw new Error(second.error);
      expect(await getSharedLayout(first.token)).toBeNull();
      expect(await getSharedLayout(second.token)).not.toBeNull();

      expect(await unshareCampLayout({ actorId: captain.id })).toEqual({
        ok: true,
        changed: true,
      });
      expect(await getSharedLayout(second.token)).toBeNull();
      expect(await unshareCampLayout({ actorId: captain.id })).toEqual({
        ok: true,
        changed: false,
      });
      expect(await getSharedLayout("not-a-token")).toBeNull();

      const actions = await h
        .db()
        .select({ action: schema.auditLog.action })
        .from(schema.auditLog)
        .where(eq(schema.auditLog.target, layoutAuditTarget(2027)));
      expect(actions.map((a) => a.action).sort()).toEqual([
        "camp.layout.shared",
        "camp.layout.shared",
        "camp.layout.unshared",
      ]);
    });
  });
});

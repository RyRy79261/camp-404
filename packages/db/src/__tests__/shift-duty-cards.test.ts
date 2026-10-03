import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { CLEANING_TEAM } from "@camp404/core";
import type { DutyCard, Team } from "@camp404/types";
import type { CampConfig } from "../camp-config";
import * as schema from "../schema";
import {
  DUTY_CARD_GONE,
  NOT_A_SHIFT_KEEPER,
  SHIFT_TYPE_CHANGED,
  listShiftsForDutyCard,
  readShiftRoster,
  saveShiftType,
} from "../shifts";
import { listPublishedDutyCards } from "../documents";
import { assignTeam, setLead } from "../team-memberships";
import { useTestDb } from "./_harness";
import { makeUser } from "./_factories";

// Each shift links to its duty card in the Survival Guide (#250; the owner's
// Option A, 2026-10-02) on a real Postgres (PGlite). What matters: a lead of
// the shift's team or a captain picks the card in the shift's set-up, checked
// inside the write like the rest of the set-up, a compare-and-set on the
// shift's version, audited; one card serves several shifts; only a published
// duty card may be picked, and only one members can read shows on the
// roster; and a new year's shift takes the card last year's shift of the
// same name had (owner's default, 2026-10-02), which the lead may change.

type DB = ReturnType<ReturnType<typeof useTestDb>["db"]>;

const YEAR = 2027;
const BURN = { start: "2027-04-27", end: "2027-05-03" };
const BEFORE = new Date("2027-04-01T08:00:00Z");

async function campYear(db: DB) {
  const cycles: CampConfig["cycles"] = [
    { year: YEAR, startedAt: `${YEAR}-01-01T00:00:00.000Z`, endedAt: null },
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
  await db.insert(schema.logisticsPhases).values({
    cycle: YEAR,
    phase: "burn",
    startDate: BURN.start,
    endDate: BURN.end,
  });
}

const CARD: DutyCard = {
  subRoles: [{ name: "Washing", min: 2, max: 2 }],
  steps: ["Fill the three basins."],
  hardRules: ["Never pour grey water on the ground."],
  checklist: ["Basins emptied."],
  askRole: "The Kitchen lead on shift",
};

/** A duty card, written as the guide stores one; published unless told. */
async function dutyCard(
  db: DB,
  input: {
    slug: string;
    title: string;
    team?: Team | null;
    published?: boolean;
    kind?: "chapter" | "duty_card";
    shiftTypeKey?: string;
  },
) {
  const kind = input.kind ?? "duty_card";
  const card =
    kind === "duty_card"
      ? {
          ...CARD,
          ...(input.shiftTypeKey ? { shiftTypeKey: input.shiftTypeKey } : {}),
        }
      : null;
  const published = input.published ?? true;
  const [doc] = await db
    .insert(schema.documents)
    .values({
      title: input.title,
      slug: input.slug,
      category: "kitchen",
      team: input.team === undefined ? "kitchen" : input.team,
      kind,
      card,
      published,
      publishedVersion: published ? 1 : null,
    })
    .returning();
  if (published) {
    await db.insert(schema.documentVersions).values({
      documentId: doc!.id,
      version: 1,
      title: input.title,
      category: "kitchen",
      team: doc!.team,
      kind,
      markdown: "",
      card,
    });
  }
  return doc!;
}

const DISHES = {
  team: "kitchen" as Team,
  name: "Breakfast dishes",
  startMinute: 9 * 60,
  durationMinutes: 60,
  places: 3,
  note: null,
  expectedVersion: 0,
};

function helpers(h: ReturnType<typeof useTestDb>) {
  async function leadOf(team: Team, displayName: string) {
    const user = await makeUser(h.db(), { displayName });
    await assignTeam({ userId: user.id, team });
    await setLead({ userId: user.id, team, isLead: true });
    return user;
  }

  async function people() {
    await campYear(h.db());
    const captain = await makeUser(h.db(), { rank: "captain" });
    const kitchenLead = await leadOf("kitchen", "Kit Lead");
    const sanitationLead = await leadOf(CLEANING_TEAM as Team, "San Lead");
    const dee = await makeUser(h.db(), { displayName: "Dee Member" });
    return { captain, kitchenLead, sanitationLead, dee };
  }

  async function save(input: Parameters<typeof saveShiftType>[0]) {
    const saved = await saveShiftType({ now: BEFORE, ...input });
    if (!saved.ok) throw new Error(saved.error);
    return saved.type;
  }

  /** A shift of an earlier year, written as that year's set-up left it. */
  async function earlier(
    cycle: number,
    name: string,
    dutyCardId: string | null,
    team: Team = "kitchen",
  ) {
    await h
      .db()
      .insert(schema.shiftTypes)
      .values({
        cycle,
        team,
        name,
        startMinute: 9 * 60,
        durationMinutes: 60,
        places: 3,
        dutyCardId,
      });
  }

  async function audits(action: string) {
    return h
      .db()
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.action, action));
  }

  return { people, save, earlier, audits };
}

describe("a shift's duty card", () => {
  const h = useTestDb();
  const { people, save, audits } = helpers(h);

  it("a Kitchen lead links one Dishes card to breakfast and dinner dishes; both rows show it and the card lists both", async () => {
    const { kitchenLead } = await people();
    const dishes = await dutyCard(h.db(), { slug: "dishes", title: "Dishes" });
    const breakfast = await save({
      ...DISHES,
      actorId: kitchenLead.id,
      dutyCardId: dishes.id,
    });
    const dinner = await save({
      ...DISHES,
      name: "Dinner dishes",
      startMinute: 20 * 60,
      actorId: kitchenLead.id,
      dutyCardId: dishes.id,
    });
    const lunch = await save({
      ...DISHES,
      name: "Kitchen close-down",
      startMinute: 21 * 60,
      actorId: kitchenLead.id,
    });

    const roster = await readShiftRoster(YEAR);
    const link = { id: dishes.id, slug: "dishes", title: "Dishes" };
    expect(roster.types.map((t) => [t.name, t.dutyCard])).toEqual([
      ["Breakfast dishes", link],
      ["Dinner dishes", link],
      ["Kitchen close-down", null],
    ]);
    expect(lunch.dutyCardId).toBeNull();

    const shifts = await listShiftsForDutyCard(dishes.id, YEAR);
    expect(shifts).toEqual([
      expect.objectContaining({ id: breakfast.id, name: "Breakfast dishes" }),
      expect.objectContaining({ id: dinner.id, name: "Dinner dishes" }),
    ]);
    // Needed on all seven Burn days.
    expect(shifts.map((s) => s.days)).toEqual([7, 7]);
    // Another year's shifts are not this year's.
    expect(await listShiftsForDutyCard(dishes.id, YEAR + 1)).toEqual([]);

    const rows = await audits("shifts.type_added");
    expect(rows.map((r) => r.metadata)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "Breakfast dishes",
          dutyCardId: dishes.id,
        }),
      ]),
    );
  });

  it("offers every published duty card, and only those", async () => {
    await people();
    await dutyCard(h.db(), { slug: "toilets", title: "Toilets", team: null });
    await dutyCard(h.db(), { slug: "dishes", title: "Dishes" });
    await dutyCard(h.db(), {
      slug: "draft",
      title: "Draft card",
      published: false,
    });
    await dutyCard(h.db(), {
      slug: "kitchen-safety",
      title: "Kitchen safety",
      kind: "chapter",
    });
    expect((await listPublishedDutyCards()).map((c) => c.title)).toEqual([
      "Dishes",
      "Toilets",
    ]);
  });

  it("refuses a card that is not a published duty card, and writes nothing", async () => {
    const { kitchenLead } = await people();
    const draft = await dutyCard(h.db(), {
      slug: "draft",
      title: "Draft",
      published: false,
    });
    const chapter = await dutyCard(h.db(), {
      slug: "a-chapter",
      title: "A chapter",
      kind: "chapter",
    });
    // Published, but with no version row at its published number: nothing
    // members could read, as the roster's own read sees it.
    const noVersion = await dutyCard(h.db(), { slug: "torn", title: "Torn" });
    await h
      .db()
      .update(schema.documents)
      .set({ publishedVersion: 2 })
      .where(eq(schema.documents.id, noVersion.id));
    for (const dutyCardId of [
      draft.id,
      chapter.id,
      noVersion.id,
      "00000000-0000-4000-8000-000000000000",
      "not-a-uuid",
    ]) {
      expect(
        await saveShiftType({
          ...DISHES,
          actorId: kitchenLead.id,
          dutyCardId,
          now: BEFORE,
        }),
      ).toEqual({ ok: false, error: DUTY_CARD_GONE });
    }
    expect((await readShiftRoster(YEAR)).types).toEqual([]);
    expect(await audits("shifts.type_added")).toEqual([]);
  });

  it("only a lead of the shift's team or a captain changes its card; another team's lead and a member are refused", async () => {
    const { kitchenLead, sanitationLead, dee, captain } = await people();
    const dishes = await dutyCard(h.db(), { slug: "dishes", title: "Dishes" });
    const other = await dutyCard(h.db(), { slug: "other", title: "Other" });
    const type = await save({ ...DISHES, actorId: kitchenLead.id });
    for (const actorId of [sanitationLead.id, dee.id]) {
      expect(
        await saveShiftType({
          ...DISHES,
          id: type.id,
          expectedVersion: type.version,
          dutyCardId: dishes.id,
          actorId,
          now: BEFORE,
        }),
      ).toEqual({ ok: false, error: NOT_A_SHIFT_KEEPER });
    }
    const [unchanged] = (await readShiftRoster(YEAR)).types;
    expect(unchanged!.dutyCardId).toBeNull();

    const byCaptain = await save({
      ...DISHES,
      id: type.id,
      expectedVersion: type.version,
      dutyCardId: other.id,
      actorId: captain.id,
    });
    expect(byCaptain.dutyCardId).toBe(other.id);
    const changed = await audits("shifts.type_changed");
    expect(changed).toHaveLength(1);
    expect(changed[0]!.actorId).toBe(captain.id);
    expect(changed[0]!.metadata).toMatchObject({ dutyCardId: other.id });
  });

  it("is a compare-and-set on the shift's version: the second of two editors is told, and the first's card stays", async () => {
    const { kitchenLead, captain } = await people();
    const dishes = await dutyCard(h.db(), { slug: "dishes", title: "Dishes" });
    const other = await dutyCard(h.db(), { slug: "other", title: "Other" });
    const type = await save({ ...DISHES, actorId: kitchenLead.id });
    const first = await save({
      ...DISHES,
      id: type.id,
      expectedVersion: 1,
      dutyCardId: dishes.id,
      actorId: kitchenLead.id,
    });
    expect(first.version).toBe(2);
    expect(
      await saveShiftType({
        ...DISHES,
        id: type.id,
        expectedVersion: 1,
        dutyCardId: other.id,
        actorId: captain.id,
        now: BEFORE,
      }),
    ).toEqual({ ok: false, error: SHIFT_TYPE_CHANGED });
    expect((await readShiftRoster(YEAR)).types[0]!.dutyCardId).toBe(dishes.id);
  });

  it("a change that leaves the card out keeps it; null takes it off", async () => {
    const { kitchenLead } = await people();
    const dishes = await dutyCard(h.db(), { slug: "dishes", title: "Dishes" });
    const type = await save({
      ...DISHES,
      actorId: kitchenLead.id,
      dutyCardId: dishes.id,
    });
    const kept = await save({
      ...DISHES,
      id: type.id,
      places: 4,
      expectedVersion: 1,
      actorId: kitchenLead.id,
    });
    expect(kept.dutyCardId).toBe(dishes.id);
    const cleared = await save({
      ...DISHES,
      id: type.id,
      expectedVersion: 2,
      dutyCardId: null,
      actorId: kitchenLead.id,
    });
    expect(cleared.dutyCardId).toBeNull();
  });

  it("a card taken off the guide stays linked but is not shown; deleting it unlinks", async () => {
    const { kitchenLead } = await people();
    const dishes = await dutyCard(h.db(), { slug: "dishes", title: "Dishes" });
    await save({ ...DISHES, actorId: kitchenLead.id, dutyCardId: dishes.id });
    await h
      .db()
      .update(schema.documents)
      .set({ published: false })
      .where(eq(schema.documents.id, dishes.id));
    let [type] = (await readShiftRoster(YEAR)).types;
    expect(type!.dutyCardId).toBe(dishes.id);
    expect(type!.dutyCard).toBeNull();

    await h
      .db()
      .delete(schema.documents)
      .where(eq(schema.documents.id, dishes.id));
    [type] = (await readShiftRoster(YEAR)).types;
    expect(type!.dutyCardId).toBeNull();
  });
});

describe("a new year's shift picks up its card", () => {
  const h = useTestDb();
  const { people, save, earlier, audits } = helpers(h);

  it("takes the card last year's shift of the same name had, any case, audited as picked up", async () => {
    const { kitchenLead } = await people();
    const dishes = await dutyCard(h.db(), { slug: "dishes", title: "Dishes" });
    const old = await dutyCard(h.db(), { slug: "old", title: "Old dishes" });
    await earlier(YEAR - 1, "Breakfast dishes", dishes.id);
    // An older year's card loses to last year's.
    await earlier(YEAR - 2, "Breakfast dishes", old.id);
    // Last year's shift of another name says nothing about this one.
    await earlier(YEAR - 1, "Dinner dishes", old.id);

    const type = await save({
      ...DISHES,
      name: "  breakfast DISHES ",
      actorId: kitchenLead.id,
    });
    expect(type.dutyCardId).toBe(dishes.id);
    const [row] = await audits("shifts.type_added");
    expect(row!.metadata).toMatchObject({
      dutyCardId: dishes.id,
      dutyCardPickedUp: true,
    });

    const fresh = await save({
      ...DISHES,
      name: "Kitchen close-down",
      actorId: kitchenLead.id,
    });
    expect(fresh.dutyCardId).toBeNull();
  });

  it("the lead may change it, or say None in the set-up", async () => {
    const { kitchenLead } = await people();
    const dishes = await dutyCard(h.db(), { slug: "dishes", title: "Dishes" });
    const other = await dutyCard(h.db(), { slug: "other", title: "Other" });
    await earlier(YEAR - 1, "Breakfast dishes", dishes.id);
    const picked = await save({
      ...DISHES,
      actorId: kitchenLead.id,
      dutyCardId: other.id,
    });
    expect(picked.dutyCardId).toBe(other.id);
    const none = await save({
      ...DISHES,
      startMinute: 10 * 60,
      actorId: kitchenLead.id,
      dutyCardId: null,
    });
    expect(none.dutyCardId).toBeNull();
  });

  it("skips a card that is off the guide now, and prefers the shift's own team when last year had two", async () => {
    const { kitchenLead } = await people();
    const gone = await dutyCard(h.db(), {
      slug: "gone",
      title: "Gone",
      published: false,
    });
    await earlier(YEAR - 1, "Breakfast dishes", gone.id);
    expect(
      (await save({ ...DISHES, actorId: kitchenLead.id })).dutyCardId,
    ).toBeNull();

    const kitchen = await dutyCard(h.db(), { slug: "k", title: "Kitchen's" });
    const sanitation = await dutyCard(h.db(), {
      slug: "s",
      title: "Sanitation's",
    });
    await earlier(YEAR - 1, "Wash up", sanitation.id, CLEANING_TEAM as Team);
    await earlier(YEAR - 1, "Wash up", kitchen.id, "kitchen");
    expect(
      (await save({ ...DISHES, name: "Wash up", actorId: kitchenLead.id }))
        .dutyCardId,
    ).toBe(kitchen.id);
  });

  it("a changed shift never picks one up", async () => {
    const { kitchenLead } = await people();
    const dishes = await dutyCard(h.db(), { slug: "dishes", title: "Dishes" });
    const type = await save({
      ...DISHES,
      name: "Wash",
      actorId: kitchenLead.id,
    });
    await earlier(YEAR - 1, "Breakfast dishes", dishes.id);
    const renamed = await save({
      ...DISHES,
      id: type.id,
      expectedVersion: 1,
      actorId: kitchenLead.id,
    });
    expect(renamed.dutyCardId).toBeNull();
  });
});

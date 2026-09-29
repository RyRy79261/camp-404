import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { AUDIT_ACTION_LABELS, type AuditAction } from "@camp404/core";
import { TeamProgramInput } from "@camp404/types";
import {
  createAnnouncementDraft,
  listTeamAnnouncements,
  publishAnnouncement,
  TEAM_ANNOUNCEMENT_LIMIT,
} from "../broadcasts";
import * as schema from "../schema";
import { setLead } from "../team-memberships";
import {
  NOT_A_TEAM_EDITOR,
  TEAM_PROGRAM_CHANGED,
  getTeamProgram,
  saveTeamProgram,
} from "../team-programs";
import { useTestDb } from "./_harness";
import { makeMembership, makeUser } from "./_factories";

// Team programs on a real Postgres (PGlite). What matters: only a captain or
// a lead OF THAT TEAM writes a team's description (owner's ruling
// 1), checked again inside the write's own transaction; every write is a
// compare-and-set and leaves exactly one audit row beside its change; and a
// team's program lists only the announcements that have gone out (ruling 3).

// Seeded from the code's own vocabulary, so a renamed action fails here.
const ACTION: AuditAction = "team.program_changed";

const TEXT = TeamProgramInput.parse({
  team: "power_and_lighting",
  description: "We keep the lights on and the freezers cold.",
  expectedVersion: 0,
});

describe("team programs", () => {
  const h = useTestDb();

  async function people() {
    const db = h.db();
    const captain = await makeUser(db, { rank: "captain" });
    const powerLead = await makeUser(db);
    await makeMembership(db, {
      userId: powerLead.id,
      team: "power_and_lighting",
      isLead: true,
    });
    const kitchenLead = await makeUser(db);
    await makeMembership(db, {
      userId: kitchenLead.id,
      team: "kitchen",
      isLead: true,
    });
    const powerHand = await makeUser(db);
    await makeMembership(db, {
      userId: powerHand.id,
      team: "power_and_lighting",
    });
    return { captain, powerLead, kitchenLead, powerHand };
  }

  async function audits() {
    return h
      .db()
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.action, ACTION));
  }

  it("keeps no links: the table holds the description and its bookkeeping only", async () => {
    const columns = await h.db().execute<{
      column_name: string;
    }>(sql`select column_name from information_schema.columns where table_name = 'team_programs' order by column_name`);
    expect(columns.rows.map((r) => r.column_name)).toEqual([
      "description",
      "team",
      "updated_at",
      "version",
    ]);
  });

  it("reads an empty program, version 0, for a team nobody has written", async () => {
    expect(await getTeamProgram("water")).toEqual({
      team: "water",
      description: "",
      version: 0,
      updatedAt: null,
    });
  });

  it("lets the team's lead write, and records who in the same change", async () => {
    const { powerLead } = await people();
    expect(await saveTeamProgram({ ...TEXT, actorId: powerLead.id })).toEqual({
      ok: true,
      version: 1,
    });
    expect(await getTeamProgram("power_and_lighting")).toMatchObject({
      description: TEXT.description,
      version: 1,
    });
    const rows = await audits();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      actorId: powerLead.id,
      target: "power_and_lighting",
      metadata: {
        team: "power_and_lighting",
        version: 1,
        description: TEXT.description,
      },
    });
    expect(AUDIT_ACTION_LABELS[ACTION]).toBeTruthy();
  });

  it("lets a captain write any team, as a compare-and-set on the version", async () => {
    const { captain, powerLead } = await people();
    await saveTeamProgram({ ...TEXT, actorId: powerLead.id });
    expect(
      await saveTeamProgram({
        ...TEXT,
        description: "",
        expectedVersion: 1,
        actorId: captain.id,
      }),
    ).toEqual({ ok: true, version: 2 });
    expect(await getTeamProgram("power_and_lighting")).toMatchObject({
      description: "",
      version: 2,
    });

    // The lead still holds version 1: their save loses, and says so.
    expect(
      await saveTeamProgram({
        ...TEXT,
        expectedVersion: 1,
        actorId: powerLead.id,
      }),
    ).toEqual({ ok: false, error: TEAM_PROGRAM_CHANGED });
    // A second "first" save loses too, rather than overwrite.
    expect(
      await saveTeamProgram({
        ...TEXT,
        expectedVersion: 0,
        actorId: captain.id,
      }),
    ).toEqual({ ok: false, error: TEAM_PROGRAM_CHANGED });
    expect((await getTeamProgram("power_and_lighting")).version).toBe(2);
    // Only the two saves that changed something are on the record.
    expect(await audits()).toHaveLength(2);
  });

  it("refuses a lead of another team and a team's plain member, and writes nothing", async () => {
    const { kitchenLead, powerHand } = await people();
    for (const actor of [kitchenLead, powerHand]) {
      expect(await saveTeamProgram({ ...TEXT, actorId: actor.id })).toEqual({
        ok: false,
        error: NOT_A_TEAM_EDITOR,
      });
    }
    expect((await getTeamProgram("power_and_lighting")).version).toBe(0);
    expect(await h.db().select().from(schema.teamPrograms)).toEqual([]);
    expect(await audits()).toEqual([]);
  });

  it("re-reads the lead flag inside the write: a lead demoted before it is refused", async () => {
    const { powerLead } = await people();
    await setLead({
      userId: powerLead.id,
      team: "power_and_lighting",
      isLead: false,
    });
    expect(await saveTeamProgram({ ...TEXT, actorId: powerLead.id })).toEqual({
      ok: false,
      error: NOT_A_TEAM_EDITOR,
    });
    expect(await audits()).toEqual([]);
  });

  it("refuses last year's lead", async () => {
    const db = h.db();
    const oldLead = await makeUser(db);
    await makeMembership(db, {
      userId: oldLead.id,
      team: "water",
      isLead: true,
      cycle: 2020,
    });
    expect(
      await saveTeamProgram({ ...TEXT, team: "water", actorId: oldLead.id }),
    ).toEqual({ ok: false, error: NOT_A_TEAM_EDITOR });
  });

  it("refuses at the table what the boundary would, as the last guard", async () => {
    const { captain } = await people();
    await expect(
      saveTeamProgram({
        ...TEXT,
        description: "x".repeat(301),
        actorId: captain.id,
      }),
    ).rejects.toThrow();
    // Neither half landed: no row and no audit.
    expect(await h.db().select().from(schema.teamPrograms)).toEqual([]);
    expect(await audits()).toEqual([]);
  });
});

describe("a team's announcements on its program", () => {
  const h = useTestDb();

  const DRAFT = { body: "Bring gloves.", presentation: "feed" as const };

  async function send(
    senderId: string,
    title: string,
    team: "water" | "kitchen" = "water",
  ) {
    const { id } = await createAnnouncementDraft({
      senderId,
      title,
      ...DRAFT,
      audience: { scope: "team", team },
    });
    const published = await publishAnnouncement({ id, senderId });
    expect(published.ok).toBe(true);
    return id;
  }

  it("lists only what went out to that team, newest first, with no drafts", async () => {
    const db = h.db();
    const captain = await makeUser(db, {
      rank: "captain",
      approvalStatus: "approved",
      displayName: "Cap",
    });
    const first = await send(captain.id, "Tank delivery");
    await db
      .update(schema.broadcasts)
      .set({ dispatchedAt: new Date("2026-09-01T10:00:00Z") })
      .where(eq(schema.broadcasts.id, first));
    await send(captain.id, "Fill the bowser");
    // Another team's, a camp-wide one and a draft: none of them are Water's.
    await send(captain.id, "Kitchen only", "kitchen");
    const everyone = await createAnnouncementDraft({
      senderId: captain.id,
      title: "Whole camp",
      ...DRAFT,
    });
    await publishAnnouncement({ id: everyone.id, senderId: captain.id });
    await createAnnouncementDraft({
      senderId: captain.id,
      title: "Water draft",
      ...DRAFT,
      audience: { scope: "team", team: "water" },
    });
    // Published but waiting for its time: not gone out, so not listed.
    const [scheduled] = await db
      .insert(schema.broadcasts)
      .values({
        senderId: captain.id,
        kind: "announcement",
        scope: "team",
        team: "water",
        title: "Water later",
        body: "Not yet.",
        publishedAt: new Date(),
        sendAt: new Date(Date.now() + 86_400_000),
      })
      .returning({ id: schema.broadcasts.id });
    expect(scheduled).toBeTruthy();

    const { items, more } = await listTeamAnnouncements("water");
    expect(items.map((a) => a.title)).toEqual([
      "Fill the bowser",
      "Tank delivery",
    ]);
    expect(items[0]).toMatchObject({
      body: "Bring gloves.",
      senderName: "Cap",
    });
    // Nothing about pins, audiences or reads leaves the server.
    expect(Object.keys(items[0]!).sort()).toEqual(
      ["body", "id", "senderName", "sentAt", "title"].sort(),
    );
    expect(more).toBe(false);
  });

  it("caps the list and says there is more", async () => {
    const db = h.db();
    const captain = await makeUser(db, { rank: "captain" });
    for (let i = 0; i <= TEAM_ANNOUNCEMENT_LIMIT; i++) {
      await send(captain.id, `Note ${i}`);
    }
    const { items, more } = await listTeamAnnouncements("water");
    expect(items).toHaveLength(TEAM_ANNOUNCEMENT_LIMIT);
    expect(more).toBe(true);
  });
});

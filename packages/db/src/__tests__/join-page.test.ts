import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import type { CampConfig } from "../camp-config";
import {
  JOIN_PAGE_CHANGED,
  JOIN_PAGE_NOT_PUBLISHED,
  NOT_A_JOIN_PAGE_EDITOR,
  getJoinPageForEditor,
  getPublishedJoinPage,
  saveJoinPage,
  unpublishJoinPage,
} from "../join-page";
import * as schema from "../schema";
import { assignTeam, setLead } from "../team-memberships";
import { useTestDb } from "./_harness";
import { makeUser } from "./_factories";

// The join page (#264) on a real Postgres (PGlite). What matters: only a
// captain writes, checked inside the write; each write is a compare-and-set on
// version and commits with its audit row; the join site reads only the
// current year's PUBLISHED copy; and a new year starts from last year's text.

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

async function auditRows(db: DB) {
  return db
    .select({
      action: schema.auditLog.action,
      actorId: schema.auditLog.actorId,
      metadata: schema.auditLog.metadata,
    })
    .from(schema.auditLog);
}

describe("join page", () => {
  const h = useTestDb();

  it("before anything is written: an empty draft, nothing published", async () => {
    await campYear(h.db(), 2026);
    expect(await getJoinPageForEditor()).toMatchObject({
      cycle: 2026,
      draft: "",
      published: null,
      version: 0,
      startedFrom: null,
    });
    expect(await getPublishedJoinPage()).toBeNull();
  });

  it("a captain saves a draft: audited, and the join site still shows nothing", async () => {
    await campYear(h.db(), 2026);
    const captain = await makeUser(h.db(), { rank: "captain" });

    const saved = await saveJoinPage({
      actorId: captain.id,
      markdown: "# Hello\n\nCome camp with us.",
      expectedVersion: 0,
      publish: false,
    });
    expect(saved).toEqual({ ok: true, version: 1, cycle: 2026 });
    expect(await getJoinPageForEditor()).toMatchObject({
      draft: "# Hello\n\nCome camp with us.",
      published: null,
      version: 1,
    });
    expect(await getPublishedJoinPage()).toBeNull();
    expect(await auditRows(h.db())).toEqual([
      {
        action: "camp.join_page.saved",
        actorId: captain.id,
        metadata: { cycle: 2026, version: 1, characters: 27 },
      },
    ]);
  });

  it("publishing puts the saved text on the join site; a later draft does not", async () => {
    await campYear(h.db(), 2026);
    const captain = await makeUser(h.db(), { rank: "captain" });

    await saveJoinPage({
      actorId: captain.id,
      markdown: "Version one",
      expectedVersion: 0,
      publish: true,
    });
    expect(await getPublishedJoinPage()).toMatchObject({
      cycle: 2026,
      markdown: "Version one",
    });

    // A draft saved after publishing waits for the next publish.
    const draft = await saveJoinPage({
      actorId: captain.id,
      markdown: "Version two",
      expectedVersion: 1,
      publish: false,
    });
    expect(draft).toMatchObject({ ok: true, version: 2 });
    expect((await getPublishedJoinPage())?.markdown).toBe("Version one");
    expect(await getJoinPageForEditor()).toMatchObject({
      draft: "Version two",
      published: "Version one",
    });

    const actions = (await auditRows(h.db())).map((r) => r.action);
    expect(actions).toEqual([
      "camp.join_page.published",
      "camp.join_page.saved",
    ]);
  });

  it("refuses anyone but a captain, a team lead included, and writes nothing", async () => {
    await campYear(h.db(), 2026);
    const member = await makeUser(h.db());
    const lead = await makeUser(h.db());
    await assignTeam({ userId: lead.id, team: "kitchen" });
    await setLead({ userId: lead.id, team: "kitchen", isLead: true });
    // Setting the lead wrote its own audit row; count from here.
    const before = (await auditRows(h.db())).length;

    for (const actorId of [member.id, lead.id, "not-a-uuid"]) {
      expect(
        await saveJoinPage({
          actorId,
          markdown: "Hi",
          expectedVersion: 0,
          publish: true,
        }),
      ).toEqual({ ok: false, error: NOT_A_JOIN_PAGE_EDITOR });
    }
    expect(await h.db().select().from(schema.joinPages)).toEqual([]);
    expect((await auditRows(h.db())).length).toBe(before);
  });

  it("a rank read inside the write: a captain demoted after opening the editor is refused", async () => {
    await campYear(h.db(), 2026);
    const captain = await makeUser(h.db(), { rank: "captain" });
    await h
      .db()
      .update(schema.users)
      .set({ rank: "member" })
      .where(eq(schema.users.id, captain.id));
    expect(
      await saveJoinPage({
        actorId: captain.id,
        markdown: "Hi",
        expectedVersion: 0,
        publish: false,
      }),
    ).toEqual({ ok: false, error: NOT_A_JOIN_PAGE_EDITOR });
  });

  it("a stale save loses: two captains cannot overwrite each other", async () => {
    await campYear(h.db(), 2026);
    const a = await makeUser(h.db(), { rank: "captain" });
    const b = await makeUser(h.db(), { rank: "captain" });

    expect(
      await saveJoinPage({
        actorId: a.id,
        markdown: "A's page",
        expectedVersion: 0,
        publish: false,
      }),
    ).toMatchObject({ ok: true });
    // B opened the editor before A saved, so B still holds version 0.
    expect(
      await saveJoinPage({
        actorId: b.id,
        markdown: "B's page",
        expectedVersion: 0,
        publish: false,
      }),
    ).toEqual({ ok: false, error: JOIN_PAGE_CHANGED });
    // And once rows exist, a stale version is refused the same way.
    await saveJoinPage({
      actorId: a.id,
      markdown: "A again",
      expectedVersion: 1,
      publish: false,
    });
    expect(
      await saveJoinPage({
        actorId: b.id,
        markdown: "B's page",
        expectedVersion: 1,
        publish: false,
      }),
    ).toEqual({ ok: false, error: JOIN_PAGE_CHANGED });
    expect((await getJoinPageForEditor()).draft).toBe("A again");
  });

  it("refuses a page over the length limit", async () => {
    await campYear(h.db(), 2026);
    const captain = await makeUser(h.db(), { rank: "captain" });
    const result = await saveJoinPage({
      actorId: captain.id,
      markdown: "x".repeat(50_001),
      expectedVersion: 0,
      publish: false,
    });
    expect(result.ok).toBe(false);
    expect(await h.db().select().from(schema.joinPages)).toEqual([]);
  });

  it("taking the page down: the join site shows nothing, the draft stays, audited", async () => {
    await campYear(h.db(), 2026);
    const captain = await makeUser(h.db(), { rank: "captain" });
    await saveJoinPage({
      actorId: captain.id,
      markdown: "Live",
      expectedVersion: 0,
      publish: true,
    });

    expect(
      await unpublishJoinPage({ actorId: captain.id, expectedVersion: 1 }),
    ).toEqual({ ok: true, version: 2 });
    expect(await getPublishedJoinPage()).toBeNull();
    expect(await getJoinPageForEditor()).toMatchObject({
      draft: "Live",
      published: null,
      version: 2,
    });
    expect((await auditRows(h.db())).at(-1)).toEqual({
      action: "camp.join_page.unpublished",
      actorId: captain.id,
      metadata: { cycle: 2026, version: 2 },
    });

    // Again: nothing is published, and it says so rather than "someone changed it".
    expect(
      await unpublishJoinPage({ actorId: captain.id, expectedVersion: 2 }),
    ).toEqual({ ok: false, error: JOIN_PAGE_NOT_PUBLISHED });
    // A stale version is a lost race.
    expect(
      await unpublishJoinPage({ actorId: captain.id, expectedVersion: 1 }),
    ).toEqual({ ok: false, error: JOIN_PAGE_CHANGED });
  });

  it("only a captain takes the page down", async () => {
    await campYear(h.db(), 2026);
    const captain = await makeUser(h.db(), { rank: "captain" });
    const member = await makeUser(h.db());
    await saveJoinPage({
      actorId: captain.id,
      markdown: "Live",
      expectedVersion: 0,
      publish: true,
    });
    expect(
      await unpublishJoinPage({ actorId: member.id, expectedVersion: 1 }),
    ).toEqual({ ok: false, error: NOT_A_JOIN_PAGE_EDITOR });
    expect((await getPublishedJoinPage())?.markdown).toBe("Live");
  });

  it("a new year: the join site shows nothing, and the editor starts from last year's text", async () => {
    await campYear(h.db(), 2026);
    const captain = await makeUser(h.db(), { rank: "captain" });
    await saveJoinPage({
      actorId: captain.id,
      markdown: "The 2026 page",
      expectedVersion: 0,
      publish: true,
    });

    await campYear(h.db(), 2027, [2026]);
    // Last year's dates and fee would be wrong, so it is not shown.
    expect(await getPublishedJoinPage()).toBeNull();
    expect(await getJoinPageForEditor()).toMatchObject({
      cycle: 2027,
      draft: "The 2026 page",
      published: null,
      version: 0,
      startedFrom: 2026,
    });

    // The first save makes the new year's own row; 2026's is untouched.
    expect(
      await saveJoinPage({
        actorId: captain.id,
        markdown: "The 2027 page",
        expectedVersion: 0,
        publish: true,
      }),
    ).toEqual({ ok: true, version: 1, cycle: 2027 });
    expect((await getPublishedJoinPage())?.markdown).toBe("The 2027 page");
    const rows = await h
      .db()
      .select({
        cycle: schema.joinPages.cycle,
        published: schema.joinPages.published,
      })
      .from(schema.joinPages)
      .orderBy(schema.joinPages.cycle);
    expect(rows).toEqual([
      { cycle: 2026, published: "The 2026 page" },
      { cycle: 2027, published: "The 2027 page" },
    ]);
  });
});

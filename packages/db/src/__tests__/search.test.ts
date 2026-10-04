import { eq as sqlEq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import * as schema from "../schema";
import { DONE_VISIBLE_DAYS } from "../tasks";
import { RESERVED_DEFINITION_KEYS } from "../questionnaire-definitions";
import {
  SEARCH_ROW_KEYS,
  resolveEntries,
  searchEntries,
  type SearchEntryRow,
  type SearchKind,
  type SearchViewer,
} from "../search";
import { useTestDb } from "./_harness";
import { makeMembership, makeUser } from "./_factories";

// Ctrl+K search (#326, step 2) on a real Postgres. Each kind's WHERE copies
// the rule of the page the result opens: for each, the case the page allows
// is found and the case it refuses is not, seeded from the values the code
// writes. Plus: a row holds only the agreed columns, `%` and `_` are letters,
// every typed word must match, and Recent is looked up again through the
// same rules.

const NOW = new Date("2026-10-04T10:00:00Z");

describe("search everything", () => {
  const h = useTestDb();

  function viewer(
    userId: string,
    over: Partial<SearchViewer> = {},
  ): SearchViewer {
    return {
      userId,
      rank: "camp_member",
      runsLounge: false,
      reviewsRecipes: false,
      ...over,
    };
  }

  async function find(v: SearchViewer, query: string) {
    return searchEntries({ viewer: v, query, now: NOW });
  }

  const titles = (rows: SearchEntryRow[], kind: SearchKind) =>
    rows.filter((r) => r.kind === kind).map((r) => r.title);

  async function recipe(input: {
    title: string;
    submitterId: string | null;
    accepted: boolean;
    plates?: number;
  }) {
    const db = h.db();
    const [r] = await db
      .insert(schema.recipes)
      .values({
        title: input.title,
        submitterId: input.submitterId,
        source: "text",
        status: input.accepted ? "accepted" : "suggested",
      })
      .returning();
    if (input.accepted) {
      const [v] = await db
        .insert(schema.recipeVersions)
        .values({
          recipeId: r!.id,
          version: 1,
          servingsBasis: input.plates ?? 40,
        })
        .returning();
      await db
        .update(schema.recipes)
        .set({ acceptedVersionId: v!.id })
        .where(sqlEq(schema.recipes.id, r!.id));
    }
    return r!;
  }

  it("recipes: the book for everyone; a suggestion only for its submitter and the Kitchen's reviewers", async () => {
    const member = await makeUser(h.db());
    const submitter = await makeUser(h.db());
    await recipe({
      title: "Potjiekos",
      submitterId: submitter.id,
      accepted: true,
      plates: 40,
    });
    await recipe({
      title: "Pot bread",
      submitterId: submitter.id,
      accepted: false,
    });

    const asMember = await find(viewer(member.id), "pot");
    expect(titles(asMember, "recipe")).toEqual(["Potjiekos"]);
    expect(asMember.find((r) => r.kind === "recipe")!.num).toBe(40);

    const asSubmitter = await find(viewer(submitter.id), "pot");
    expect(titles(asSubmitter, "recipe").sort()).toEqual([
      "Pot bread",
      "Potjiekos",
    ]);
    const own = asSubmitter.find((r) => r.title === "Pot bread")!;
    expect(own.flag).toBe(true);
    expect(own.label).toBe("suggested");

    const asReviewer = await find(
      viewer(member.id, { reviewsRecipes: true }),
      "pot",
    );
    expect(titles(asReviewer, "recipe")).toContain("Pot bread");
  });

  it("chapters: the published version only, never a draft or one taken off the guide", async () => {
    const member = await makeUser(h.db());
    const db = h.db();
    const [live] = await db
      .insert(schema.documents)
      .values({
        title: "Potable water (draft title)",
        slug: "potable-water",
        category: "arrival",
        kind: "chapter",
        published: true,
        publishedVersion: 1,
      })
      .returning();
    await db.insert(schema.documentVersions).values({
      documentId: live!.id,
      version: 1,
      title: "Potable water",
      category: "arrival",
      kind: "chapter",
      markdown: "",
    });
    await db.insert(schema.documents).values({
      title: "Pots and pans",
      slug: "pots",
      category: "kitchen",
      kind: "chapter",
      published: false,
    });
    // Taken off the guide: it keeps its published version, and its page
    // still refuses it.
    const [off] = await db
      .insert(schema.documents)
      .values({
        title: "Pot plants",
        slug: "pot-plants",
        category: "kitchen",
        kind: "chapter",
        published: false,
        publishedVersion: 1,
      })
      .returning();
    await db.insert(schema.documentVersions).values({
      documentId: off!.id,
      version: 1,
      title: "Pot plants",
      category: "kitchen",
      kind: "chapter",
      markdown: "",
    });

    const rows = await find(viewer(member.id), "pot");
    expect(titles(rows, "chapter")).toEqual(["Potable water"]);
    const row = rows.find((r) => r.kind === "chapter")!;
    expect(row.ref).toBe("potable-water");
    expect(row.label).toBe("chapter");
    expect(row.extra).toBe("arrival");
  });

  it("meetings: any member finds any meeting, with its date", async () => {
    const member = await makeUser(h.db());
    const held = new Date("2026-09-12T16:00:00Z");
    await h.db().insert(schema.meetingNotes).values({
      cycle: 1,
      team: "kitchen",
      title: "Kitchen planning: pots",
      heldAt: held,
    });
    const rows = await find(viewer(member.id), "pots");
    const row = rows.find((r) => r.kind === "meeting")!;
    expect(row.title).toBe("Kitchen planning: pots");
    expect(row.team).toBe("kitchen");
    expect(row.at).toBe(held.getTime());
  });

  it("tasks: what the board shows (open, doing, done lately), never a cancelled or long-done task", async () => {
    const member = await makeUser(h.db());
    const recently = new Date(NOW.getTime() - 86_400_000);
    const longAgo = new Date(
      NOW.getTime() - (DONE_VISIBLE_DAYS + 1) * 86_400_000,
    );
    await h
      .db()
      .insert(schema.tasks)
      .values([
        { title: "Pot one, open", status: "open" },
        { title: "Pot two, doing", status: "in_progress" },
        { title: "Pot three, done", status: "done", completedAt: recently },
        {
          title: "Pot four, done long ago",
          status: "done",
          completedAt: longAgo,
        },
        { title: "Pot five, cancelled", status: "cancelled" },
      ]);
    const rows = await find(viewer(member.id), "pot");
    expect(titles(rows, "task").sort()).toEqual([
      "Pot one, open",
      "Pot three, done",
      "Pot two, doing",
    ]);
  });

  it("inventory: archived items stay out", async () => {
    const member = await makeUser(h.db());
    await h
      .db()
      .insert(schema.inventoryItems)
      .values([
        { name: "Potjie pot no. 3", team: "kitchen", quantity: 1 },
        {
          name: "Potjie pot no. 1",
          team: "kitchen",
          quantity: 1,
          archivedAt: NOW,
        },
      ]);
    const rows = await find(viewer(member.id), "potjie");
    expect(titles(rows, "inventory")).toEqual(["Potjie pot no. 3"]);
    expect(rows.find((r) => r.kind === "inventory")!.num).toBe(1);
  });

  it("shifts: this year's only", async () => {
    const member = await makeUser(h.db());
    const shift = {
      team: "kitchen" as const,
      startMinute: 19 * 60,
      durationMinutes: 120,
      places: 2,
    };
    await h
      .db()
      .insert(schema.shiftTypes)
      .values([
        // currentCycleNumber() is 1 on a camp with no years named.
        { ...shift, cycle: 1, name: "Pot wash, evening" },
        { ...shift, cycle: 2025, name: "Pot wash, last year" },
      ]);
    const rows = await find(viewer(member.id), "pot wash");
    expect(titles(rows, "shift")).toEqual(["Pot wash, evening"]);
    const row = rows.find((r) => r.kind === "shift")!;
    expect([row.num, row.num2]).toEqual([19 * 60, 120]);
  });

  it("gear: this year's, not archived", async () => {
    const member = await makeUser(h.db());
    const item = { campPriceCents: 10_000, campStockCount: 2 };
    await h
      .db()
      .insert(schema.rentalItems)
      .values([
        { ...item, cycle: 1, name: "Pop-up tent", isTent: true, sleeps: 2 },
        { ...item, cycle: 1, name: "Pop-up chair", archivedAt: NOW },
        { ...item, cycle: 2025, name: "Pop-up stool" },
      ]);
    const rows = await find(viewer(member.id), "pop-up");
    expect(titles(rows, "gear")).toEqual(["Pop-up tent"]);
    expect(rows.find((r) => r.kind === "gear")!.flag).toBe(true);
  });

  it("lounge: the programme and your own offers; everyone's only for someone who runs the lounge", async () => {
    const member = await makeUser(h.db());
    const host = await makeUser(h.db());
    const db = h.db();
    const offer = {
      cycle: 1,
      kind: "activity" as const,
      durationMinutes: 60,
    };
    const [placed] = await db
      .insert(schema.loungeOffers)
      .values({
        ...offer,
        hostId: host.id,
        title: "Potluck poetry",
        status: "accepted",
      })
      .returning();
    await db.insert(schema.loungeSlots).values({
      cycle: 1,
      offerId: placed!.id,
      day: 3,
      startMinute: 17 * 60,
    });
    await db.insert(schema.loungeOffers).values([
      // Accepted but not placed: not on the programme yet.
      { ...offer, hostId: host.id, title: "Pottery hour", status: "accepted" },
      { ...offer, hostId: host.id, title: "Pot noodle DJ", status: "offered" },
      { ...offer, hostId: member.id, title: "Pots of tea", status: "offered" },
    ]);

    const asMember = await find(viewer(member.id), "pot");
    expect(titles(asMember, "lounge").sort()).toEqual([
      "Potluck poetry",
      "Pots of tea",
    ]);
    const onProgramme = asMember.find((r) => r.title === "Potluck poetry")!;
    expect([onProgramme.num, onProgramme.num2]).toEqual([3, 17 * 60]);
    expect(asMember.find((r) => r.title === "Pots of tea")!.flag).toBe(true);

    const asRunner = await find(
      viewer(member.id, { rank: "team_lead", runsLounge: true }),
      "pot",
    );
    expect(titles(asRunner, "lounge").sort()).toEqual([
      "Pot noodle DJ",
      "Potluck poetry",
      "Pots of tea",
      "Pottery hour",
    ]);
  });

  it("people: approved members by display name; no applicant, Lost Cat or system user", async () => {
    const db = h.db();
    const member = await makeUser(db, { displayName: "Viewer" });
    const spotty = await makeUser(db, { displayName: "Spotty van Wyk" });
    await makeMembership(db, {
      userId: spotty.id,
      team: "kitchen",
      isLead: true,
    });
    await makeMembership(db, { userId: spotty.id, team: "finance" });
    await makeUser(db, {
      displayName: "Spotty Pending",
      approvalStatus: "pending",
    });
    await makeUser(db, {
      displayName: "Spotty Rejected",
      approvalStatus: "rejected",
    });
    await makeUser(db, { displayName: "Spotty Lost", sanitised: true });
    await makeUser(db, { displayName: "Spotty Bot", isSystem: true });

    const rows = await find(viewer(member.id), "spotty");
    expect(titles(rows, "person")).toEqual(["Spotty van Wyk"]);
    const row = rows.find((r) => r.kind === "person")!;
    // In the teams' own order (the enum's), as the roster lists them.
    expect(row.extra).toBe("kitchen,finance");
    expect(row.flag).toBe(true);
    expect(row.label).toBe("member");
  });

  it("announcements: only one delivered to you, published, as an announcement", async () => {
    const db = h.db();
    const member = await makeUser(db);
    const other = await makeUser(db);
    const sent = new Date("2026-09-28T08:00:00Z");
    const [mine, notMine, message] = await db
      .insert(schema.broadcasts)
      .values([
        {
          kind: "announcement",
          scope: "everyone",
          title: "Bring a pot (now)",
          body: "b",
          publishedAt: sent,
        },
        {
          kind: "announcement",
          scope: "team",
          team: "kitchen",
          title: "Pot rota",
          body: "b",
          publishedAt: sent,
        },
        {
          kind: "team_message",
          scope: "everyone",
          title: "Pot message",
          body: "b",
          publishedAt: sent,
        },
      ])
      .returning();
    await db.insert(schema.notificationDeliveries).values([
      {
        broadcastId: mine!.id,
        userId: member.id,
        title: "Bring a pot",
        body: "b",
        channel: "both",
      },
      {
        broadcastId: notMine!.id,
        userId: other.id,
        title: "Pot rota",
        body: "b",
        channel: "both",
      },
      {
        broadcastId: message!.id,
        userId: member.id,
        kind: "team_message",
        title: "Pot message",
        body: "b",
        channel: "both",
      },
    ]);
    const rows = await find(viewer(member.id), "pot");
    // The copy delivered to the member, not the broadcast's current title.
    expect(titles(rows, "announcement")).toEqual(["Bring a pot"]);
    const row = rows.find((r) => r.kind === "announcement")!;
    expect(row.id).toBe(mine!.id);
    expect(row.label).toBe("everyone");
    expect(row.at).toBe(sent.getTime());
  });

  it("questionnaires: none for a member; a lead's own; every one for a captain, never a coded key", async () => {
    const db = h.db();
    const member = await makeUser(db);
    const lead = await makeUser(db);
    const reserved = [...RESERVED_DEFINITION_KEYS][0]!;
    await db.insert(schema.questionnaireDefinitions).values([
      {
        key: "pot-survey",
        title: "Pot survey",
        definition: {} as never,
        createdBy: lead.id,
      },
      {
        key: "pot-census",
        title: "Pot census",
        definition: {} as never,
        createdBy: member.id,
      },
      { key: reserved, title: "Pot profile", definition: {} as never },
    ]);
    expect(
      titles(await find(viewer(member.id), "pot"), "questionnaire"),
    ).toEqual([]);
    expect(
      titles(
        await find(viewer(lead.id, { rank: "team_lead" }), "pot"),
        "questionnaire",
      ),
    ).toEqual(["Pot survey"]);
    expect(
      titles(
        await find(viewer(lead.id, { rank: "captain" }), "pot"),
        "questionnaire",
      ).sort(),
    ).toEqual(["Pot census", "Pot survey"]);
  });

  it("a row holds exactly the agreed columns", async () => {
    const member = await makeUser(h.db(), { displayName: "Column Check" });
    const [row] = await find(viewer(member.id), "column check");
    expect(Object.keys(row!).sort()).toEqual([...SEARCH_ROW_KEYS].sort());
  });

  it("needs every word, treats % and _ as letters, and ranks where the word falls", async () => {
    const member = await makeUser(h.db());
    await h
      .db()
      .insert(schema.tasks)
      .values([
        { title: "Fuel cable reel" },
        { title: "Fuel can" },
        { title: "100% cotton rope" },
        { title: "100 cotton rope" },
        { title: "a_b label" },
        { title: "axb label" },
        { title: "Buy more fuel" },
      ]);
    const v = viewer(member.id);
    expect(titles(await find(v, "fuel cab"), "task")).toEqual([
      "Fuel cable reel",
    ]);
    expect(titles(await find(v, "100%"), "task")).toEqual(["100% cotton rope"]);
    expect(titles(await find(v, "a_b"), "task")).toEqual(["a_b label"]);
    // Where the word falls first, then the shorter title.
    expect(titles(await find(v, "fuel"), "task")).toEqual([
      "Fuel can",
      "Fuel cable reel",
      "Buy more fuel",
    ]);
  });

  it("caps each kind, so one kind cannot crowd out the rest", async () => {
    const member = await makeUser(h.db());
    await h
      .db()
      .insert(schema.tasks)
      .values(Array.from({ length: 12 }, (_, i) => ({ title: `Pot ${i}` })));
    const rows = await searchEntries({
      viewer: viewer(member.id),
      query: "pot",
      limitPerKind: 5,
      now: NOW,
    });
    expect(titles(rows, "task")).toHaveLength(5);
  });

  it("looks Recent up again through the same rules, dropping what you may no longer open", async () => {
    const db = h.db();
    const member = await makeUser(db);
    const submitter = await makeUser(db);
    const inBook = await recipe({
      title: "Chakalaka",
      submitterId: submitter.id,
      accepted: true,
    });
    const suggestion = await recipe({
      title: "Spotted dick",
      submitterId: submitter.id,
      accepted: false,
    });
    const rows = await resolveEntries({
      viewer: viewer(member.id),
      refs: [
        { kind: "recipe", id: inBook.id },
        { kind: "recipe", id: suggestion.id },
        { kind: "meeting", id: "not-a-real-id" },
      ],
      now: NOW,
    });
    expect(rows.map((r) => r.title)).toEqual(["Chakalaka"]);
  });
});

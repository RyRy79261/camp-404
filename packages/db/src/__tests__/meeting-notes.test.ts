import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import * as schema from "../schema";
import {
  ASSIGNEE_NOT_A_MEMBER,
  ATTENDEE_NOT_A_MEMBER,
  EVENT_NOT_ON_CALENDAR,
  NOTE_EDITED,
  NOT_A_CAMP_NOTE_WRITER,
  NOT_A_NOTE_WRITER,
  ON_THE_BOARD,
  createMeetingNote,
  editMeetingNote,
  getMeetingNote,
  listMeetingNotes,
  type MeetingActionItemWrite,
  type MeetingNoteFields,
} from "../meeting-notes";
import { NOT_A_MEMBER, TEAM_NOT_ACTIVE } from "../tasks";
import { useTestDb } from "./_harness";
import { makeMembership, makeUser } from "./_factories";

// Meeting notes (#268) on a real Postgres (PGlite). What matters: who may
// write which team's notes (the team's members this year and captains; a
// whole-camp note is a captain's); that an edit is a compare-and-set; and that
// every action item IS a task (owner, 2026-10-11): the save puts each on the
// board, with its person and team, in the same transaction, and once there its
// words are the board's.

const HELD = new Date("2026-10-02T16:30:00Z");

function fields(overrides: Partial<MeetingNoteFields> = {}): MeetingNoteFields {
  return {
    title: "Kitchen kickoff",
    heldAt: HELD,
    calendarEvent: null,
    agenda: "1. Menu\n2. Gas",
    notes: "",
    attendeeIds: [],
    decisions: [],
    actionItems: [],
    activeTeams: ["kitchen", "finance", "structures"],
    ...overrides,
  };
}

function item(
  text: string,
  extra: Partial<MeetingActionItemWrite> = {},
): MeetingActionItemWrite {
  return {
    id: null,
    text,
    assigneeId: null,
    team: "kitchen",
    dueOn: null,
    ...extra,
  };
}

describe("meeting notes", () => {
  const h = useTestDb();

  async function people() {
    const db = h.db();
    const captain = await makeUser(db, { rank: "captain" });
    const lead = await makeUser(db, { displayName: "Kitchen Lead" });
    await makeMembership(db, {
      userId: lead.id,
      team: "kitchen",
      isLead: true,
    });
    const member = await makeUser(db, { displayName: "Kitchen Crew" });
    await makeMembership(db, { userId: member.id, team: "kitchen" });
    const outsider = await makeUser(db, { displayName: "Finance Crew" });
    await makeMembership(db, { userId: outsider.id, team: "finance" });
    return { captain, lead, member, outsider };
  }

  async function noteRows() {
    return h.db().select().from(schema.meetingNotes);
  }

  describe("createMeetingNote", () => {
    it("lets a member of the team write its notes, with the whole record", async () => {
      const { member, lead } = await people();
      const made = await createMeetingNote({
        actorId: member.id,
        team: "kitchen",
        ...fields({
          attendeeIds: [member.id, lead.id],
          decisions: ["Dinner at 19:00", "No glass in the kitchen"],
          actionItems: [
            item("Buy the gas", { assigneeId: lead.id, dueOn: "2026-10-09" }),
          ],
        }),
      });
      expect(made.ok).toBe(true);
      if (!made.ok) return;

      const note = await getMeetingNote(made.id);
      expect(note).toMatchObject({
        team: "kitchen",
        title: "Kitchen kickoff",
        heldAt: HELD,
        agenda: "1. Menu\n2. Gas",
        cycle: 1,
        version: 1,
      });
      expect(note?.attendees.map((a) => a.displayName)).toEqual([
        "Kitchen Crew",
        "Kitchen Lead",
      ]);
      expect(note?.decisions.map((d) => d.text)).toEqual([
        "Dinner at 19:00",
        "No glass in the kitchen",
      ]);
      expect(note?.actionItems).toEqual([
        expect.objectContaining({
          text: "Buy the gas",
          assigneeName: "Kitchen Lead",
          team: "kitchen",
          dueOn: "2026-10-09",
          task: { id: expect.any(String), status: "open" },
        }),
      ]);
    });

    it("refuses someone on another team, and a member from another year", async () => {
      const db = h.db();
      const { outsider } = await people();
      const lastYear = await makeUser(db);
      await makeMembership(db, {
        userId: lastYear.id,
        team: "kitchen",
        cycle: 0,
      });
      expect(
        await createMeetingNote({
          actorId: outsider.id,
          team: "kitchen",
          ...fields(),
        }),
      ).toEqual({ ok: false, error: NOT_A_NOTE_WRITER });
      expect(
        await createMeetingNote({
          actorId: lastYear.id,
          team: "kitchen",
          ...fields(),
        }),
      ).toEqual({ ok: false, error: NOT_A_NOTE_WRITER });
      expect(await noteRows()).toHaveLength(0);
    });

    it("keeps whole-camp notes to captains, and lets a captain write any team's", async () => {
      const { captain, lead } = await people();
      expect(
        await createMeetingNote({ actorId: lead.id, team: null, ...fields() }),
      ).toEqual({ ok: false, error: NOT_A_CAMP_NOTE_WRITER });
      const camp = await createMeetingNote({
        actorId: captain.id,
        team: null,
        ...fields({ title: "Final camp meeting" }),
      });
      const finance = await createMeetingNote({
        actorId: captain.id,
        team: "finance",
        ...fields({ title: "Budget call" }),
      });
      expect(camp.ok && finance.ok).toBe(true);
    });

    it("refuses a member who is not approved, even on the team", async () => {
      const db = h.db();
      await people();
      const pending = await makeUser(db, { approvalStatus: "pending" });
      await makeMembership(db, { userId: pending.id, team: "kitchen" });
      expect(
        await createMeetingNote({
          actorId: pending.id,
          team: "kitchen",
          ...fields(),
        }),
      ).toEqual({ ok: false, error: NOT_A_NOTE_WRITER });
    });

    it("refuses attendees and people responsible who aren't approved members", async () => {
      const db = h.db();
      const { member } = await people();
      const pending = await makeUser(db, { approvalStatus: "pending" });
      expect(
        await createMeetingNote({
          actorId: member.id,
          team: "kitchen",
          ...fields({ attendeeIds: [member.id, pending.id] }),
        }),
      ).toEqual({ ok: false, error: ATTENDEE_NOT_A_MEMBER });
      expect(
        await createMeetingNote({
          actorId: member.id,
          team: "kitchen",
          ...fields({
            actionItems: [item("X", { assigneeId: pending.id })],
          }),
        }),
      ).toEqual({ ok: false, error: ASSIGNEE_NOT_A_MEMBER });
      expect(await noteRows()).toHaveLength(0);
    });

    it("keeps a calendar event only when the calendar named it", async () => {
      const { member } = await people();
      expect(
        await createMeetingNote({
          actorId: member.id,
          team: "kitchen",
          ...fields({ calendarEvent: { id: "evt-1", title: null } }),
        }),
      ).toEqual({ ok: false, error: EVENT_NOT_ON_CALENDAR });
      const made = await createMeetingNote({
        actorId: member.id,
        team: "kitchen",
        ...fields({ calendarEvent: { id: "evt-1", title: "Kitchen kickoff" } }),
      });
      if (!made.ok) throw new Error(made.error);
      expect(await getMeetingNote(made.id)).toMatchObject({
        calendarEventId: "evt-1",
        calendarEventTitle: "Kitchen kickoff",
      });
    });
  });

  describe("listMeetingNotes", () => {
    it("lists newest meeting first, by team or the whole camp's", async () => {
      const { captain } = await people();
      const at = (day: string) => new Date(`${day}T10:00:00Z`);
      for (const [team, title, day] of [
        ["kitchen", "Older", "2026-09-01"],
        ["kitchen", "Newer", "2026-10-01"],
        [null, "Camp", "2026-09-15"],
      ] as const) {
        await createMeetingNote({
          actorId: captain.id,
          team,
          ...fields({ title, heldAt: at(day), decisions: ["One"] }),
        });
      }
      expect(
        (await listMeetingNotes({ team: "kitchen" })).map((n) => n.title),
      ).toEqual(["Newer", "Older"]);
      expect(
        (await listMeetingNotes({ team: "camp" })).map((n) => n.title),
      ).toEqual(["Camp"]);
      const all = await listMeetingNotes();
      expect(all.map((n) => n.title)).toEqual(["Newer", "Camp", "Older"]);
      expect(all[0]).toMatchObject({ decisions: 1, actionItems: 0 });
      expect(await listMeetingNotes({ limit: 1 })).toHaveLength(1);
    });

    it("says how many were there and what was decided first", async () => {
      const { captain, lead, member } = await people();
      await createMeetingNote({
        actorId: captain.id,
        team: "kitchen",
        ...fields({
          attendeeIds: [lead.id, member.id],
          decisions: ["Dinner is at 19:00", "Two vegan options"],
        }),
      });
      await createMeetingNote({
        actorId: captain.id,
        team: "kitchen",
        ...fields({ title: "Quiet", heldAt: new Date("2026-09-01T10:00:00Z") }),
      });
      const [full, quiet] = await listMeetingNotes({ team: "kitchen" });
      expect(full).toMatchObject({
        attendees: 2,
        firstDecision: "Dinner is at 19:00",
      });
      expect(quiet).toMatchObject({ attendees: 0, firstDecision: null });
    });
  });

  describe("editMeetingNote", () => {
    async function noteBy(
      actorId: string,
      extra: Partial<MeetingNoteFields> = {},
    ) {
      const made = await createMeetingNote({
        actorId,
        team: "kitchen",
        ...fields(extra),
      });
      if (!made.ok) throw new Error(made.error);
      return made.id;
    }

    it("saves an edit and bumps the version; a stale version is told", async () => {
      const { member, lead } = await people();
      const id = await noteBy(member.id);
      expect(
        await editMeetingNote({
          actorId: lead.id,
          noteId: id,
          version: 1,
          ...fields({ title: "Kickoff, renamed", notes: "We met." }),
        }),
        // The version this save made, from its own UPDATE.
      ).toEqual({ ok: true, version: 2 });
      expect(
        await editMeetingNote({
          actorId: member.id,
          noteId: id,
          version: 1,
          ...fields({ title: "Lost" }),
        }),
      ).toEqual({ ok: false, error: NOTE_EDITED });
      expect(await getMeetingNote(id)).toMatchObject({
        title: "Kickoff, renamed",
        notes: "We met.",
        version: 2,
      });
    });

    it("refuses someone off the team, whatever the screen offered", async () => {
      const { member, outsider } = await people();
      const id = await noteBy(member.id);
      expect(
        await editMeetingNote({
          actorId: outsider.id,
          noteId: id,
          version: 1,
          ...fields({ title: "Hijacked" }),
        }),
      ).toEqual({ ok: false, error: NOT_A_NOTE_WRITER });
      expect((await getMeetingNote(id))?.title).toBe("Kitchen kickoff");
    });

    it("refuses new words on an item already on the board, and keeps it when left out", async () => {
      const { member } = await people();
      const id = await noteBy(member.id, {
        actionItems: [item("Buy the gas"), item("Clean the pots")],
      });
      const before = await getMeetingNote(id);
      const [gas, pots] = before!.actionItems;
      expect(gas?.task).not.toBeNull();

      expect(
        await editMeetingNote({
          actorId: member.id,
          noteId: id,
          version: 1,
          ...fields({
            actionItems: [{ ...item("Changed"), id: gas!.id }],
          }),
        }),
      ).toEqual({ ok: false, error: ON_THE_BOARD });
      expect(await getMeetingNote(id)).toMatchObject({ version: 1 });

      // Sent back as read, it moves; a new one goes on the board too; one
      // already on the board that is left out stays, at the end.
      expect(
        await editMeetingNote({
          actorId: member.id,
          noteId: id,
          version: 1,
          ...fields({
            actionItems: [
              { ...item("Book the truck"), team: "structures" },
              { ...item(gas!.text), id: gas!.id },
            ],
          }),
        }),
      ).toEqual({ ok: true, version: 2 });
      const after = await getMeetingNote(id);
      expect(after?.actionItems.map((i) => i.text)).toEqual([
        "Book the truck",
        "Buy the gas",
        "Clean the pots",
      ]);
      expect(after?.actionItems.map((i) => i.id)).toContain(pots!.id);
      expect(after?.actionItems[0]).toMatchObject({
        team: "structures",
        task: { status: "open" },
      });
      expect(await h.db().select().from(schema.tasks)).toHaveLength(3);
    });

    it("reads an item on the board from its task, as the board has changed it", async () => {
      const db = h.db();
      const { member, lead } = await people();
      const id = await noteBy(member.id, { actionItems: [item("Buy gas")] });
      const [gas] = (await getMeetingNote(id))!.actionItems;
      await db
        .update(schema.tasks)
        .set({
          title: "Buy two gas bottles",
          assigneeId: lead.id,
          team: "finance",
          status: "in_progress",
          dueAt: new Date("2026-10-20T00:00:00+02:00"),
        })
        .where(eq(schema.tasks.id, gas!.task!.id));
      const read = (await getMeetingNote(id))!.actionItems[0];
      expect(read).toMatchObject({
        text: "Buy two gas bottles",
        assigneeName: "Kitchen Lead",
        team: "finance",
        dueOn: "2026-10-20",
        task: { status: "in_progress" },
      });
      // The editor sends back what it read, and the save goes through.
      expect(
        await editMeetingNote({
          actorId: member.id,
          noteId: id,
          version: 1,
          ...fields({ actionItems: [{ ...item(read!.text), id: read!.id }] }),
        }),
      ).toEqual({ ok: true, version: 2 });
    });

    it("leaves an old item sent back unchanged off the board, even on a past year's note", async () => {
      const db = h.db();
      const { member } = await people();
      const id = await noteBy(member.id);
      await db
        .update(schema.meetingNotes)
        .set({ cycle: 0 })
        .where(eq(schema.meetingNotes.id, id));
      const [old] = await db
        .insert(schema.meetingNoteActionItems)
        .values({
          noteId: id,
          position: 0,
          text: "Old item",
          dueOn: "2025-04-20",
        })
        .returning();
      const saved = await editMeetingNote({
        actorId: member.id,
        noteId: id,
        version: 1,
        ...fields({
          notes: "Fixed a typo.",
          actionItems: [
            { ...item("Old item"), id: old!.id, dueOn: "2025-04-20" },
          ],
        }),
      });
      expect(saved).toEqual({ ok: true, version: 2 });
      expect(await db.select().from(schema.tasks)).toHaveLength(0);
      const [kept] = await db.select().from(schema.meetingNoteActionItems);
      expect(kept).toMatchObject({ id: old!.id, taskId: null });
    });

    it("saves a note whose unchanged old item names someone who has left", async () => {
      const db = h.db();
      const { member } = await people();
      const id = await noteBy(member.id);
      const gone = await makeUser(db, { approvalStatus: "pending" });
      const [old] = await db
        .insert(schema.meetingNoteActionItems)
        .values({
          noteId: id,
          position: 0,
          text: "Old item",
          assigneeId: gone.id,
        })
        .returning();
      expect(
        await editMeetingNote({
          actorId: member.id,
          noteId: id,
          version: 1,
          ...fields({
            agenda: "1. Menu",
            actionItems: [
              { ...item("Old item"), id: old!.id, assigneeId: gone.id },
            ],
          }),
        }),
      ).toEqual({ ok: true, version: 2 });
      expect(await db.select().from(schema.tasks)).toHaveLength(0);
    });

    it("saves a switched-off team's note with its unchanged old item", async () => {
      const db = h.db();
      const { captain } = await people();
      const made = await createMeetingNote({
        actorId: captain.id,
        team: "water",
        ...fields(),
      });
      if (!made.ok) throw new Error(made.error);
      const [old] = await db
        .insert(schema.meetingNoteActionItems)
        .values({ noteId: made.id, position: 0, text: "Old item" })
        .returning();
      expect(
        await editMeetingNote({
          actorId: captain.id,
          noteId: made.id,
          version: 1,
          ...fields({
            notes: "Met.",
            actionItems: [{ ...item("Old item"), id: old!.id, team: "water" }],
          }),
        }),
      ).toEqual({ ok: true, version: 2 });
      expect(await db.select().from(schema.tasks)).toHaveLength(0);
    });

    it("puts an old item on the board once it is changed", async () => {
      const db = h.db();
      const { member } = await people();
      const id = await noteBy(member.id);
      const [old] = await db
        .insert(schema.meetingNoteActionItems)
        .values({ noteId: id, position: 0, text: "Old item" })
        .returning();
      expect((await getMeetingNote(id))!.actionItems[0]).toMatchObject({
        team: "kitchen",
        task: null,
      });
      await editMeetingNote({
        actorId: member.id,
        noteId: id,
        version: 1,
        ...fields({
          actionItems: [{ ...item("Old item"), id: old!.id, team: null }],
        }),
      });
      const [task] = await db.select().from(schema.tasks);
      expect(task).toMatchObject({ title: "Old item", team: null });
      const [linked] = await db.select().from(schema.meetingNoteActionItems);
      expect(linked?.taskId).toBe(task?.id);
    });

    it("leaves the action items as they are when the save sends none (the connector's)", async () => {
      const { member } = await people();
      const id = await noteBy(member.id, { actionItems: [item("Buy gas")] });
      expect(
        await editMeetingNote({
          actorId: member.id,
          noteId: id,
          version: 1,
          ...fields({ notes: "Met.", actionItems: undefined }),
        }),
      ).toEqual({ ok: true, version: 2 });
      expect(
        (await getMeetingNote(id))?.actionItems.map((i) => i.text),
      ).toEqual(["Buy gas"]);
    });
  });

  describe("action items are tasks", () => {
    it("puts each on the board in the save's transaction, with its person, team and deadline", async () => {
      const { member, lead } = await people();
      // A plain member of the team: the note's rule, not the board's.
      const made = await createMeetingNote({
        actorId: member.id,
        team: "kitchen",
        ...fields({
          actionItems: [
            item("Buy the gas", { assigneeId: lead.id, dueOn: "2026-10-09" }),
            item("Ask Finance for the float", { team: "finance" }),
            item("Tell everyone", { team: null }),
          ],
        }),
      });
      if (!made.ok) throw new Error(made.error);
      const tasks = await h
        .db()
        .select()
        .from(schema.tasks)
        .orderBy(schema.tasks.createdAt);
      expect(tasks).toHaveLength(3);
      expect(tasks.find((t) => t.title === "Buy the gas")).toMatchObject({
        team: "kitchen",
        assigneeId: lead.id,
        createdByUserId: member.id,
        status: "open",
        dueAt: new Date("2026-10-09T00:00:00+02:00"),
        description: "From the meeting “Kitchen kickoff” on 2 Oct 2026.",
      });
      expect(
        tasks.find((t) => t.title === "Ask Finance for the float")?.team,
      ).toBe("finance");
      expect(tasks.find((t) => t.title === "Tell everyone")?.team).toBeNull();
      const note = await getMeetingNote(made.id);
      expect(note?.actionItems.every((i) => i.task !== null)).toBe(true);
    });

    it("refuses a switched-off team and keeps nothing of the save", async () => {
      const { member } = await people();
      expect(
        await createMeetingNote({
          actorId: member.id,
          team: "kitchen",
          ...fields({
            decisions: ["Kept?"],
            actionItems: [item("Fine"), item("Archived", { team: "water" })],
          }),
        }),
      ).toEqual({ ok: false, error: TEAM_NOT_ACTIVE });
      expect(await noteRows()).toHaveLength(0);
      expect(await h.db().select().from(schema.tasks)).toHaveLength(0);
    });

    it("refuses a person who has left the approved list, on an item going on the board", async () => {
      const db = h.db();
      const { member } = await people();
      const made = await createMeetingNote({
        actorId: member.id,
        team: "kitchen",
        ...fields(),
      });
      if (!made.ok) throw new Error(made.error);
      const [old] = await db
        .insert(schema.meetingNoteActionItems)
        .values({
          noteId: made.id,
          position: 0,
          text: "Old item",
          assigneeId: member.id,
        })
        .returning();
      const gone = await makeUser(db, { approvalStatus: "pending" });
      await db
        .update(schema.meetingNoteActionItems)
        .set({ assigneeId: gone.id })
        .where(eq(schema.meetingNoteActionItems.id, old!.id));
      const result = await editMeetingNote({
        actorId: member.id,
        noteId: made.id,
        version: 1,
        ...fields({
          // Given a deadline, so it changed and goes on the board now.
          actionItems: [
            {
              ...item("Old item"),
              id: old!.id,
              assigneeId: gone.id,
              dueOn: "2026-10-20",
            },
          ],
        }),
      });
      expect([ASSIGNEE_NOT_A_MEMBER, NOT_A_MEMBER]).toContain(
        result.ok ? null : result.error,
      );
      expect(await db.select().from(schema.tasks)).toHaveLength(0);
    });
  });
});

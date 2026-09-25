import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import * as schema from "../schema";
import {
  ALREADY_A_TASK,
  ASSIGNEE_NOT_A_MEMBER,
  ATTENDEE_NOT_A_MEMBER,
  EVENT_NOT_ON_CALENDAR,
  NOTE_EDITED,
  NOT_A_CAMP_NOTE_WRITER,
  NOT_A_NOTE_WRITER,
  createMeetingNote,
  editMeetingNote,
  getMeetingNote,
  listMeetingNotes,
  turnActionItemIntoTask,
  type MeetingNoteFields,
} from "../meeting-notes";
import { NOT_YOUR_TEAM, NOT_A_TASK_AUTHOR, TEAM_NOT_ACTIVE } from "../tasks";
import { useTestDb } from "./_harness";
import { makeMembership, makeUser } from "./_factories";

// Meeting notes (#268) on a real Postgres (PGlite). What matters: who may
// write which team's notes (the team's members this year and captains; a
// whole-camp note is a captain's); that an edit is a compare-and-set and keeps
// action items that are already tasks; and that an action item becomes a task
// through the task board's own rule, in one transaction with its link.

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
    ...overrides,
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
            {
              id: null,
              text: "Buy the gas",
              assigneeId: lead.id,
              dueOn: "2026-10-09",
            },
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
          dueOn: "2026-10-09",
          task: null,
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
            actionItems: [
              { id: null, text: "X", assigneeId: pending.id, dueOn: null },
            ],
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
      ).toEqual({ ok: true });
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

    it("keeps an action item that is a task, and removes one left out that is not", async () => {
      const { lead, member } = await people();
      const id = await noteBy(member.id, {
        actionItems: [
          { id: null, text: "Buy the gas", assigneeId: null, dueOn: null },
          { id: null, text: "Clean the pots", assigneeId: null, dueOn: null },
        ],
      });
      const before = await getMeetingNote(id);
      const [gas, pots] = before!.actionItems;
      const task = await turnActionItemIntoTask({
        actorId: lead.id,
        itemId: gas!.id,
        activeTeams: ["kitchen"],
      });
      expect(task.ok).toBe(true);

      // The editor sends neither old item, rewrites the task's words (ignored)
      // and adds a new one.
      expect(
        await editMeetingNote({
          actorId: member.id,
          noteId: id,
          version: 1,
          ...fields({
            actionItems: [
              { id: gas!.id, text: "Changed", assigneeId: null, dueOn: null },
              {
                id: null,
                text: "Book the truck",
                assigneeId: null,
                dueOn: null,
              },
            ],
          }),
        }),
      ).toEqual({ ok: true });
      const after = await getMeetingNote(id);
      expect(after?.actionItems.map((i) => i.text)).toEqual([
        "Buy the gas",
        "Book the truck",
      ]);
      expect(after?.actionItems.map((i) => i.id)).not.toContain(pots!.id);

      // Left out entirely, the task's item stays, at the end.
      await editMeetingNote({
        actorId: member.id,
        noteId: id,
        version: 2,
        ...fields({ actionItems: [] }),
      });
      expect(
        (await getMeetingNote(id))?.actionItems.map((i) => i.text),
      ).toEqual(["Buy the gas"]);
    });
  });

  describe("turnActionItemIntoTask", () => {
    async function itemOn(
      actorId: string,
      team: "kitchen" | null,
      assigneeId: string | null = null,
    ) {
      const made = await createMeetingNote({
        actorId,
        team,
        ...fields({
          actionItems: [
            { id: null, text: "Buy the gas", assigneeId, dueOn: "2026-10-09" },
          ],
        }),
      });
      if (!made.ok) throw new Error(made.error);
      const note = await getMeetingNote(made.id);
      return note!.actionItems[0]!.id;
    }

    it("puts the item on the board and links it, in one go", async () => {
      const { lead, member } = await people();
      const itemId = await itemOn(member.id, "kitchen", member.id);
      const made = await turnActionItemIntoTask({
        actorId: lead.id,
        itemId,
        activeTeams: ["kitchen"],
      });
      if (!made.ok) throw new Error(made.error);

      const [task] = await h
        .db()
        .select()
        .from(schema.tasks)
        .where(eq(schema.tasks.id, made.taskId));
      expect(task).toMatchObject({
        title: "Buy the gas",
        team: "kitchen",
        assigneeId: member.id,
        createdByUserId: lead.id,
        status: "open",
        dueAt: new Date("2026-10-09T00:00:00+02:00"),
        description: "From the meeting “Kitchen kickoff” on 2 Oct 2026.",
      });
      const note = await getMeetingNote(made.noteId);
      expect(note?.actionItems[0]?.task).toEqual({
        id: made.taskId,
        status: "open",
      });

      // A second click finds it already done, and adds nothing.
      expect(
        await turnActionItemIntoTask({
          actorId: lead.id,
          itemId,
          activeTeams: ["kitchen"],
        }),
      ).toEqual({ ok: false, error: ALREADY_A_TASK });
      expect(await h.db().select().from(schema.tasks)).toHaveLength(1);
    });

    it("follows the board's rule: a plain member of the team, or a lead of another, may not", async () => {
      const db = h.db();
      const { member, outsider } = await people();
      await db
        .update(schema.teamMemberships)
        .set({ isLead: true })
        .where(eq(schema.teamMemberships.userId, outsider.id));
      const itemId = await itemOn(member.id, "kitchen");
      expect(
        await turnActionItemIntoTask({
          actorId: member.id,
          itemId,
          activeTeams: ["kitchen"],
        }),
      ).toEqual({ ok: false, error: NOT_A_TASK_AUTHOR });
      expect(
        await turnActionItemIntoTask({
          actorId: outsider.id,
          itemId,
          activeTeams: ["kitchen"],
        }),
      ).toEqual({ ok: false, error: NOT_YOUR_TEAM });
      expect(await db.select().from(schema.tasks)).toHaveLength(0);
    });

    it("lets a captain turn a whole-camp item into a task with no team", async () => {
      const { captain } = await people();
      const itemId = await itemOn(captain.id, null);
      const made = await turnActionItemIntoTask({
        actorId: captain.id,
        itemId,
        activeTeams: [],
      });
      expect(made.ok).toBe(true);
      const [task] = await h.db().select().from(schema.tasks);
      expect(task?.team).toBeNull();
    });

    it("refuses an item on a switched-off team's note", async () => {
      const { captain, member } = await people();
      const itemId = await itemOn(member.id, "kitchen");
      expect(
        await turnActionItemIntoTask({
          actorId: captain.id,
          itemId,
          activeTeams: ["finance"],
        }),
      ).toEqual({ ok: false, error: TEAM_NOT_ACTIVE });
    });

    it("adds no task when the person responsible has left the approved list", async () => {
      const db = h.db();
      const { lead, member } = await people();
      const itemId = await itemOn(member.id, "kitchen", member.id);
      await db
        .update(schema.users)
        .set({ approvalStatus: "pending" })
        .where(eq(schema.users.id, member.id));
      const made = await turnActionItemIntoTask({
        actorId: lead.id,
        itemId,
        activeTeams: ["kitchen"],
      });
      expect(made.ok).toBe(false);
      expect(await db.select().from(schema.tasks)).toHaveLength(0);
      const [item] = await db.select().from(schema.meetingNoteActionItems);
      expect(item?.taskId).toBeNull();
    });
  });
});

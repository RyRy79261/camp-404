// @vitest-environment node
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import * as schema from "@camp404/db/schema";
import { ATTENDANCE_CHANGED } from "@camp404/db/logistics";
import { NOTE_EDITED, NOT_A_NOTE_WRITER } from "@camp404/db/meeting-notes";
import { SHIFT_CLOSED, SHIFT_FULL, SHIFT_NOT_ON } from "@camp404/db/shifts";
import { CANNOT_MOVE, NOT_YOUR_TEAM, TASK_MOVED } from "@camp404/db/tasks";
import { REQUEST_GONE, YOU_ARE_DRIVING } from "@camp404/db/transport";
import type * as CampCalendar from "@/lib/camp-calendar";
import { useTestDb } from "../../../../../packages/db/src/__tests__/_harness";
import {
  makeDriverProfile,
  makeMembership,
  makeUser,
} from "../../../../../packages/db/src/__tests__/_factories";

// The everyday member tools (MCP PR 3) against real Postgres (PGlite): each
// case calls the real tool handler as a signed-in person, through the site's
// own function, and reads the database afterwards. For each tool: what the
// person may do, what they may not, and the compare-and-set where the site
// has one. None of these site actions writes an audit_log row (they are the
// person's own, or team planning data); the connector's own log records each
// call, which the last case checks.

vi.mock("next/server", () => ({ after: () => undefined }));
// The camp calendar is Google's: stubbed so a case can give it events.
vi.mock("@/lib/camp-calendar", async (importOriginal) => ({
  ...(await importOriginal<typeof CampCalendar>()),
  getUpcomingEvents: vi.fn(async () => ({ status: "not_configured" })),
}));

import { getUpcomingEvents } from "@/lib/camp-calendar";
import { registerCampMcpTools } from "../server";

type Handler = (args: unknown, extra: unknown) => Promise<CallToolResult>;
const tools = new Map<string, { shape: z.ZodRawShape; handler: Handler }>();
registerCampMcpTools({
  registerTool: (
    name: string,
    config: { inputSchema?: z.ZodRawShape },
    handler: Handler,
  ) => {
    tools.set(name, { shape: config.inputSchema ?? {}, handler });
  },
} as unknown as McpServer);

/** Call a tool as the SDK would: its arguments parsed by its input schema. */
async function call(name: string, args: Record<string, unknown>, as: string) {
  const tool = tools.get(name)!;
  const result = await tool.handler(z.object(tool.shape).parse(args), {
    authInfo: { clientId: "test", extra: { campUserId: as } },
  });
  const text = (result.content[0] as { text: string }).text;
  return result.isError
    ? { error: text }
    : // eslint-disable-next-line @typescript-eslint/no-explicit-any -- each tool's own answer shape
      { data: JSON.parse(text) as any };
}

// useTestDb is the PGlite harness (vitest hooks), not a React Hook.
// eslint-disable-next-line react-hooks/rules-of-hooks -- useTestDb is the PGlite harness, not a React Hook
const h = useTestDb();

const approved = (overrides: Partial<typeof schema.users.$inferInsert> = {}) =>
  makeUser(h.db(), { approvalStatus: "approved", ...overrides });

/** A captain, a Kitchen lead, a Kitchen member and a member of no team. */
async function camp() {
  const db = h.db();
  const captain = await approved({ rank: "captain", displayName: "Cap Tain" });
  const lead = await approved({ displayName: "Lee Lead" });
  const cook = await approved({ displayName: "Cee Cook" });
  const loner = await approved({ displayName: "Lo Ner" });
  await makeMembership(db, { userId: lead.id, team: "kitchen", isLead: true });
  await makeMembership(db, { userId: cook.id, team: "kitchen" });
  return { captain, lead, cook, loner };
}

beforeEach(() => {
  vi.mocked(getUpcomingEvents).mockResolvedValue({ status: "not_configured" });
});

describe("inbox", () => {
  async function deliver(
    userId: string,
    title: string,
    presentation: "feed" | "popup" = "feed",
  ) {
    const [row] = await h
      .db()
      .insert(schema.notificationDeliveries)
      .values({
        userId,
        title,
        body: `${title} body`,
        channel: "in_app",
        presentation,
      })
      .returning({ id: schema.notificationDeliveries.id });
    return row!.id;
  }

  async function readAt(id: string) {
    const [row] = await h
      .db()
      .select({ readAt: schema.notificationDeliveries.readAt })
      .from(schema.notificationDeliveries)
      .where(eq(schema.notificationDeliveries.id, id));
    return row!.readAt;
  }

  it("lists only the caller's own notifications, 30 a page, as the page pages", async () => {
    const { cook, loner } = await camp();
    for (let i = 0; i < 31; i += 1) await deliver(cook.id, `Notice ${i}`);
    await deliver(loner.id, "Someone else's");

    const first = await call("list_my_notifications", {}, cook.id);
    expect(first.data.items).toHaveLength(30);
    expect(first.data.nextCursor).toEqual(expect.any(String));
    const second = await call(
      "list_my_notifications",
      { before: first.data.nextCursor },
      cook.id,
    );
    expect(second.data.items).toHaveLength(1);
    expect(second.data.nextCursor).toBeNull();
    const titles = [...first.data.items, ...second.data.items].map(
      (i: { title: string }) => i.title,
    );
    expect(titles).not.toContain("Someone else's");
    // Listing marks nothing read.
    expect(
      (await call("list_my_notifications", { filter: "unread" }, cook.id)).data
        .items,
    ).toHaveLength(30);
  });

  it("marks the caller's own read, never someone else's or an unshown pop-up", async () => {
    const { cook, loner } = await camp();
    const mine = await deliver(cook.id, "Mine");
    const popup = await deliver(cook.id, "Pop", "popup");
    const theirs = await deliver(loner.id, "Theirs");

    const result = await call(
      "mark_notifications_read",
      { ids: [mine, popup, theirs] },
      cook.id,
    );
    expect(result.data).toEqual({ marked: [mine], popupsLeft: 1, notFound: 1 });
    expect(await readAt(mine)).not.toBeNull();
    expect(await readAt(popup)).toBeNull();
    expect(await readAt(theirs)).toBeNull();
  });

  it("marks all of the caller's feed read, and says 0 the second time", async () => {
    const { cook, loner } = await camp();
    await deliver(cook.id, "One");
    await deliver(cook.id, "Two");
    const popup = await deliver(cook.id, "Pop", "popup");
    const theirs = await deliver(loner.id, "Theirs");

    expect(
      (await call("mark_all_notifications_read", {}, cook.id)).data,
    ).toEqual({ cleared: 2 });
    expect(
      (await call("mark_all_notifications_read", {}, cook.id)).data,
    ).toEqual({ cleared: 0 });
    expect(await readAt(popup)).toBeNull();
    expect(await readAt(theirs)).toBeNull();
  });
});

describe("tasks", () => {
  async function task(input: Partial<typeof schema.tasks.$inferInsert> = {}) {
    const [row] = await h
      .db()
      .insert(schema.tasks)
      .values({ title: "Buy gas", team: "kitchen", ...input })
      .returning();
    return row!;
  }

  it("lists the board with what each person may do to each task", async () => {
    const { lead, cook, loner } = await camp();
    const t = await task({ assigneeId: cook.id });
    const as = async (id: string) =>
      (await call("list_tasks", {}, id)).data.rows.find(
        (r: { id: string }) => r.id === t.id,
      );
    expect(await as(cook.id)).toMatchObject({ mine: true, canMove: true });
    expect(await as(lead.id)).toMatchObject({ mine: false, canMove: true });
    expect(await as(loner.id)).toMatchObject({ canMove: false });
  });

  it("lets a lead add a task to a team they lead, and nobody below that", async () => {
    const { captain, lead, cook } = await camp();
    const refused = await call(
      "add_task",
      { title: "Sweep", team: "kitchen" },
      cook.id,
    );
    expect(refused.error).toMatch(/^Only a team lead or a captain can do this/);
    expect(refused.error).toContain("/tasks");

    expect(
      await call("add_task", { title: "Sweep", team: "structures" }, lead.id),
    ).toEqual({ error: NOT_YOUR_TEAM });

    const added = await call(
      "add_task",
      {
        title: "Sweep",
        team: "kitchen",
        assigneeId: cook.id,
        due: "2027-04-20",
      },
      lead.id,
    );
    expect(added.data.id).toEqual(expect.any(String));
    const [row] = await h
      .db()
      .select()
      .from(schema.tasks)
      .where(eq(schema.tasks.id, added.data.id));
    expect(row).toMatchObject({
      title: "Sweep",
      team: "kitchen",
      assigneeId: cook.id,
      createdByUserId: lead.id,
    });

    // A captain adds anywhere, or for no team.
    expect(
      (await call("add_task", { title: "Plan", team: null }, captain.id)).data
        .id,
    ).toEqual(expect.any(String));
  });

  it("moves a task for its person, refuses others, and only from the column read", async () => {
    const { cook, loner } = await camp();
    const t = await task({ assigneeId: cook.id });

    expect(
      await call(
        "move_task",
        { taskId: t.id, from: "open", to: "done" },
        loner.id,
      ),
    ).toEqual({ error: CANNOT_MOVE });

    expect(
      (
        await call(
          "move_task",
          { taskId: t.id, from: "open", to: "in_progress" },
          cook.id,
        )
      ).data,
    ).toEqual({ id: t.id, status: "in_progress" });

    // Someone moved it since the person read "open": nothing changes.
    expect(
      await call(
        "move_task",
        { taskId: t.id, from: "open", to: "done" },
        cook.id,
      ),
    ).toEqual({ error: TASK_MOVED });
    const [row] = await h
      .db()
      .select({ status: schema.tasks.status })
      .from(schema.tasks)
      .where(eq(schema.tasks.id, t.id));
    expect(row!.status).toBe("in_progress");
    // A stale read is refused even for a move to the same column.
    expect(
      await call(
        "move_task",
        { taskId: t.id, from: "open", to: "open" },
        cook.id,
      ),
    ).toEqual({ error: TASK_MOVED });
  });
});

describe("calendar", () => {
  it("says the calendar is not connected, as the page does", async () => {
    const { cook } = await camp();
    expect(
      (await call("list_calendar_events", {}, cook.id)).data,
    ).toMatchObject({ status: "not_configured", days: [] });
  });

  it("groups the events by camp day, narrows them by dates and team", async () => {
    const { cook } = await camp();
    vi.mocked(getUpcomingEvents).mockResolvedValue({
      status: "ok",
      events: [
        {
          id: "e1",
          title: "Kitchen - Menu night",
          start: "2099-03-02",
          allDay: true,
          location: null,
          teamTag: "kitchen",
        },
        {
          id: "e2",
          title: "Camp meeting",
          start: "2099-03-05",
          allDay: true,
          location: "Lounge",
          teamTag: null,
        },
      ],
    });
    const all = (await call("list_calendar_events", {}, cook.id)).data;
    expect(all.days.map((d: { day: string }) => d.day)).toEqual([
      "2099-03-02",
      "2099-03-05",
    ]);
    expect(all.days[0].events[0]).toMatchObject({
      id: "e1",
      team: { key: "kitchen", mine: true },
    });
    const later = (
      await call("list_calendar_events", { from: "2099-03-03" }, cook.id)
    ).data;
    expect(later.days.map((d: { day: string }) => d.day)).toEqual([
      "2099-03-05",
    ]);
    const kitchen = (
      await call("list_calendar_events", { team: "kitchen" }, cook.id)
    ).data;
    expect(kitchen.days.map((d: { day: string }) => d.day)).toEqual([
      "2099-03-02",
    ]);
  });
});

describe("meetings", () => {
  async function note(team: "kitchen" | null) {
    const { captain } = await camp();
    const [row] = await h
      .db()
      .insert(schema.meetingNotes)
      .values({
        cycle: 1,
        team,
        title: "Menu planning",
        heldAt: new Date("2027-03-01T16:00:00Z"),
        agenda: "Menus",
        notes: "We talked about oats.",
        createdByUserId: captain.id,
      })
      .returning();
    await h
      .db()
      .insert(schema.meetingNoteDecisions)
      .values({ noteId: row!.id, position: 0, text: "Oats on day one" });
    return row!;
  }

  it("lists and reads every note, and says who may edit", async () => {
    const n = await note("kitchen");
    const [cook] = await h
      .db()
      .select()
      .from(schema.users)
      .where(eq(schema.users.displayName, "Cee Cook"));
    const [loner] = await h
      .db()
      .select()
      .from(schema.users)
      .where(eq(schema.users.displayName, "Lo Ner"));

    const list = (await call("list_meetings", { team: "kitchen" }, loner!.id))
      .data.meetings;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: n.id, canEdit: false });

    const read = (await call("get_meeting", { meetingId: n.id }, cook!.id))
      .data;
    expect(read).toMatchObject({
      agenda: "Menus",
      decisions: ["Oats on day one"],
      canEdit: true,
      version: 1,
    });
  });

  it("saves a team member's notes on the version read, and refuses others and stale versions", async () => {
    const n = await note("kitchen");
    const users = await h.db().select().from(schema.users);
    const by = (name: string) => users.find((u) => u.displayName === name)!.id;

    expect(
      await call(
        "update_meeting_notes",
        { meetingId: n.id, expectedVersion: 1, notes: "Not mine" },
        by("Lo Ner"),
      ),
    ).toEqual({ error: NOT_A_NOTE_WRITER });

    const saved = await call(
      "update_meeting_notes",
      {
        meetingId: n.id,
        expectedVersion: 1,
        notes: "Oats, then eggs.",
        decisions: ["Oats on day one", "Eggs on day two"],
      },
      by("Cee Cook"),
    );
    expect(saved.data).toMatchObject({
      notes: "Oats, then eggs.",
      agenda: "Menus",
      title: "Menu planning",
      decisions: ["Oats on day one", "Eggs on day two"],
      version: 2,
    });
    // The time is kept exactly.
    expect(new Date(saved.data.heldAt).toISOString()).toBe(
      "2027-03-01T16:00:00.000Z",
    );

    // Someone saved in between: version 1 is refused, nothing changes.
    expect(
      await call(
        "update_meeting_notes",
        { meetingId: n.id, expectedVersion: 1, notes: "Overwrite" },
        by("Lee Lead"),
      ),
    ).toEqual({ error: NOTE_EDITED });
    const [row] = await h
      .db()
      .select({ notes: schema.meetingNotes.notes })
      .from(schema.meetingNotes)
      .where(eq(schema.meetingNotes.id, n.id));
    expect(row!.notes).toBe("Oats, then eggs.");
  });

  it("keeps whole-camp notes for captains", async () => {
    const n = await note(null);
    const users = await h.db().select().from(schema.users);
    const by = (name: string) => users.find((u) => u.displayName === name)!.id;
    expect(
      (
        await call(
          "update_meeting_notes",
          { meetingId: n.id, expectedVersion: 1, agenda: "x" },
          by("Lee Lead"),
        )
      ).error,
    ).toBe("Only captains can write whole-camp meeting notes.");
    expect(
      (
        await call(
          "update_meeting_notes",
          { meetingId: n.id, expectedVersion: 1, agenda: "Camp" },
          by("Cap Tain"),
        )
      ).data.agenda,
    ).toBe("Camp");
  });
});

describe("shifts", () => {
  async function slot(day: string, places = 1) {
    const [type] = await h
      .db()
      .insert(schema.shiftTypes)
      .values({
        cycle: 1,
        team: "kitchen",
        name: "Dishes",
        startMinute: 18 * 60,
        durationMinutes: 60,
        places,
      })
      .returning();
    const [row] = await h
      .db()
      .insert(schema.shiftSlots)
      .values({ typeId: type!.id, day })
      .returning();
    return row!.id;
  }

  it("signs the caller up, refuses a full shift, and lets them leave", async () => {
    const { cook, loner } = await camp();
    const slotId = await slot("2099-04-29");

    expect((await call("sign_up_for_shift", { slotId }, cook.id)).data).toEqual(
      { slotId, signedUp: true, myCount: 1 },
    );
    // One place, taken: the next person is refused.
    expect(await call("sign_up_for_shift", { slotId }, loner.id)).toEqual({
      error: SHIFT_FULL,
    });

    const roster = (await call("list_shifts", {}, loner.id)).data;
    const seen = roster.days[0].slots[0];
    expect(seen).toMatchObject({ slotId, taken: 1, places: 1, mine: false });
    expect(seen.who).toEqual(["Cee C."]);
    expect(
      (await call("list_my_shifts", {}, cook.id)).data.shifts.map(
        (s: { slotId: string }) => s.slotId,
      ),
    ).toEqual([slotId]);

    expect((await call("leave_shift", { slotId }, cook.id)).data).toEqual({
      slotId,
      signedUp: false,
      myCount: 0,
    });
    expect(await call("leave_shift", { slotId }, cook.id)).toEqual({
      error: SHIFT_NOT_ON,
    });
  });

  it("refuses a day that has started", async () => {
    const { cook } = await camp();
    const slotId = await slot("2020-04-29");
    expect(await call("sign_up_for_shift", { slotId }, cook.id)).toEqual({
      error: SHIFT_CLOSED,
    });
  });
});

describe("my dues, gear and forms", () => {
  it("reads the caller's own dues as the member's page does, without Finance's notes", async () => {
    const { cook, loner } = await camp();
    await h.db().insert(schema.payments).values({
      userId: cook.id,
      cycle: 1,
      amountCents: 500_00,
      reference: "C404-COOK-1",
      note: "Finance only: matched by hand",
    });
    await h.db().insert(schema.payments).values({
      userId: loner.id,
      cycle: 1,
      amountCents: 900_00,
      reference: "C404-LONER-1",
    });
    const result = await call("get_my_dues", {}, cook.id);
    expect(result.data.payments).toEqual([
      expect.objectContaining({
        reference: "C404-COOK-1",
        amountCents: 500_00,
      }),
    ]);
    const text = JSON.stringify(result.data);
    expect(text).not.toContain("Finance only");
    expect(text).not.toContain("C404-LONER-1");
  });

  it("reads the caller's own gear order", async () => {
    const { cook } = await camp();
    const result = await call("get_my_gear_rental", {}, cook.id);
    expect(result.data).toMatchObject({ order: null, asked: false });
  });

  it("lists the caller's forms, the dietary form among them", async () => {
    const { cook } = await camp();
    const result = await call("list_my_forms", {}, cook.id);
    expect(result.data.updateAnyTime).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: "Dietary needs" }),
      ]),
    );
    expect(result.data.waiting).toEqual([]);
  });
});

describe("logistics attendance", () => {
  async function answers(userId: string) {
    return h
      .db()
      .select({
        phase: schema.logisticsAttendance.phase,
        answer: schema.logisticsAttendance.answer,
      })
      .from(schema.logisticsAttendance)
      .where(eq(schema.logisticsAttendance.userId, userId));
  }

  it("saves the caller's own answer from the one they read", async () => {
    const { cook } = await camp();
    expect(
      (
        await call(
          "set_my_logistics_attendance",
          { phase: "build", answer: "going", expected: null },
          cook.id,
        )
      ).data,
    ).toEqual({ phase: "build", answer: "going" });
    // A second "no answer yet" is stale: the answer is now "going".
    expect(
      await call(
        "set_my_logistics_attendance",
        { phase: "build", answer: "cant", expected: null },
        cook.id,
      ),
    ).toEqual({ error: ATTENDANCE_CHANGED });
    expect(await answers(cook.id)).toEqual([
      { phase: "build", answer: "going" },
    ]);
    expect(
      (
        await call(
          "set_my_logistics_attendance",
          { phase: "build", answer: "maybe", expected: "going" },
          cook.id,
        )
      ).data,
    ).toEqual({ phase: "build", answer: "maybe" });

    const board = (await call("get_logistics_attendance", {}, cook.id)).data;
    const build = board.phases.find(
      (p: { phase: string }) => p.phase === "build",
    );
    expect(build).toMatchObject({ mine: "maybe", open: true });
    expect(build.maybe).toEqual(["Cee Cook"]);
  });

  it("refuses a phase that has started", async () => {
    const { cook } = await camp();
    await h.db().insert(schema.logisticsPhases).values({
      cycle: 1,
      phase: "pack",
      startDate: "2020-01-01",
      endDate: "2020-01-02",
    });
    const result = await call(
      "set_my_logistics_attendance",
      { phase: "pack", answer: "going", expected: null },
      cook.id,
    );
    expect(result.error).toEqual(expect.any(String));
    expect(await answers(cook.id)).toEqual([]);
  });

  it("names who has not answered to leads and captains only", async () => {
    const { lead, cook } = await camp();
    const member = (await call("get_logistics_attendance", {}, cook.id)).data;
    const leadView = (await call("get_logistics_attendance", {}, lead.id)).data;
    expect(member.phases[0]).not.toHaveProperty("notAnswered");
    expect(leadView.phases[0]).toHaveProperty("notAnswered");
  });
});

describe("lift requests", () => {
  it("lets a member ask for a lift and withdraw it, and refuses a driver", async () => {
    const { captain, cook } = await camp();
    await makeDriverProfile(h.db(), { userId: captain.id });

    expect(
      await call("request_lift", { driverUserId: null }, captain.id),
    ).toEqual({ error: YOU_ARE_DRIVING });

    const asked = await call(
      "request_lift",
      { driverUserId: captain.id },
      cook.id,
    );
    expect(asked.data.request).toMatchObject({
      car: { driverUserId: captain.id, driverName: "Cap Tain" },
      anyCar: false,
    });
    expect(
      (await call("get_my_lift_request", {}, cook.id)).data.request,
    ).toMatchObject({ car: { driverUserId: captain.id } });

    expect((await call("cancel_lift_request", {}, cook.id)).data).toEqual({
      request: null,
    });
    expect(await call("cancel_lift_request", {}, cook.id)).toEqual({
      error: REQUEST_GONE,
    });
    expect(
      (await call("get_my_lift_request", {}, cook.id)).data.request,
    ).toBeNull();
  });
});

describe("search", () => {
  it("finds what the person may open, by the box's per-kind rules", async () => {
    const { captain, cook } = await camp();
    await h
      .db()
      .insert(schema.tasks)
      .values({ title: "Sharpen the knives", team: "kitchen" });
    // A suggested recipe nobody has accepted: its reviewers find it, a
    // member does not (the recipe page's own rule).
    await h.db().insert(schema.recipes).values({
      source: "text",
      title: "Knives for the salad",
      submitterId: captain.id,
    });

    const kinds = async (as: string) =>
      (await call("search_camp", { query: "knives" }, as)).data.entries.map(
        (e: { kind: string; title: string }) => `${e.kind}:${e.title}`,
      );
    expect(await kinds(cook.id)).toEqual(["task:Sharpen the knives"]);
    expect(await kinds(captain.id)).toEqual(
      expect.arrayContaining([
        "task:Sharpen the knives",
        "recipe:Knives for the salad",
      ]),
    );
    const hit = (await call("search_camp", { query: "knives" }, cook.id)).data
      .entries[0];
    expect(hit.url).toMatch(/\/tasks\?task=/);
  });
});

describe("the connector's own log", () => {
  it("records each call, success or refusal, against the caller", async () => {
    const { cook } = await camp();
    await call("add_task", { title: "x", team: "kitchen" }, cook.id);
    await call("list_tasks", {}, cook.id);
    const rows = await h
      .db()
      .select({
        tool: schema.mcpAuditLog.tool,
        outcome: schema.mcpAuditLog.outcome,
      })
      .from(schema.mcpAuditLog)
      .where(and(eq(schema.mcpAuditLog.userId, cook.id)));
    expect(rows).toEqual(
      expect.arrayContaining([
        { tool: "add_task", outcome: "error" },
        { tool: "list_tasks", outcome: "success" },
      ]),
    );
  });
});

// @vitest-environment node
import type { McpServer } from "@modelcontextprotocol/server";
import type { CallToolResult } from "@modelcontextprotocol/server";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  MINUTES_STARTED,
  NOTE_EDITED,
  NOT_A_NOTE_WRITER,
  ON_THE_BOARD,
} from "@camp404/db/meeting-notes";
import * as schema from "@camp404/db/schema";
import type * as CampCalendar from "@/lib/camp-calendar";
import { useTestDb } from "../../../../../packages/db/src/__tests__/_harness";
import {
  makeMembership,
  makeUser,
} from "../../../../../packages/db/src/__tests__/_factories";

// get_meeting_minutes and save_meeting_minutes against real Postgres
// (PGlite), through the real handlers: the minutes editor's Save for the same
// person. Who may (the meeting's team's members, captains), the first minutes
// of an event made in Google, who was there, action items going on the task
// board in the same save, ON_THE_BOARD, and the compare-and-set.

vi.mock("next/server", () => ({ after: () => undefined }));
// The camp calendar is Google's: stubbed so a case can give it an event.
vi.mock("@/lib/camp-calendar", async (importOriginal) => ({
  ...(await importOriginal<typeof CampCalendar>()),
  getCalendarEventById: vi.fn(async () => null),
}));

import { getCalendarEventById } from "@/lib/camp-calendar";
import { registerCampMcpTools } from "../server";

type Handler = (args: unknown, extra: unknown) => Promise<CallToolResult>;
const tools = new Map<string, { shape: z.ZodRawShape; handler: Handler }>();
registerCampMcpTools({
  registerTool: (
    name: string,
    config: { inputSchema?: z.ZodObject },
    handler: Handler,
  ) => {
    tools.set(name, { shape: config.inputSchema?.shape ?? {}, handler });
  },
} as unknown as McpServer);

async function call(name: string, args: Record<string, unknown>, as: string) {
  const tool = tools.get(name)!;
  const result = await tool.handler(z.object(tool.shape).parse(args), {
    http: { authInfo: { clientId: "test", extra: { campUserId: as } } },
  });
  const text = (result.content[0] as { text: string }).text;
  return result.isError
    ? { error: text }
    : // eslint-disable-next-line @typescript-eslint/no-explicit-any -- each tool's own answer shape
      { data: JSON.parse(text) as any };
}

// eslint-disable-next-line react-hooks/rules-of-hooks -- useTestDb is the PGlite harness, not a React Hook
const h = useTestDb();

const approved = (overrides: Partial<typeof schema.users.$inferInsert> = {}) =>
  makeUser(h.db(), { approvalStatus: "approved", ...overrides });

async function camp() {
  const captain = await approved({ rank: "captain", displayName: "Cap Tain" });
  const lead = await approved({ displayName: "Lee Lead" });
  const cook = await approved({ displayName: "Cee Cook" });
  const loner = await approved({ displayName: "Lo Ner" });
  await makeMembership(h.db(), {
    userId: lead.id,
    team: "kitchen",
    isLead: true,
  });
  await makeMembership(h.db(), { userId: cook.id, team: "kitchen" });
  return { captain, lead, cook, loner };
}

const EVENT = "kitchenmeet1";

async function meeting(createdBy: string) {
  const [row] = await h
    .db()
    .insert(schema.meetingNotes)
    .values({
      cycle: 1,
      team: "kitchen",
      title: "Menu planning",
      heldAt: new Date("2099-03-01T16:00:00Z"),
      calendarEventId: EVENT,
      calendarEventTitle: "Menu planning",
      agenda: "Menus",
      notes: "",
      createdByUserId: createdBy,
    })
    .returning();
  return row!;
}

async function tasksTitled(title: string) {
  return h
    .db()
    .select()
    .from(schema.tasks)
    .where(eq(schema.tasks.title, title));
}

beforeEach(() => {
  vi.mocked(getCalendarEventById).mockResolvedValue(null);
});

describe("save_meeting_minutes", () => {
  it("ticks who was there and puts a new action item on the board in the same save", async () => {
    const { captain, lead, cook, loner } = await camp();
    const note = await meeting(captain.id);

    const read = (
      await call("get_meeting_minutes", { eventId: EVENT }, cook.id)
    ).data;
    expect(read).toMatchObject({
      meetingId: note.id,
      title: "Menu planning",
      team: "kitchen",
      version: 1,
      agenda: "Menus",
      attendees: [],
      canEdit: true,
    });
    expect(
      (await call("get_meeting_minutes", { eventId: EVENT }, loner.id)).data
        .canEdit,
    ).toBe(false);

    expect(
      await call(
        "save_meeting_minutes",
        { eventId: EVENT, expectedVersion: 1, notes: "Not mine" },
        loner.id,
      ),
    ).toEqual({ error: NOT_A_NOTE_WRITER });

    const saved = await call(
      "save_meeting_minutes",
      {
        eventId: EVENT,
        expectedVersion: 1,
        notes: "Oats on day one.",
        attendeeIds: [cook.id, lead.id],
        actionItems: [
          { text: "Buy oats", assigneeId: cook.id, due: "2099-03-10" },
        ],
      },
      cook.id,
    );
    expect(saved.error).toBeUndefined();
    expect(saved.data).toMatchObject({
      version: 2,
      agenda: "Menus",
      notes: "Oats on day one.",
    });
    expect(
      saved.data.attendees.map((a: { userId: string }) => a.userId).sort(),
    ).toEqual([cook.id, lead.id].sort());
    expect(saved.data.actionItems).toEqual([
      expect.objectContaining({
        text: "Buy oats",
        assigneeId: cook.id,
        team: "kitchen",
        due: "2099-03-10",
        onTheBoard: true,
        taskStatus: "open",
      }),
    ]);
    // The task is on the board, filed under the meeting's team.
    expect(await tasksTitled("Buy oats")).toEqual([
      expect.objectContaining({ team: "kitchen", assigneeId: cook.id }),
    ]);

    // An item on the board keeps its words: changing them here is refused.
    const itemId = saved.data.actionItems[0].id as string;
    expect(
      await call(
        "save_meeting_minutes",
        {
          eventId: EVENT,
          expectedVersion: 2,
          actionItems: [{ id: itemId, text: "Buy rice", assigneeId: cook.id }],
        },
        lead.id,
      ),
    ).toEqual({ error: ON_THE_BOARD });

    // Left out, the action items stay as they are; a stale version is refused.
    expect(
      (
        await call(
          "save_meeting_minutes",
          { eventId: EVENT, expectedVersion: 2, decisions: ["Oats"] },
          lead.id,
        )
      ).data,
    ).toMatchObject({ version: 3, decisions: ["Oats"] });
    expect(
      await call(
        "save_meeting_minutes",
        { eventId: EVENT, expectedVersion: 2, notes: "Overwrite" },
        captain.id,
      ),
    ).toEqual({ error: NOTE_EDITED });
    const after = (
      await call("get_meeting_minutes", { eventId: EVENT }, lead.id)
    ).data;
    expect(after).toMatchObject({ notes: "Oats on day one.", version: 3 });
    expect(after.actionItems).toHaveLength(1);
    expect(await tasksTitled("Buy oats")).toHaveLength(1);
  });

  it("writes the first minutes of an event made in Google, once", async () => {
    const { cook, loner } = await camp();
    vi.mocked(getCalendarEventById).mockResolvedValue({
      id: "googlemeet1",
      title: "[Kitchen] Tasting",
      start: "2099-03-02T14:00:00.000Z",
      end: "2099-03-02T15:00:00.000Z",
      allDay: false,
      location: null,
      teamTag: "kitchen",
      origin: null,
    });
    const read = (
      await call("get_meeting_minutes", { eventId: "googlemeet1" }, cook.id)
    ).data;
    expect(read).toMatchObject({
      meetingId: null,
      version: null,
      team: "kitchen",
      canEdit: true,
    });
    expect(
      await call(
        "save_meeting_minutes",
        { eventId: "googlemeet1", expectedVersion: null, notes: "x" },
        loner.id,
      ),
    ).toEqual({ error: NOT_A_NOTE_WRITER });

    const first = await call(
      "save_meeting_minutes",
      {
        eventId: "googlemeet1",
        expectedVersion: null,
        notes: "Too much salt.",
        attendeeIds: [cook.id],
      },
      cook.id,
    );
    expect(first.error).toBeUndefined();
    expect(first.data).toMatchObject({ version: 1, notes: "Too much salt." });
    const [note] = await h
      .db()
      .select()
      .from(schema.meetingNotes)
      .where(eq(schema.meetingNotes.calendarEventId, "googlemeet1"));
    expect(note).toMatchObject({
      team: "kitchen",
      title: "Tasting",
      createdByUserId: cook.id,
    });

    // A second "first minutes" is refused: someone started them.
    expect(
      await call(
        "save_meeting_minutes",
        { eventId: "googlemeet1", expectedVersion: null, notes: "Again" },
        cook.id,
      ),
    ).toEqual({ error: MINUTES_STARTED });
  });

  it("says when the meeting is not on the calendar", async () => {
    const { cook } = await camp();
    expect(
      await call(
        "save_meeting_minutes",
        { eventId: "nothere", expectedVersion: null, notes: "x" },
        cook.id,
      ),
    ).toEqual({ error: "That meeting isn't on the calendar any more." });
  });
});

import { describe, expect, it } from "vitest";
import {
  EditCampEventInput,
  NewCampEventInput,
  RemoveCampEventInput,
} from "../calendar";
import { MeetingMinutesInput } from "../meeting-note";

// The Calendar's New event form: a trimmed title, optional description and
// place, a real date, for a timed event a start and an end on the same day,
// and for an all-day one an optional last day.

const base = {
  kind: "event",
  title: "  Kitchen briefing ",
  team: "kitchen",
  date: "2026-10-01",
  allDay: false,
  start: "18:00",
  end: "19:30",
};

function firstError(input: unknown): string | undefined {
  const parsed = NewCampEventInput.safeParse(input);
  return parsed.success ? undefined : parsed.error.issues[0]?.message;
}

describe("NewCampEventInput", () => {
  it("trims the title and turns empty description, place and last day into null", () => {
    const parsed = NewCampEventInput.parse({
      ...base,
      description: "  ",
      place: "",
      endDate: "",
    });
    expect(parsed.title).toBe("Kitchen briefing");
    expect(parsed.description).toBeNull();
    expect(parsed.place).toBeNull();
    expect(parsed.endDate).toBeNull();
    expect(parsed.start).toBe("18:00");
    expect(parsed.agenda).toBe("");
  });

  it("takes an all-day event over several days, and a whole-camp one", () => {
    const parsed = NewCampEventInput.parse({
      ...base,
      team: null,
      allDay: true,
      start: "",
      end: "",
      endDate: "2026-10-03",
    });
    expect(parsed.team).toBeNull();
    expect(parsed.endDate).toBe("2026-10-03");
    expect(parsed.start).toBeUndefined();
  });

  it("refuses a last day before the first, and a month-long event", () => {
    expect(firstError({ ...base, allDay: true, endDate: "2026-09-30" })).toBe(
      "The last day can't be before the first.",
    );
    expect(firstError({ ...base, allDay: true, endDate: "2026-11-20" })).toBe(
      "An event can run 31 days at most.",
    );
  });

  it("needs a start and an end after it for a timed event", () => {
    expect(firstError({ ...base, start: "" })).toBe(
      "Pick a start time, or make it all day.",
    );
    expect(firstError({ ...base, end: "" })).toBe(
      "Pick an end time, or make it all day.",
    );
    expect(firstError({ ...base, end: "17:00" })).toBe(
      "The event must end after it starts, on the same day.",
    );
  });

  it("refuses a date that is not a day, a team that is not a team, and an unknown type", () => {
    expect(firstError({ ...base, date: "2026-02-30" })).toBe(
      "Pick a date for the event.",
    );
    expect(NewCampEventInput.safeParse({ ...base, team: "moon" }).success).toBe(
      false,
    );
    expect(
      NewCampEventInput.safeParse({ ...base, kind: "party" }).success,
    ).toBe(false);
  });

  it("keeps a meeting's agenda", () => {
    const parsed = NewCampEventInput.parse({
      ...base,
      kind: "meeting",
      agenda: " 1. The menu ",
    });
    expect(parsed.kind).toBe("meeting");
    expect(parsed.agenda).toBe("1. The menu");
  });
});

describe("EditCampEventInput and RemoveCampEventInput", () => {
  it("carries the event and the version the form opened", () => {
    const { kind: _kind, ...fields } = base;
    const parsed = EditCampEventInput.parse({
      ...fields,
      eventId: "abc123",
      version: 2,
    });
    expect(parsed.version).toBe(2);
    expect(
      EditCampEventInput.safeParse({ ...fields, version: 2 }).success,
    ).toBe(false);
    expect(
      RemoveCampEventInput.safeParse({ eventId: "abc", version: 0 }).success,
    ).toBe(false);
  });
});

describe("MeetingMinutesInput", () => {
  it("takes a first save (no version) and drops repeated attendees", () => {
    const parsed = MeetingMinutesInput.parse({
      eventId: "evt1",
      version: null,
      agenda: "",
      notes: " We met. ",
      attendeeIds: ["a", "a", "b"],
      decisions: ["Buy panels"],
      actionItems: [
        { id: null, text: "Order", assigneeId: null, due: "2026-10-20" },
      ],
    });
    expect(parsed.notes).toBe("We met.");
    expect(parsed.attendeeIds).toEqual(["a", "b"]);
  });

  it("refuses an event id that is not one", () => {
    const base = {
      version: null,
      agenda: "",
      notes: "",
      attendeeIds: [],
      decisions: [],
      actionItems: [],
    };
    for (const eventId of ["", "a%2Fb", "../x", "a b"]) {
      expect(MeetingMinutesInput.safeParse({ ...base, eventId }).success).toBe(
        false,
      );
    }
    expect(
      MeetingMinutesInput.safeParse({ ...base, eventId: "abc_DEF-123" })
        .success,
    ).toBe(true);
  });

  it("refuses an empty decision and a bad deadline", () => {
    const base = {
      eventId: "evt1",
      version: 1,
      agenda: "",
      notes: "",
      attendeeIds: [],
      decisions: [],
      actionItems: [],
    };
    expect(
      MeetingMinutesInput.safeParse({ ...base, decisions: [" "] }).success,
    ).toBe(false);
    expect(
      MeetingMinutesInput.safeParse({
        ...base,
        actionItems: [{ id: null, text: "x", assigneeId: null, due: "soon" }],
      }).success,
    ).toBe(false);
  });
});

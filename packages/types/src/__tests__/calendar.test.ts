import { describe, expect, it } from "vitest";
import { AddCalendarEventInput } from "../calendar";

// The add-event form's shape: a trimmed title, an optional description, a
// real date, and for a timed event a start and an end on the same day.

const base = {
  title: "  Kitchen briefing ",
  team: "kitchen",
  date: "2026-10-01",
  allDay: false,
  start: "18:00",
  end: "19:30",
};

function firstError(input: unknown): string | undefined {
  const parsed = AddCalendarEventInput.safeParse(input);
  return parsed.success ? undefined : parsed.error.issues[0]?.message;
}

describe("AddCalendarEventInput", () => {
  it("trims the title and turns an empty description into null", () => {
    const parsed = AddCalendarEventInput.parse({ ...base, description: "  " });
    expect(parsed.title).toBe("Kitchen briefing");
    expect(parsed.description).toBeNull();
    expect(parsed.start).toBe("18:00");
  });

  it("takes an all-day event with no times, and a whole-camp one with no team", () => {
    const parsed = AddCalendarEventInput.parse({
      ...base,
      team: null,
      allDay: true,
      start: "",
      end: "",
    });
    expect(parsed.team).toBeNull();
    expect(parsed.start).toBeUndefined();
  });

  it("needs a title, a real date and a known team", () => {
    expect(firstError({ ...base, title: "   " })).toBe(
      "Give the event a title.",
    );
    expect(firstError({ ...base, title: "x".repeat(121) })).toBe(
      "Keep the title under 120 characters.",
    );
    expect(firstError({ ...base, date: "2026-02-30" })).toBe(
      "Pick a date for the event.",
    );
    expect(firstError({ ...base, date: "1 Oct" })).toBe(
      "Pick a date for the event.",
    );
    expect(
      AddCalendarEventInput.safeParse({ ...base, team: "moon" }).success,
    ).toBe(false);
  });

  it("needs a start and an end for a timed event, the end after the start", () => {
    expect(firstError({ ...base, start: "" })).toBe(
      "Pick a start time, or make it all day.",
    );
    expect(firstError({ ...base, end: undefined })).toBe(
      "Pick an end time, or make it all day.",
    );
    expect(firstError({ ...base, end: "18:00" })).toBe(
      "The event must end after it starts, on the same day.",
    );
    expect(firstError({ ...base, start: "23:00", end: "01:00" })).toBe(
      "The event must end after it starts, on the same day.",
    );
    expect(firstError({ ...base, start: "25:00" })).toBe(
      "Use a time like 18:30.",
    );
  });

  it("keeps the description, up to 2000 characters", () => {
    expect(
      AddCalendarEventInput.parse({ ...base, description: " Bring a torch " })
        .description,
    ).toBe("Bring a torch");
    expect(firstError({ ...base, description: "x".repeat(2001) })).toBe(
      "Keep the details under 2000 characters.",
    );
  });
});

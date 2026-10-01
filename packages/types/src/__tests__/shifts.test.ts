import { describe, expect, it } from "vitest";
import {
  AddVolunteerShiftInput,
  RemoveShiftTypeInput,
  SaveShiftTypeInput,
  SetSlotNeededInput,
  ShiftMemberInput,
  ShiftSlotInput,
} from "../shifts";

// The shift roster's shapes (#248). Who may use them is the server's rule;
// these say only what a well-formed request looks like.

const ID = "3f1c2d4e-5a6b-4c7d-8e9f-0a1b2c3d4e5f";

const SHIFT = {
  team: "sanitation_and_water",
  name: "  Morning clean ",
  startMinute: 480,
  durationMinutes: 120,
  places: 4,
  note: "",
  expectedVersion: 0,
};

const firstError = (r: {
  success: boolean;
  error?: { issues: { message: string }[] };
}) => (r.success ? null : r.error!.issues[0]!.message);

describe("SaveShiftTypeInput", () => {
  it("trims the name and makes an empty note no note", () => {
    const parsed = SaveShiftTypeInput.parse(SHIFT);
    expect(parsed.name).toBe("Morning clean");
    expect(parsed.note).toBeNull();
  });

  it("takes a night watch that runs to midnight", () => {
    expect(
      SaveShiftTypeInput.safeParse({
        ...SHIFT,
        startMinute: 16 * 60,
        durationMinutes: 480,
      }).success,
    ).toBe(true);
  });

  it("refuses what is not a shift, in words", () => {
    expect(
      firstError(SaveShiftTypeInput.safeParse({ ...SHIFT, name: " " })),
    ).toBe("Give the shift a name.");
    expect(
      firstError(SaveShiftTypeInput.safeParse({ ...SHIFT, startMinute: 485 })),
    ).toBe("Start on the hour or a quarter past.");
    expect(
      firstError(
        SaveShiftTypeInput.safeParse({ ...SHIFT, durationMinutes: 10 }),
      ),
    ).toBe("A shift is at least 15 minutes.");
    expect(
      firstError(SaveShiftTypeInput.safeParse({ ...SHIFT, places: 21 })),
    ).toBe("A shift takes 20 people at most.");
    expect(
      SaveShiftTypeInput.safeParse({ ...SHIFT, team: "not_a_team" }).success,
    ).toBe(false);
  });
});

describe("the small shapes", () => {
  it("need a row id and a version where a change is a compare-and-set", () => {
    expect(ShiftSlotInput.safeParse({ slotId: ID }).success).toBe(true);
    expect(ShiftSlotInput.safeParse({ slotId: "nope" }).success).toBe(false);
    expect(
      SetSlotNeededInput.safeParse({
        slotId: ID,
        needed: false,
        expectedVersion: 1,
      }).success,
    ).toBe(true);
    expect(
      RemoveShiftTypeInput.safeParse({ id: ID, expectedVersion: 0 }).success,
    ).toBe(false);
    expect(
      ShiftMemberInput.safeParse({ slotId: ID, userId: "test-user-3" }).success,
    ).toBe(true);
  });

  it("checks an AfrikaBurn volunteer shift", () => {
    const shift = {
      department: " Rangers ",
      day: "2027-04-29",
      startMinute: 600,
      durationMinutes: 240,
    };
    expect(AddVolunteerShiftInput.parse(shift).department).toBe("Rangers");
    expect(
      firstError(
        AddVolunteerShiftInput.safeParse({ ...shift, day: "2027-02-30" }),
      ),
    ).toBe("Pick the day.");
  });
});

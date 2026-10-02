import { describe, expect, it } from "vitest";
import {
  bookingState,
  countText,
  groupLoansByCamp,
  maintenanceNote,
  suggestionDiff,
  unitFor,
} from "../inventory-copy";

// The inventory's words (#246 redesign): counts read as words ("4 boxes", not
// "4 × box"), a suggested change shows only what it changes, and the gear
// list says something about maintenance only when something needs doing.

describe("countText", () => {
  it("writes a count with its unit as words", () => {
    expect(countText(4, "box")).toBe("4 boxes");
    expect(countText(1, "freezer")).toBe("1 freezer");
    expect(countText(6, "reel")).toBe("6 reels");
    expect(countText(3, "battery")).toBe("3 batteries");
    expect(countText(2, "glass")).toBe("2 glasses");
  });

  it("writes an f ending the English way", () => {
    expect(countText(4, "shelf")).toBe("4 shelves");
    expect(countText(3, "knife")).toBe("3 knives");
    expect(countText(2, "roof")).toBe("2 roofs");
  });

  it("keeps a unit typed already plural, and a bare number without one", () => {
    expect(unitFor(4, "boxes")).toBe("boxes");
    expect(countText(4, null)).toBe("4");
    expect(countText(4, "  ")).toBe("4");
  });
});

describe("suggestionDiff", () => {
  const item = {
    quantity: 4,
    unit: "box",
    condition: "good" as const,
    location: "storage_unit" as const,
    custodianName: null,
    storageLocation: "Bay 2",
  };
  const same = {
    quantity: 4,
    condition: "good" as const,
    location: "storage_unit" as const,
    custodianName: null,
    storageLocation: "Bay 2",
    maintenancePerformedAt: null,
  };

  it("names only the fields that change", () => {
    expect(suggestionDiff(item, { ...same, quantity: 3 })).toEqual([
      { label: "How many", from: "4", to: "3" },
    ]);
    expect(suggestionDiff(item, same)).toEqual([]);
  });

  it("shows a new place and condition as before and after, as typed", () => {
    expect(
      suggestionDiff(item, {
        ...same,
        condition: "broken",
        storageLocation: "Bay 3",
      }),
    ).toEqual([
      { label: "Condition", from: "Good", to: "Broken" },
      {
        label: "Where",
        from: "Storage unit, Bay 2",
        to: "Storage unit, Bay 3",
      },
    ]);
  });

  it("says when maintenance was done", () => {
    const [field] = suggestionDiff(item, {
      ...same,
      maintenancePerformedAt: new Date("2026-09-28T10:00:00Z"),
    });
    expect(field).toEqual({
      label: "Maintenance",
      from: "",
      to: "Done 28 Sept",
    });
  });
});

describe("maintenanceNote", () => {
  const now = new Date("2026-09-27T12:00:00Z");

  it("says nothing for an item with no schedule, or one not due", () => {
    const off = {
      requiresMaintenance: false,
      lastMaintainedAt: null,
      nextMaintenanceDueAt: null,
    };
    expect(maintenanceNote(off, now)).toBeNull();
    expect(
      maintenanceNote(
        {
          requiresMaintenance: true,
          lastMaintainedAt: new Date("2026-09-01T00:00:00Z"),
          nextMaintenanceDueAt: new Date("2026-12-01T00:00:00Z"),
        },
        now,
      ),
    ).toBeNull();
  });

  it("says Never done for a new item, not Due", () => {
    expect(
      maintenanceNote(
        {
          requiresMaintenance: true,
          lastMaintainedAt: null,
          nextMaintenanceDueAt: null,
        },
        now,
      ),
    ).toEqual({ text: "Never done", due: false });
  });

  it("says Due with the date once it has come", () => {
    expect(
      maintenanceNote(
        {
          requiresMaintenance: true,
          lastMaintainedAt: new Date("2026-01-01T00:00:00Z"),
          nextMaintenanceDueAt: new Date("2026-03-01T00:00:00Z"),
        },
        now,
      ),
    ).toEqual({ text: "Due 1 Mar", due: true });
  });
});

describe("bookingState", () => {
  const base = {
    bookableCount: 3,
    quantity: 4,
    condition: "good" as const,
    lentOut: 0,
    booked: 1,
    myBookingId: null,
  };

  it("says how many are left and why some are not bookable", () => {
    expect(bookingState(base)).toMatchObject({
      free: 3,
      left: 2,
      why: "1 kept for the camp",
      after: "2 left",
    });
  });

  it("takes lent-out units off and says so", () => {
    expect(bookingState({ ...base, lentOut: 2 })).toMatchObject({
      free: 2,
      left: 1,
      why: "2 lent out",
    });
    // Lent out AND over the limit: both reasons, lent out first.
    expect(
      bookingState({ ...base, bookableCount: 2, quantity: 5, lentOut: 2 }),
    ).toMatchObject({ free: 2, why: "2 lent out · 1 kept for the camp" });
    expect(bookingState({ ...base, lentOut: 4, booked: 0 })).toMatchObject({
      free: 0,
      after: "Back after the burn",
    });
  });

  it("books none of a broken item", () => {
    expect(bookingState({ ...base, condition: "broken" })).toMatchObject({
      broken: true,
      free: 0,
      left: 0,
      why: "Broken",
      after: "Until it's fixed",
    });
  });

  it("says Full when every free unit is booked, and nothing extra for your own", () => {
    expect(bookingState({ ...base, booked: 3 })).toMatchObject({
      left: 0,
      after: "Full",
    });
    expect(
      bookingState({ ...base, booked: 3, myBookingId: "b-1" }).after,
    ).toBeNull();
  });
});

describe("groupLoansByCamp", () => {
  it("groups loans by camp and address, in the order camps first appear", () => {
    const loans = [
      { id: "1", borrowerCamp: "Sunshine Disco", borrowerAddress: "7:30 & B" },
      { id: "2", borrowerCamp: "Dusty Llamas", borrowerAddress: "4:00 & R" },
      { id: "3", borrowerCamp: "sunshine disco ", borrowerAddress: "7:30 & B" },
    ];
    expect(
      groupLoansByCamp(loans).map((g) => [g.camp, g.loans.map((l) => l.id)]),
    ).toEqual([
      ["Sunshine Disco", ["1", "3"]],
      ["Dusty Llamas", ["2"]],
    ]);
  });
});

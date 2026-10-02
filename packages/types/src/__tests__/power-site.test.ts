import { describe, expect, it } from "vitest";
import {
  EditFuelCanInput,
  EditReadinessItemInput,
  FuelCanInput,
  GridNodeInput,
  SharingAgreementInput,
  looksLikeContactDetail,
} from "../power-site";

// The shapes the power-on-site pages send (#255–#257): each refuses what would
// be wrong to store, with a sentence a person can act on.

const ID = "0f8fad5b-d9cb-469f-a165-70867728950e";

function messages(result: {
  success: boolean;
  error?: { issues: { message: string }[] };
}) {
  return (result.error?.issues ?? []).map((i) => i.message);
}

describe("fuel cans", () => {
  const can = {
    ownerUserId: null,
    sizeLitres: 20,
    material: "plastic",
    travelsWithUserId: null,
  };

  it("takes a camp can on no car, with a blank note as none", () => {
    expect(FuelCanInput.parse({ ...can, note: "  " })).toEqual({
      ...can,
      note: null,
    });
  });

  it("refuses no size, too big a can and an unknown material", () => {
    expect(messages(FuelCanInput.safeParse({ ...can, sizeLitres: 0 }))).toEqual(
      ["Give the can's size in litres."],
    );
    expect(
      messages(FuelCanInput.safeParse({ ...can, sizeLitres: 251 })),
    ).toEqual(["A can holds at most 250 L."]);
    expect(FuelCanInput.safeParse({ ...can, material: "glass" }).success).toBe(
      false,
    );
  });

  it("has no field for who fills it: that is the car's driver", () => {
    const parsed = EditFuelCanInput.parse({
      ...can,
      canId: ID,
      expectedVersion: 1,
      travelsWithUserId: "test-user-3",
      filledByUserId: "someone-else",
    });
    expect(parsed).not.toHaveProperty("filledByUserId");
    expect(parsed.travelsWithUserId).toBe("test-user-3");
  });
});

describe("grid points", () => {
  it("a generator is fed by nothing, and keeps no cable", () => {
    const gen = GridNodeInput.parse({
      name: "Genny",
      kind: "generator",
      cable: "25 m reel",
      cableRatedAmps: 16,
    });
    expect(gen).toMatchObject({
      parentId: null,
      cable: null,
      cableRatedAmps: null,
    });
    expect(
      messages(
        GridNodeInput.safeParse({ name: "G", kind: "generator", parentId: ID }),
      ),
    ).toEqual(["A generator is where the grid starts: nothing feeds it."]);
  });

  it("every other point says what feeds it", () => {
    expect(
      messages(GridNodeInput.safeParse({ name: "Kitchen", kind: "end_point" })),
    ).toEqual(["Say which point feeds it."]);
  });

  it("a blank rating is unknown, never zero", () => {
    const point = GridNodeInput.parse({
      name: "Lounge",
      kind: "end_point",
      parentId: ID,
      cableRatedAmps: "",
    });
    expect(point.cableRatedAmps).toBeNull();
  });
});

describe("readiness items", () => {
  it("takes a real due day or none", () => {
    const base = { itemId: ID, expectedVersion: 1, ownerUserId: null };
    expect(
      EditReadinessItemInput.safeParse({ ...base, dueOn: "" }).success,
    ).toBe(true);
    expect(
      messages(
        EditReadinessItemInput.safeParse({ ...base, dueOn: "2027-02-30" }),
      ),
    ).toEqual(["Pick a real day."]);
  });
});

describe("the sharing agreement", () => {
  const agreement = {
    partnerCamp: "Camp Moonbeam",
    contactRole: "their power lead",
    generatorSource: "ours",
    generatorId: ID,
    watchCover: "They cover 00:00–08:00",
    expectedVersion: 0,
  };

  it("tells a phone number or an email from a role or a time", () => {
    expect(looksLikeContactDetail("082 555 1234")).toBe(true);
    expect(looksLikeContactDetail("+27 (82) 555-1234")).toBe(true);
    expect(looksLikeContactDetail("lead@moonbeam.org")).toBe(true);
    expect(looksLikeContactDetail("their power lead")).toBe(false);
    expect(looksLikeContactDetail("They cover 00:00–08:00, 16:00-18:00")).toBe(
      false,
    );
  });

  it("refuses a contact that is a phone number, in the role and the watches", () => {
    const sentence = "Give a role, not a phone number or an email address.";
    expect(
      messages(
        SharingAgreementInput.safeParse({
          ...agreement,
          contactRole: "082 555 1234",
        }),
      ),
    ).toEqual([sentence]);
    expect(
      messages(
        SharingAgreementInput.safeParse({
          ...agreement,
          watchCover: "Call Sam on 0825551234",
        }),
      ),
    ).toEqual([sentence]);
  });

  it("ours names a generator; theirs keeps a note and drops the id", () => {
    expect(
      messages(
        SharingAgreementInput.safeParse({ ...agreement, generatorId: null }),
      ),
    ).toEqual(["Pick which of our generators."]);
    expect(
      SharingAgreementInput.parse({
        ...agreement,
        generatorSource: "theirs",
        theirGenerator: "Their 8 kVA diesel",
      }),
    ).toMatchObject({
      generatorId: null,
      theirGenerator: "Their 8 kVA diesel",
    });
  });

  it("keeps their share of the fuel between 0 and 100, blank for the proposal", () => {
    expect(
      SharingAgreementInput.parse({ ...agreement, partnerFuelPct: "" })
        .partnerFuelPct,
    ).toBeNull();
    expect(
      messages(
        SharingAgreementInput.safeParse({ ...agreement, partnerFuelPct: 120 }),
      ),
    ).toEqual(["Use 0% to 100%."]);
  });
});

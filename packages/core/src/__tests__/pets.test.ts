import { describe, expect, it } from "vitest";
import { PetInput, MarkPetInInput } from "@camp404/types";
import {
  canReviewPets,
  mayReadPetPhoto,
  maySeePet,
  petKindText,
  unusedPetModuleKeys,
} from "../pets";
import { petInNotification, payloadLink } from "../notifications";
import { shouldEmailNotification } from "../notification-email";

const OWNER = "owner-1";
const OTHER = "other-1";

describe("canReviewPets", () => {
  it("is a captain's alone", () => {
    expect(canReviewPets({ isCaptain: true })).toBe(true);
    expect(canReviewPets({ isCaptain: false })).toBe(false);
  });

  it("fails closed on anything but a plain true", () => {
    const loose = (v: unknown) =>
      canReviewPets({ isCaptain: v } as { isCaptain: boolean });
    expect(loose("captain")).toBe(false);
    expect(loose(1)).toBe(false);
    expect(loose(undefined)).toBe(false);
  });
});

describe("mayReadPetPhoto", () => {
  it("lets the member who sent the pet see its photos", () => {
    expect(
      mayReadPetPhoto({ viewerId: OWNER, ownerId: OWNER, isCaptain: false }),
    ).toBe(true);
  });

  it("refuses every other member, whatever the pet's status", () => {
    expect(
      mayReadPetPhoto({ viewerId: OTHER, ownerId: OWNER, isCaptain: false }),
    ).toBe(false);
  });

  it("lets a captain see any pet's photos", () => {
    expect(
      mayReadPetPhoto({ viewerId: OTHER, ownerId: OWNER, isCaptain: true }),
    ).toBe(true);
  });

  it("fails closed on a pet with no owner", () => {
    expect(
      mayReadPetPhoto({ viewerId: OTHER, ownerId: null, isCaptain: false }),
    ).toBe(false);
  });
});

describe("maySeePet", () => {
  const member = { viewerId: OTHER, isCaptain: false };

  it("shows a pet that is in to everyone", () => {
    expect(maySeePet({ status: "in", ownerId: OWNER }, member)).toBe(true);
    expect(maySeePet({ status: "in", ownerId: null }, member)).toBe(true);
  });

  it("keeps a waiting pet to its sender and the captains", () => {
    expect(maySeePet({ status: "waiting", ownerId: OWNER }, member)).toBe(
      false,
    );
    expect(
      maySeePet(
        { status: "waiting", ownerId: OWNER },
        { viewerId: OWNER, isCaptain: false },
      ),
    ).toBe(true);
    expect(
      maySeePet(
        { status: "waiting", ownerId: OWNER },
        { viewerId: OTHER, isCaptain: true },
      ),
    ).toBe(true);
  });
});

describe("unusedPetModuleKeys", () => {
  it("drops the keys a pet already wears, in the registry's order", () => {
    expect(
      unusedPetModuleKeys(
        ["jinn", "moda", "nipster", "prince"],
        ["moda", null, "prince"],
      ),
    ).toEqual(["jinn", "nipster"]);
  });
});

describe("petKindText", () => {
  it("uses the member's own word for something else", () => {
    expect(petKindText("other", "A tortoise")).toBe("A tortoise");
    expect(petKindText("other", "  ")).toBe("Something else");
    expect(petKindText("dog", "ignored")).toBe("Dog");
  });
});

describe("PetInput", () => {
  it("needs every field, and a word for something else", () => {
    const r = PetInput.safeParse({
      name: "",
      kind: "",
      kindOther: "",
      stupidThing: "",
    });
    expect(r.success).toBe(false);
    const paths = r.error!.issues.map((i) => i.path.join("."));
    expect(paths).toEqual(
      expect.arrayContaining(["name", "kind", "stupidThing"]),
    );
    const other = PetInput.safeParse({
      name: "Gerald",
      kind: "other",
      kindOther: "",
      stupidThing: "Outlived three cars.",
    });
    expect(other.error?.issues.map((i) => i.path.join("."))).toEqual([
      "kindOther",
    ]);
  });

  it("keeps the word for something else only when it is something else", () => {
    const r = PetInput.parse({
      name: " Pickle ",
      kind: "dog",
      kindOther: "A tortoise",
      stupidThing: "Barks at the kettle.",
    });
    expect(r).toEqual({
      name: "Pickle",
      kind: "dog",
      kindOther: null,
      stupidThing: "Barks at the kettle.",
    });
  });

  it("refuses a second line in the stupid thing", () => {
    expect(
      PetInput.safeParse({
        name: "Pickle",
        kind: "dog",
        stupidThing: "One\nTwo",
      }).success,
    ).toBe(false);
  });
});

describe("MarkPetInInput", () => {
  it("needs a picture key and a one-line hint", () => {
    expect(
      MarkPetInInput.safeParse({ petId: "p", moduleKey: "jinn", hint: "x" })
        .success,
    ).toBe(true);
    expect(
      MarkPetInInput.safeParse({ petId: "p", moduleKey: "Jinn!", hint: "x" })
        .success,
    ).toBe(false);
    expect(
      MarkPetInInput.safeParse({ petId: "p", moduleKey: "jinn", hint: "" })
        .success,
    ).toBe(false);
  });
});

describe("petInNotification", () => {
  it("carries the hint, opens Camp pets, and stays out of email", () => {
    const p = petInNotification({
      petId: "6f1c2a8e-1b2c-4d5e-8f90-123456789abc",
      petName: "Pickle",
      hint: "Look near the clock",
    });
    expect(p.kind).toBe("pet_in");
    expect(p.body).toBe("Your pet is in. Hint: Look near the clock");
    expect(payloadLink(p)).toBe("/pets");
    expect(shouldEmailNotification("pet_in", "feed")).toBe(false);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { PET_REF_TYPE } from "@camp404/core";
import {
  PET_ALREADY_IN,
  PET_KEY_TAKEN,
  PET_NOT_IN,
  PET_NOT_YOURS,
} from "@camp404/db/pets";
import { testStore } from "../test-store";
import { petsTestStore as s } from "../test-store-pets";

// The E2E twin of @camp404/db/pets (Camp pets). Playwright drives the page
// through it, so it keeps the database module's rules, case for case with
// packages/db/src/__tests__/pets.test.ts: a waiting pet is its sender's and a
// reviewer's only, marking in is a compare-and-set on `waiting` that refuses
// a picture another pet wears and sends the owner a notice, a hint is only
// for a pet that is in, and erasure takes the member's pets.

function user(name: string) {
  return testStore.createUser({
    authUserId: `auth-${name}`,
    displayName: name,
    inviteCode: "seeded",
    rank: "member",
  });
}

function send(ownerId: string, name = "Biscuit") {
  const r = s.addPet({
    ownerId,
    name,
    kind: "dog",
    kindOther: "",
    stupidThing: "Barks at the kettle.",
    frontPhotoPath: `pets/${ownerId}/front.png`,
    sidePhotoPath: `pets/${ownerId}/side.png`,
  });
  if (!r.ok) throw new Error(r.error);
  return r.id;
}

describe("pets test store", () => {
  beforeEach(() => testStore.reset());

  it("starts with the four seeded cats, in, with no owner or photos", () => {
    const pets = s.listPets({ viewerId: "nobody", isReviewer: false });
    expect(pets.map((p) => p.moduleKey).sort()).toEqual([
      "jinn",
      "moda",
      "nipster",
      "prince",
    ]);
    expect(pets.every((p) => p.status === "in" && p.ownerId === null)).toBe(
      true,
    );
    expect(pets.some((p) => p.hasFrontPhoto || p.hasSidePhoto)).toBe(false);
  });

  it("shows a waiting pet and its photo to its sender and a reviewer only", () => {
    const sender = user("Sen");
    const other = user("Oth");
    const id = send(sender.id);
    const names = (viewerId: string, isReviewer: boolean) =>
      s.listPets({ viewerId, isReviewer }).map((p) => p.name);
    expect(names(sender.id, false)).toContain("Biscuit");
    expect(names("founder", true)).toContain("Biscuit");
    expect(names(other.id, false)).not.toContain("Biscuit");
    expect(s.getPetPhoto(id, "side")).toEqual({
      ownerId: sender.id,
      pathname: `pets/${sender.id}/side.png`,
    });
  });

  it("marks a pet in once, refuses a worn picture, and tells the owner", () => {
    const sender = user("Sen");
    const id = send(sender.id);
    expect(
      s.markPetIn({ actorId: "f", petId: id, moduleKey: "jinn", hint: "x" }),
    ).toEqual({ ok: false, error: PET_KEY_TAKEN });
    expect(s.setPetHint({ actorId: "f", petId: id, hint: "x" })).toEqual({
      ok: false,
      error: PET_NOT_IN,
    });

    expect(
      s.markPetIn({
        actorId: "f",
        petId: id,
        moduleKey: "biscuit",
        hint: "Near the kettle",
      }),
    ).toEqual({ ok: true, ownerId: sender.id });
    expect(testStore.hasUnreadNotice(sender.id, PET_REF_TYPE)).toBe(true);
    expect(
      s.markPetIn({
        actorId: "f",
        petId: id,
        moduleKey: "other",
        hint: "again",
      }),
    ).toEqual({ ok: false, error: PET_ALREADY_IN });
    expect(s.listUsedPetModuleKeys()).toContain("biscuit");
  });

  it("lets only the owner or a reviewer change the stupid thing", () => {
    const sender = user("Sen");
    const other = user("Oth");
    const id = send(sender.id);
    expect(
      s.setPetStupidThing({
        actorId: other.id,
        isReviewer: false,
        petId: id,
        stupidThing: "No.",
      }),
    ).toEqual({ ok: false, error: PET_NOT_YOURS });
    expect(
      s.setPetStupidThing({
        actorId: sender.id,
        isReviewer: false,
        petId: id,
        stupidThing: "Eats socks.",
      }),
    ).toEqual({ ok: true });
  });

  it("erasure takes the member's pets and leaves everyone else's", () => {
    const sender = user("Sen");
    const other = user("Oth");
    send(sender.id, "Biscuit");
    send(other.id, "Pebble");
    s.deletePetsOf(sender.id);
    const names = s
      .listPets({ viewerId: "founder", isReviewer: true })
      .map((p) => p.name);
    expect(names).not.toContain("Biscuit");
    expect(names).toContain("Pebble");
  });
});

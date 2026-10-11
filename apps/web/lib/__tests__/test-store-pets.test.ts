import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { PET_REF_TYPE } from "@camp404/core";
import {
  PET_ALREADY_IN,
  PET_KEY_TAKEN,
  PET_NOT_A_REVIEWER,
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
// for a pet that is in, only a captain reviews (read at the write), and
// erasure takes the member's pets.

function user(name: string, rank: "member" | "captain" = "member") {
  return testStore.createUser({
    authUserId: `auth-${name}`,
    displayName: name,
    inviteCode: "seeded",
    rank,
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
    expect(names("captain", true)).toContain("Biscuit");
    expect(names(other.id, false)).not.toContain("Biscuit");
    expect(s.getPetPhoto(id, "side")).toEqual({
      ownerId: sender.id,
      pathname: `pets/${sender.id}/side.png`,
    });
  });

  it("marks a pet in once, refuses a worn picture, and tells the owner", () => {
    const sender = user("Sen");
    const f = user("Cap", "captain").id;
    const id = send(sender.id);
    expect(
      s.markPetIn({ actorId: f, petId: id, moduleKey: "jinn", hint: "x" }),
    ).toEqual({ ok: false, error: PET_KEY_TAKEN });
    expect(s.setPetHint({ actorId: f, petId: id, hint: "x" })).toEqual({
      ok: false,
      error: PET_NOT_IN,
    });

    expect(
      s.markPetIn({
        actorId: f,
        petId: id,
        moduleKey: "biscuit",
        hint: "Near the kettle",
      }),
    ).toEqual({ ok: true, ownerId: sender.id });
    expect(testStore.hasUnreadNotice(sender.id, PET_REF_TYPE)).toBe(true);
    expect(
      s.markPetIn({
        actorId: f,
        petId: id,
        moduleKey: "other",
        hint: "again",
      }),
    ).toEqual({ ok: false, error: PET_ALREADY_IN });
    expect(s.listUsedPetModuleKeys()).toContain("biscuit");
  });

  it("refuses a member who is not a captain, and a demoted captain", () => {
    const sender = user("Sen");
    const member = user("Mem");
    const captain = user("Cap", "captain");
    const id = send(sender.id);
    const jinn = s
      .listPets({ viewerId: member.id, isReviewer: false })
      .find((p) => p.moduleKey === "jinn")!.id;
    const no = { ok: false, error: PET_NOT_A_REVIEWER };
    const mark = (actorId: string) =>
      s.markPetIn({ actorId, petId: id, moduleKey: "biscuit", hint: "x" });
    expect(mark(member.id)).toEqual(no);
    expect(
      s.setPetHint({ actorId: member.id, petId: jinn, hint: "x" }),
    ).toEqual(no);
    expect(
      s.setPetOwner({ actorId: member.id, petId: jinn, ownerId: member.id }),
    ).toEqual(no);
    testStore.setUserRank(captain.id, "member");
    expect(mark(captain.id)).toEqual(no);
    expect(
      s.setPetStupidThing({
        actorId: captain.id,
        petId: id,
        stupidThing: "No.",
      }),
    ).toEqual({ ok: false, error: PET_NOT_YOURS });
    testStore.setUserRank(captain.id, "captain");
    expect(mark(captain.id)).toEqual({ ok: true, ownerId: sender.id });
  });

  it("lets only the owner or a captain change the stupid thing", () => {
    const sender = user("Sen");
    const other = user("Oth");
    const captain = user("Cap", "captain");
    const id = send(sender.id);
    expect(
      s.setPetStupidThing({
        actorId: other.id,
        petId: id,
        stupidThing: "No.",
      }),
    ).toEqual({ ok: false, error: PET_NOT_YOURS });
    expect(
      s.setPetStupidThing({
        actorId: sender.id,
        petId: id,
        stupidThing: "Eats socks.",
      }),
    ).toEqual({ ok: true });
    expect(
      s.setPetStupidThing({
        actorId: captain.id,
        petId: id,
        stupidThing: "Eats all the socks.",
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
      .listPets({ viewerId: "captain", isReviewer: true })
      .map((p) => p.name);
    expect(names).not.toContain("Biscuit");
    expect(names).toContain("Pebble");
  });
});

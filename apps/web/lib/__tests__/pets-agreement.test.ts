// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  PET_ALREADY_IN,
  PET_GONE,
  PET_KEY_TAKEN,
  PET_NOT_A_REVIEWER,
  PET_NOT_IN,
  PET_NOT_YOURS,
  PET_NO_ACTOR,
  PET_NO_SUCH_MEMBER,
  PET_SENT_WITH_PHOTOS,
} from "@camp404/db/pets";
import * as schema from "@camp404/db/schema";
import { PET_KINDS } from "@camp404/types";
import { useTestDb } from "../../../../packages/db/src/__tests__/_harness";
import { bothWays } from "./_agreement";

// Camp pets (owner, 2026-10-09), through lib/pets.ts, on the database and on
// the E2E store: a member sends in their own pet, it waits for a captain
// (canReviewPets, @camp404/core), a captain marks it in once with a picture
// key nobody else has, and only a captain changes a hint or says whose a
// seeded pet is. Photos stay with their sender. An erased member can do none
// of it. Leads have no say here, so the Kitchen lead is refused like a member.
// The account erasure is stubbed of its blob sweeps. See _agreement.ts.

const mode = vi.hoisted(() => ({ on: false }));
vi.mock("@/lib/test-mode", () => ({
  isE2ETestMode: () => mode.on,
  usesTestStore: () => mode.on,
  TEST_USER_COOKIE: "camp404_test_user",
}));
vi.mock("../avatar-blob", () => ({ deleteAvatarBlobs: vi.fn() }));
vi.mock("../payment-proof", () => ({ deletePaymentProofBlobs: vi.fn() }));
vi.mock("../claim-receipts", () => ({ deleteClaimReceiptBlobs: vi.fn() }));
vi.mock("../report-screenshots", () => ({
  deleteReportScreenshotBlobs: vi.fn(),
}));
vi.mock("../pet-photos", () => ({ deletePetPhotoBlobs: vi.fn() }));

import { testStore } from "../test-store";
import { deleteAccount } from "../account";
import {
  addPet,
  getPetPhoto,
  listPetOwnerChoices,
  listPets,
  listUsedPetModuleKeys,
  markPetIn,
  setPetHint,
  setPetOwner,
  setPetStupidThing,
} from "../pets";

const [, DOG] = PET_KINDS;
const NOBODY = "00000000-0000-4000-8000-000000000000";

const pet = (ownerId: string, name: string) => ({
  ownerId,
  name,
  kind: DOG!,
  kindOther: null,
  stupidThing: "Eats socks.",
  frontPhotoPath: `pets/${name}/front.jpg`,
  sidePhotoPath: `pets/${name}/side.jpg`,
});

const refused = (error: string) => ({ ok: false, error });

describe("camp pets: the database and the test store agree", () => {
  const h = useTestDb();
  beforeEach(() => {
    mode.on = false;
    testStore.reset();
  });

  it("lets a member send in their pet, a captain mark it in once, and refuses the rest", async () => {
    const { db, store } = await bothWays(mode, h, async (p) => {
      const sent = await addPet(pet(p.member, "Rex"));
      const id = sent.ok ? sent.id : "";
      const ghost = await addPet(pet(NOBODY, "Ghost"));
      const othersLine = await setPetStupidThing({
        actorId: p.other,
        petId: id,
        stupidThing: "Mine now.",
      });
      const ownLine = await setPetStupidThing({
        actorId: p.member,
        petId: id,
        stupidThing: "Eats shoes.",
      });
      const leadIn = await markPetIn({
        actorId: p.kitchenLead,
        petId: id,
        moduleKey: "rex",
        hint: "Near the stove.",
      });
      const first = await addPet(pet(p.other, "Zed's cat"));
      await markPetIn({
        actorId: p.captain,
        petId: first.ok ? first.id : "",
        moduleKey: "rex",
        hint: "Under the truck.",
      });
      const takenKey = await markPetIn({
        actorId: p.captain,
        petId: id,
        moduleKey: "rex",
        hint: "Near the stove.",
      });
      const hintTooSoon = await setPetHint({
        actorId: p.captain,
        petId: id,
        hint: "Early.",
      });
      const marked = await markPetIn({
        actorId: p.captain,
        petId: id,
        moduleKey: "rex-1",
        hint: "Near the stove.",
      });
      const twice = await markPetIn({
        actorId: p.captain,
        petId: id,
        moduleKey: "rex-2",
        hint: "Again.",
      });
      const hint = await setPetHint({
        actorId: p.captain,
        petId: id,
        hint: "By the gate.",
      });
      const gone = await setPetHint({
        actorId: p.captain,
        petId: NOBODY,
        hint: "x",
      });
      const giveAway = await setPetOwner({
        actorId: p.captain,
        petId: id,
        ownerId: p.other,
      });
      const seen = (rows: Awaited<ReturnType<typeof listPets>>) =>
        rows
          .filter((r) => r.name === "Rex")
          .map((r) => ({
            name: r.name,
            status: r.status,
            hint: r.hint,
            stupidThing: r.stupidThing,
          }));
      return {
        sent: sent.ok,
        ghost,
        othersLine,
        ownLine,
        leadIn,
        takenKey,
        hintTooSoon,
        marked,
        twice,
        hint,
        gone,
        giveAway,
        photo: await getPetPhoto(id, "front"),
        noPhoto: await getPetPhoto(NOBODY, "side"),
        forMember: seen(
          await listPets({ viewerId: p.other, isReviewer: false }),
        ),
        // A set: the database names no order.
        keys: (await listUsedPetModuleKeys())
          .filter((k) => k.startsWith("rex"))
          .sort(),
      };
    });
    expect(db).toMatchObject({
      sent: true,
      ghost: refused(PET_NO_ACTOR),
      othersLine: refused(PET_NOT_YOURS),
      ownLine: { ok: true },
      leadIn: refused(PET_NOT_A_REVIEWER),
      takenKey: refused(PET_KEY_TAKEN),
      hintTooSoon: refused(PET_NOT_IN),
      marked: { ok: true, ownerId: "@member" },
      twice: refused(PET_ALREADY_IN),
      hint: { ok: true },
      gone: refused(PET_GONE),
      giveAway: refused(PET_SENT_WITH_PHOTOS),
      photo: { ownerId: "@member", pathname: "pets/Rex/front.jpg" },
      noPhoto: null,
      forMember: [
        {
          name: "Rex",
          status: "in",
          hint: "By the gate.",
          stupidThing: "Eats shoes.",
        },
      ],
      keys: ["rex", "rex-1"],
    });
    expect(store).toEqual(db);
  });

  it("keeps a waiting pet to its sender and the captains, and an erased member out of every pet", async () => {
    const { db, store } = await bothWays(mode, h, async (p, seed) => {
      const waiting = await addPet(pet(p.member, "Rex"));
      const id = waiting.ok ? waiting.id : "";
      const names = async (viewerId: string, isReviewer: boolean) =>
        (await listPets({ viewerId, isReviewer }))
          .filter((r) => r.status === "waiting")
          .map((r) => r.name);
      const before = {
        sender: await names(p.member, false),
        other: await names(p.other, false),
        captain: await names(p.captain, true),
      };
      await deleteAccount({ userId: p.other, authUserId: "x" });
      const erasedSends = await addPet(pet(p.other, "Late"));
      // A pet with no photos (a seeded cat) may change hands; Rex, sent in,
      // may not. The store starts with its seeded cats; the database's copy
      // is made here, as migration 0112 made them.
      if (seed.side === "db") {
        await h.db().insert(schema.pets).values({
          name: "Moda",
          kind: "cat",
          stupidThing: "Still thinking of one.",
          status: "in",
          moduleKey: "moda-test",
        });
      }
      const seeded = (await listPets({ viewerId: p.captain, isReviewer: true }))
        .filter((r) => !r.hasFrontPhoto && !r.hasSidePhoto)
        .sort((a, b) => a.name.localeCompare(b.name))[0]!.id;
      const erasedOwner = await setPetOwner({
        actorId: p.captain,
        petId: seeded,
        ownerId: p.other,
      });
      const toMember = await setPetOwner({
        actorId: p.captain,
        petId: seeded,
        ownerId: p.member,
      });
      const rexAway = await setPetOwner({
        actorId: p.captain,
        petId: id,
        ownerId: p.captain,
      });
      const erasedLine = await setPetStupidThing({
        actorId: p.other,
        petId: id,
        stupidThing: "x",
      });
      const choices = (await listPetOwnerChoices()).map((c) => c.name);
      return {
        before,
        erasedSends,
        erasedOwner,
        toMember,
        rexAway,
        erasedLine,
        choices,
        noSuchOwner: await setPetOwner({
          actorId: p.captain,
          petId: seeded,
          ownerId: NOBODY,
        }),
      };
    });
    expect(db).toMatchObject({
      before: { sender: ["Rex"], other: [], captain: ["Rex"] },
      erasedSends: refused(PET_NO_ACTOR),
      erasedOwner: refused(PET_NO_SUCH_MEMBER),
      toMember: { ok: true },
      rexAway: refused(PET_SENT_WITH_PHOTOS),
      erasedLine: refused(PET_NO_ACTOR),
      choices: ["Cap", "Cook", "Fin", "Nova"],
      noSuchOwner: refused(PET_NO_SUCH_MEMBER),
    });
    expect(store).toEqual(db);
  });
});

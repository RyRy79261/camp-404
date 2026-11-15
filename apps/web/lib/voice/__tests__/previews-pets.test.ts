// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("../../pets", () => ({ listPets: vi.fn() }));
vi.mock("../reads", () => ({
  readNames: vi.fn(
    async (ids: string[]) => new Map(ids.map((id) => [id, "Pat Mokoena"])),
  ),
}));

import { PET_SENT_WITH_PHOTOS } from "@camp404/db/pets";
import type { McpScope } from "../../mcp/scope";
import { listPets, type PetRow } from "../../pets";
import { PETS_PREVIEWS } from "../previews-pets";

// Camp pets' voice previews: the pet is named from the row the page would
// show this person, the text the write checks is the row's own, and a pet
// that is not there, not theirs, or sent in with photos is blocked.

const ME = "11111111-1111-4111-8111-111111111111";
const PET = "22222222-2222-4222-8222-222222222222";
const PAT = "33333333-3333-4333-8333-333333333333";

const member: McpScope = {
  campUserId: ME,
  rank: "member",
  viewerRank: "camp_member",
  leadTeams: [],
  memberTeams: [],
  isDriver: false,
  isCaptain: false,
};
const captain: McpScope = {
  ...member,
  rank: "captain",
  viewerRank: "captain",
  isCaptain: true,
};
const at = (scope: McpScope) => ({ scope, now: new Date() });

function pet(over: Partial<PetRow> = {}): PetRow {
  return {
    id: PET,
    ownerId: ME,
    ownerName: "Dee Mokoena",
    name: "Rex",
    kind: "dog",
    kindOther: null,
    stupidThing: "Eats socks",
    status: "in",
    hint: "By the fire",
    moduleKey: "moda",
    hasFrontPhoto: true,
    hasSidePhoto: true,
    createdAt: new Date(),
    markedInAt: new Date(),
    ...over,
  };
}

describe("pets previews", () => {
  it("changes your pet's stupid thing at the text read", async () => {
    vi.mocked(listPets).mockResolvedValue([pet()]);
    const p = await PETS_PREVIEWS.set_pet_stupid_thing!(
      { petId: PET, stupidThing: "Barks at bins", expected: "old" },
      at(member),
    );
    expect(p.blocked).toBeUndefined();
    expect(p.sentence).toBe("Change “Rex”'s stupid thing");
    expect(p.args).toEqual({
      petId: PET,
      stupidThing: "Barks at bins",
      expected: "Eats socks",
    });
    expect(p.change).toEqual(["Stupid thing: “Barks at bins”"]);

    vi.mocked(listPets).mockResolvedValue([pet({ ownerId: PAT })]);
    const notMine = await PETS_PREVIEWS.set_pet_stupid_thing!(
      { petId: PET, stupidThing: "Mine now" },
      at(member),
    );
    expect(notMine.blocked).toBe("You can only change your own pet.");
  });

  it("marks in only a waiting pet, and changes a hint at the hint read", async () => {
    vi.mocked(listPets).mockResolvedValue([pet()]);
    const done = await PETS_PREVIEWS.mark_pet_in!(
      { petId: PET, picture: "jinn", hint: "Look up" },
      at(captain),
    );
    expect(done.blocked).toBe("It is in already.");
    const hint = await PETS_PREVIEWS.set_pet_hint!(
      { petId: PET, hint: "Look up" },
      at(captain),
    );
    expect(hint.args).toMatchObject({ expected: "By the fire" });
    expect(hint.change).toEqual(["Hint: “Look up”"]);
  });

  it("says whose a pet is only for a pet with no photos", async () => {
    vi.mocked(listPets).mockResolvedValue([pet()]);
    const sent = await PETS_PREVIEWS.set_pet_owner!(
      { petId: PET, ownerId: PAT },
      at(captain),
    );
    expect(sent.blocked).toBe(PET_SENT_WITH_PHOTOS);
    vi.mocked(listPets).mockResolvedValue([
      pet({
        ownerId: null,
        ownerName: null,
        hasFrontPhoto: false,
        hasSidePhoto: false,
      }),
    ]);
    const seeded = await PETS_PREVIEWS.set_pet_owner!(
      { petId: PET, ownerId: PAT },
      at(captain),
    );
    expect(seeded.blocked).toBeUndefined();
    expect(seeded.sentence).toBe("Say “Rex” is Pat Mokoena's");
  });

  it("blocks a pet the page would not show", async () => {
    vi.mocked(listPets).mockResolvedValue([]);
    const p = await PETS_PREVIEWS.set_pet_hint!(
      { petId: PET, hint: "x" },
      at(captain),
    );
    expect(p.blocked).toBe("That pet isn't on Camp pets.");
  });
});

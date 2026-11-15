import { PET_SENT_WITH_PHOTOS } from "@camp404/db/pets";
import { findPet } from "../mcp/tools/pets";
import {
  blocked,
  personName,
  quote,
  shown,
  str,
  type PreviewFn,
} from "./preview-kit";

// Camp pets' voice previews (owner, 2026-10-09): each reads the pet as the
// page shows it to this person, names it from that row, and fills in the
// text the write checks (`expected`). Never a word on what "in" means.

const PATH = "/pets";

export const PETS_PREVIEWS: Readonly<Record<string, PreviewFn>> = {
  async set_pet_stupid_thing(args, ctx) {
    const pet = await findPet(ctx.scope, str(args.petId));
    if (!pet) {
      return blocked(
        "Change a pet's stupid thing",
        "That pet isn't on Camp pets.",
        args,
        PATH,
      );
    }
    const yours = pet.ownerId !== null && pet.ownerId === ctx.scope.campUserId;
    return {
      sentence: `Change ${quote(pet.name)}'s stupid thing`,
      facts: `Camp pets · now ${shown(pet.stupidThing)}`,
      change: [`Stupid thing: ${shown(args.stupidThing)}`],
      path: PATH,
      args: {
        petId: pet.id,
        stupidThing: args.stupidThing,
        expected: pet.stupidThing,
      },
      keys: [`pet:${pet.id}:thing`],
      ...(yours || ctx.scope.isCaptain
        ? {}
        : { blocked: "You can only change your own pet." }),
    };
  },

  async mark_pet_in(args, ctx) {
    const pet = await findPet(ctx.scope, str(args.petId));
    if (!pet) {
      return blocked(
        "Mark a pet in",
        "That pet isn't on Camp pets.",
        args,
        PATH,
      );
    }
    return {
      sentence: `Mark ${quote(pet.name)} in`,
      facts: `Camp pets · ${pet.ownerName ?? "nobody's"} · picture ${str(args.picture)} · its member gets a notice`,
      change: [`Hint: ${shown(args.hint)}`],
      path: PATH,
      args: { petId: pet.id, picture: args.picture, hint: args.hint },
      keys: [`pet:${pet.id}`],
      ...(pet.status === "waiting" ? {} : { blocked: "It is in already." }),
    };
  },

  async set_pet_hint(args, ctx) {
    const pet = await findPet(ctx.scope, str(args.petId));
    if (!pet) {
      return blocked(
        "Change a pet's hint",
        "That pet isn't on Camp pets.",
        args,
        PATH,
      );
    }
    return {
      sentence: `Change ${quote(pet.name)}'s hint`,
      facts: `Camp pets · now ${shown(pet.hint)}`,
      change: [`Hint: ${shown(args.hint)}`],
      path: PATH,
      args: { petId: pet.id, hint: args.hint, expected: pet.hint },
      keys: [`pet:${pet.id}:hint`],
      needs: [`pet:${pet.id}`],
      ...(pet.status === "in"
        ? {}
        : { blocked: "Only a pet that is in has a hint." }),
    };
  },

  async set_pet_owner(args, ctx) {
    const pet = await findPet(ctx.scope, str(args.petId));
    if (!pet) {
      return blocked(
        "Say whose pet it is",
        "That pet isn't on Camp pets.",
        args,
        PATH,
      );
    }
    const ownerId = typeof args.ownerId === "string" ? args.ownerId : null;
    const who = ownerId ? await personName(ownerId) : null;
    return {
      sentence: who
        ? `Say ${quote(pet.name)} is ${who}'s`
        : `Say ${quote(pet.name)} is nobody's`,
      facts: `Camp pets · now ${pet.ownerName ?? "nobody's"}`,
      path: PATH,
      args: { petId: pet.id, ownerId },
      keys: [`pet:${pet.id}:owner`],
      ...(pet.hasFrontPhoto || pet.hasSidePhoto
        ? { blocked: PET_SENT_WITH_PHOTOS }
        : {}),
    };
  },
};

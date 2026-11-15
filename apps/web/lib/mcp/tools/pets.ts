import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { unusedPetModuleKeys } from "@camp404/core";
import { PET_GONE } from "@camp404/db/pets";
import { isPetModuleKey, PET_MODULE_KEYS } from "@camp404/games/pets";
import {
  EditPetHintInput,
  EditPetThingInput,
  MarkPetInInput,
  SetPetOwnerInput,
} from "@camp404/types";
import { deliverAfterResponse } from "../../background-work";
import {
  listPets,
  listUsedPetModuleKeys,
  markPetIn,
  setPetHint,
  setPetOwner,
  setPetStupidThing,
  type PetRow,
} from "../../pets";
import { PET_NO_PICTURE, PETS_PATH } from "../../pets-copy";
import { siteUrl } from "../capabilities";
import type { McpScope } from "../scope";
import { runTool, ToolError } from "../tool-utils";

// Camp pets (owner, 2026-10-09) over MCP, through the page's own facade
// (lib/pets.ts → @camp404/db/pets, or the E2E store).
//
//  - list_pets is listPets for this person, cut on the server as the page
//    is: every pet that is in, and the waiting ones that are theirs (all of
//    them for a captain). Never a photo, nor whether one exists: photos are
//    only for the member who sent them and the captains, on the page.
//  - The stupid thing is the pet's own member's (or a captain's): the write
//    reads which it is. The review is a captain's (the gate), and every
//    write re-reads the actor's rank inside its own transaction, with the
//    page's audit rows (pet.marked_in, pet.hint_changed, pet.owner_set,
//    pet.line_changed for a captain's change to someone else's pet).
//  - The hint and the stupid thing have no version on the row, so the tools
//    take the text the caller read (`expected`) and refuse when it is not
//    what is there now: a changed text is never overwritten unseen.
//  - Marking in writes the owner's in-app notice in the same transaction;
//    like the page, the delivery runs after the response.
//  - Sending a pet in needs its photos (an upload): on the page only.

const CHANGED = "Someone changed this pet first. Read the pets again.";

const PetId = z.string().min(1).max(64);

/** The pets this person may see, as the page reads them. */
export function petsFor(scope: McpScope): Promise<PetRow[]> {
  return listPets({ viewerId: scope.campUserId, isReviewer: scope.isCaptain });
}

export async function findPet(
  scope: McpScope,
  petId: string,
): Promise<PetRow | undefined> {
  return (await petsFor(scope)).find((p) => p.id === petId);
}

function parsed<T>(
  result: { success: true; data: T } | { success: false; error: z.ZodError },
  fallback: string,
): T {
  if (!result.success) {
    throw new ToolError(result.error.issues[0]?.message ?? fallback);
  }
  return result.data;
}

/** The owner's notice goes out after the response, as the page's does. */
function deliverNotices(): void {
  try {
    deliverAfterResponse();
  } catch {
    // Outside a request (no after()): the next page load's due work sends
    // anything left queued.
  }
}

export function registerPetsTools(server: McpServer): void {
  server.registerTool(
    "list_pets",
    {
      title: "List the camp's pets",
      description:
        "The camp's pets as Camp pets shows them to you: each pet's `id`, name, kind, the one stupid thing, whether it is in or waiting, its hint, whose it is and whether it is yours. Captains also get every waiting pet, each pet's picture and owner id, whether its owner may be changed, and the free pictures for mark_pet_in.",
      inputSchema: z.object({}),
    },
    async (_args, extra) =>
      runTool({
        toolName: "list_pets",
        extra,
        argsForAudit: null,
        handler: async ({ scope }) => {
          const reviewer = scope.isCaptain;
          const [pets, used] = await Promise.all([
            petsFor(scope),
            reviewer ? listUsedPetModuleKeys() : Promise.resolve([]),
          ]);
          return {
            pets: pets.map((p) => ({
              id: p.id,
              name: p.name,
              kind: p.kind,
              kindOther: p.kindOther,
              stupidThing: p.stupidThing,
              status: p.status,
              hint: p.hint,
              owner: p.ownerName,
              yours: p.ownerId !== null && p.ownerId === scope.campUserId,
              ...(reviewer
                ? {
                    ownerId: p.ownerId,
                    picture: p.moduleKey,
                    // Only a pet with no photos (a seeded one) changes hands.
                    ownerMayChange: !p.hasFrontPhoto && !p.hasSidePhoto,
                  }
                : {}),
            })),
            ...(reviewer
              ? { freePictures: unusedPetModuleKeys(PET_MODULE_KEYS, used) }
              : {}),
            url: siteUrl(PETS_PATH),
          };
        },
      }),
  );

  server.registerTool(
    "set_pet_stupid_thing",
    {
      title: "Change a pet's stupid thing",
      description:
        "Replaces the one stupid thing on your own pet (a captain: on any pet), as the pet card's edit does. Give the whole new text and `expected`, the text you read (list_pets); refused if it changed since.",
      inputSchema: z.object({
        petId: PetId,
        stupidThing: z.string().min(1).max(200),
        expected: z.string(),
      }),
    },
    async (args, extra) =>
      runTool({
        toolName: "set_pet_stupid_thing",
        extra,
        argsForAudit: { petId: args.petId },
        handler: async ({ scope }) => {
          const input = parsed(EditPetThingInput.safeParse(args), "Check it.");
          const pet = await findPet(scope, input.petId);
          if (!pet) throw new ToolError(PET_GONE);
          if (pet.stupidThing !== args.expected) throw new ToolError(CHANGED);
          const result = await setPetStupidThing({
            ...input,
            actorId: scope.campUserId,
          });
          if (!result.ok) throw new ToolError(result.error);
          return {
            petId: pet.id,
            name: pet.name,
            stupidThing: input.stupidThing,
          };
        },
      }),
  );

  server.registerTool(
    "mark_pet_in",
    {
      title: "Mark a pet in",
      description:
        "Marks a waiting pet in, as the review's Mark in does: its `picture` (one of list_pets' freePictures) and a `hint`, which every member reads. Its member gets a notice. Refused when someone marked it in first. Recorded in the camp's history under your name.",
      inputSchema: z.object({
        petId: PetId,
        picture: z.string().min(1).max(60),
        hint: z.string().min(1).max(200),
      }),
    },
    async (args, extra) =>
      runTool({
        toolName: "mark_pet_in",
        extra,
        argsForAudit: { petId: args.petId, picture: args.picture },
        handler: async ({ scope }) => {
          const input = parsed(
            MarkPetInInput.safeParse({
              petId: args.petId,
              moduleKey: args.picture,
              hint: args.hint,
            }),
            "Check the hint.",
          );
          // Only a picture the code has; the write refuses one another pet wears.
          if (!isPetModuleKey(input.moduleKey)) {
            throw new ToolError(PET_NO_PICTURE);
          }
          const result = await markPetIn({
            ...input,
            actorId: scope.campUserId,
          });
          if (!result.ok) throw new ToolError(result.error);
          deliverNotices();
          return { petId: input.petId, status: "in", hint: input.hint };
        },
      }),
  );

  server.registerTool(
    "set_pet_hint",
    {
      title: "Change a pet's hint",
      description:
        "Replaces the hint on a pet that is in, as the review's edit does. Every member reads the hint. Give the whole new hint and `expected`, the hint you read (list_pets); refused if it changed since. Recorded in the camp's history under your name.",
      inputSchema: z.object({
        petId: PetId,
        hint: z.string().min(1).max(200),
        expected: z.string().nullable(),
      }),
    },
    async (args, extra) =>
      runTool({
        toolName: "set_pet_hint",
        extra,
        argsForAudit: { petId: args.petId },
        handler: async ({ scope }) => {
          const input = parsed(
            EditPetHintInput.safeParse(args),
            "Check the hint.",
          );
          const pet = await findPet(scope, input.petId);
          if (!pet) throw new ToolError(PET_GONE);
          if (pet.hint !== args.expected) throw new ToolError(CHANGED);
          const result = await setPetHint({
            ...input,
            actorId: scope.campUserId,
          });
          if (!result.ok) throw new ToolError(result.error);
          return { petId: pet.id, name: pet.name, hint: input.hint };
        },
      }),
  );

  server.registerTool(
    "set_pet_owner",
    {
      title: "Say whose pet it is",
      description:
        "Says whose pet it is (`ownerId`, a member's id) or nobody's (null), as the review's owner picker does. Only for a pet with no photos (a seeded one): a pet a member sent in stays theirs. Recorded in the camp's history under your name.",
      inputSchema: z.object({
        petId: PetId,
        ownerId: z.string().uuid().nullable(),
      }),
    },
    async (args, extra) =>
      runTool({
        toolName: "set_pet_owner",
        extra,
        argsForAudit: args,
        handler: async ({ scope }) => {
          const input = parsed(
            SetPetOwnerInput.safeParse(args),
            "Pick a member.",
          );
          const result = await setPetOwner({
            ...input,
            actorId: scope.campUserId,
          });
          if (!result.ok) throw new ToolError(result.error);
          return { petId: input.petId, ownerId: input.ownerId };
        },
      }),
  );
}

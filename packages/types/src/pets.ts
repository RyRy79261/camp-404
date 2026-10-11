import { z } from "zod";

// Camp pets (owner, 2026-10-09): a member sends in their pet (a name, what it
// is, a photo from the front and one from the side, and one stupid thing about
// it), and a founder marks it "in" with a hint. The photos are for the founder
// alone to work from, so they are private to the member who sent them and the
// founders; the hint is everyone's. A pet that is in wears a picture drawn in
// code (@camp404/games/pets), keyed by `moduleKey`. Who may do what is
// @camp404/core's (pets.ts), never this shape's rule.

export const PET_KINDS = ["cat", "dog", "other"] as const;
export const PetKind = z.enum(PET_KINDS);
export type PetKind = z.infer<typeof PetKind>;

/** Where a pet stands: sent and waiting for a founder, or in. */
export const PET_STATUSES = ["waiting", "in"] as const;
export const PetStatus = z.enum(PET_STATUSES);
export type PetStatus = z.infer<typeof PetStatus>;

export const PET_NAME_MAX = 40;
export const PET_KIND_OTHER_MAX = 40;
export const PET_THING_MAX = 80;
export const PET_HINT_MAX = 80;

/** A picture key from the code's registry: lower-case words and dashes. */
export const PET_MODULE_KEY_PATTERN = /^[a-z][a-z0-9-]{0,39}$/;

/** Row ids, as the other inputs take them (the E2E store's are plain strings). */
const RowId = z.string().trim().min(1).max(64);

const Hint = z
  .string()
  .trim()
  .min(1, "Write a hint, one line.")
  .max(PET_HINT_MAX, `Keep the hint under ${PET_HINT_MAX} characters.`)
  .refine((v) => !/[\r\n]/.test(v), { message: "Keep the hint to one line." });

const StupidThing = z
  .string()
  .trim()
  .min(1, "Write one stupid thing about them.")
  .max(PET_THING_MAX, `Keep it under ${PET_THING_MAX} characters.`)
  .refine((v) => !/[\r\n]/.test(v), { message: "Keep it to one line." });

/**
 * A pet a member sends in, without its photos (the upload route checks
 * those). "Something else" needs the member's own word for it.
 */
export const PetInput = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Give your pet a name.")
      .max(PET_NAME_MAX, `Keep the name under ${PET_NAME_MAX} characters.`),
    kind: PetKind.or(z.literal("")).refine((v) => v !== "", {
      message: "Pick what it is.",
    }),
    kindOther: z
      .string()
      .trim()
      .max(
        PET_KIND_OTHER_MAX,
        `Keep it under ${PET_KIND_OTHER_MAX} characters.`,
      )
      .default(""),
    stupidThing: StupidThing,
  })
  .superRefine((v, ctx) => {
    if (v.kind === "other" && v.kindOther === "") {
      ctx.addIssue({
        code: "custom",
        path: ["kindOther"],
        message: "Say what kind of pet it is.",
      });
    }
  })
  .transform((v) => ({
    name: v.name,
    kind: v.kind as PetKind,
    // Only "Something else" keeps the member's own word.
    kindOther: v.kind === "other" ? v.kindOther : null,
    stupidThing: v.stupidThing,
  }));
export type PetInput = z.output<typeof PetInput>;

/** A founder marks a waiting pet in: its picture's key and the hint. */
export const MarkPetInInput = z.object({
  petId: RowId,
  moduleKey: z
    .string()
    .trim()
    .regex(PET_MODULE_KEY_PATTERN, "Pick a picture for it."),
  hint: Hint,
});
export type MarkPetInInput = z.infer<typeof MarkPetInInput>;

/** A founder changes the hint on a pet that is in. */
export const EditPetHintInput = z.object({
  petId: RowId,
  hint: Hint,
});
export type EditPetHintInput = z.infer<typeof EditPetHintInput>;

/** A founder says whose pet it is (a seeded pet has nobody yet). */
export const SetPetOwnerInput = z.object({
  petId: RowId,
  ownerId: RowId.nullable(),
});
export type SetPetOwnerInput = z.infer<typeof SetPetOwnerInput>;

/** The pet's member (or a founder) changes the one stupid thing. */
export const EditPetThingInput = z.object({
  petId: RowId,
  stupidThing: StupidThing,
});
export type EditPetThingInput = z.infer<typeof EditPetThingInput>;

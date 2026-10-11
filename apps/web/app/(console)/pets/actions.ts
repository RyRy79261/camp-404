"use server";

import { revalidatePath } from "next/cache";
import { isPetModuleKey } from "@camp404/games/pets";
import {
  EditPetHintInput,
  EditPetThingInput,
  MarkPetInInput,
  SetPetOwnerInput,
} from "@camp404/types";
import type { z } from "zod";
import { runAction, type ActionResult } from "@/lib/action-result";
import { getAuthenticatedUser } from "@/lib/auth";
import { deliverAfterResponse } from "@/lib/background-work";
import { captainActionGate } from "@/lib/captain-gate";
import {
  isPetReviewer,
  markPetIn,
  setPetHint,
  setPetOwner,
  setPetStupidThing,
} from "@/lib/pets";
import { PET_NO_PICTURE, PET_NOT_A_REVIEWER, PETS_PATH } from "@/lib/pets-copy";

// Camp pets' writes (owner, 2026-10-09). Every approved member may change the
// one stupid thing on their OWN pet; the write keeps them to their own. The
// rest is a reviewer's: a founder (FOUNDER_EMAILS, verified), checked here on
// the server before the write is called, since the database cannot know who
// the founders are. Marking in is a compare-and-set, audited in the same
// transaction as the owner's in-app notice, which goes out after the
// response.

type Reviewer = { ok: true; actorId: string };

/** An approved member who is also a verified founder. */
async function reviewerGate(): Promise<
  Reviewer | { ok: false; error: string }
> {
  const gate = await captainActionGate("camp_member");
  if (!gate.ok) return gate;
  const authUser = await getAuthenticatedUser();
  if (!authUser || !isPetReviewer(authUser)) {
    return { ok: false, error: PET_NOT_A_REVIEWER };
  }
  return { ok: true, actorId: gate.campUser.id };
}

function firstIssue(error: z.ZodError, fallback: string): string {
  return error.issues[0]?.message ?? fallback;
}

/** Mark a waiting pet in, with its picture and the hint. Founders only. */
export async function markPetInAction(input: unknown): Promise<ActionResult> {
  return runAction("markPetInAction", async () => {
    const gate = await reviewerGate();
    if (!gate.ok) return gate;
    const parsed = MarkPetInInput.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: firstIssue(parsed.error, "Check the hint.") };
    }
    // Only a picture the code has; the write refuses one another pet wears.
    if (!isPetModuleKey(parsed.data.moduleKey)) {
      return { ok: false, error: PET_NO_PICTURE };
    }
    const result = await markPetIn({ ...parsed.data, actorId: gate.actorId });
    if (!result.ok) return result;
    deliverAfterResponse();
    revalidatePath(PETS_PATH);
    return { ok: true };
  });
}

/** Change the hint on a pet that is in. Founders only. */
export async function editPetHintAction(input: unknown): Promise<ActionResult> {
  return runAction("editPetHintAction", async () => {
    const gate = await reviewerGate();
    if (!gate.ok) return gate;
    const parsed = EditPetHintInput.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: firstIssue(parsed.error, "Check the hint.") };
    }
    const result = await setPetHint({ ...parsed.data, actorId: gate.actorId });
    if (!result.ok) return result;
    revalidatePath(PETS_PATH);
    return { ok: true };
  });
}

/** Say whose pet it is. Founders only. */
export async function setPetOwnerAction(input: unknown): Promise<ActionResult> {
  return runAction("setPetOwnerAction", async () => {
    const gate = await reviewerGate();
    if (!gate.ok) return gate;
    const parsed = SetPetOwnerInput.safeParse(input);
    if (!parsed.success) return { ok: false, error: "Pick a member." };
    const result = await setPetOwner({ ...parsed.data, actorId: gate.actorId });
    if (!result.ok) return result;
    revalidatePath(PETS_PATH);
    return { ok: true };
  });
}

/** Change the one stupid thing: the pet's own member, or a founder. */
export async function editPetThingAction(
  input: unknown,
): Promise<ActionResult> {
  return runAction("editPetThingAction", async () => {
    const gate = await captainActionGate("camp_member");
    if (!gate.ok) return gate;
    const parsed = EditPetThingInput.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: firstIssue(parsed.error, "Check it.") };
    }
    const authUser = await getAuthenticatedUser();
    const result = await setPetStupidThing({
      ...parsed.data,
      actorId: gate.campUser.id,
      isReviewer: authUser ? isPetReviewer(authUser) : false,
    });
    if (!result.ok) return result;
    revalidatePath(PETS_PATH);
    return { ok: true };
  });
}

"use server";

import { revalidatePath } from "next/cache";
import type { z } from "zod";
import { canRunLounge } from "@camp404/core";
import {
  DecideLoungeOfferInput,
  EditLoungeOfferInput,
  LoungeMusicPolicyInput,
  LoungeOfferInput,
  PlaceLoungeOfferInput,
  RemoveLoungeSlotInput,
  WithdrawLoungeOfferInput,
} from "@camp404/types";
import { runAction, type ActionResult } from "@/lib/action-result";
import {
  captainActionGate,
  type CaptainActionAccess,
} from "@/lib/captain-gate";
import {
  addLoungeOffer,
  decideLoungeOffer,
  placeLoungeOffer,
  removeLoungeSlot,
  setLoungeMusicPolicy,
  updateLoungeOffer,
  withdrawLoungeOffer,
} from "@/lib/lounge";
import {
  CHECK_NOTE,
  CHECK_OFFER,
  CHECK_PLACE,
  LOUNGE_PATH,
  LOUNGE_PRINT_PATH,
  LOUNGE_REFUSAL,
} from "@/lib/lounge-copy";
import { getLeadTeams } from "@/lib/users";

// The lounge programme's writes (#269). Each action: the gate, the Zod
// boundary, then the facade with the actor's id alone. Offers are any approved
// member's (the gate at camp_member); the write itself keeps a member to their
// own offer. Deciding, placing and the music note are a captain's or a
// Ministry of Vibes lead's: the gate answers the screen, and the rule is
// checked again inside each write's own transaction (lockLoungeRunner), which
// re-reads the actor's rank and led teams and never takes a team list from
// here.

type Gate = Extract<CaptainActionAccess, { ok: true }>;

function firstIssue(error: z.ZodError, fallback: string): string {
  return error.issues[0]?.message ?? fallback;
}

function revalidateLounge(): void {
  revalidatePath(LOUNGE_PATH);
  revalidatePath(LOUNGE_PRINT_PATH);
}

/**
 * The runner's gate: the rank gate at team_lead (clearance is global), then
 * canRunLounge on the teams they lead, so a lead of another team is told here
 * rather than by the write.
 */
async function runnerGate(): Promise<Gate | { ok: false; error: string }> {
  const gate = await captainActionGate("team_lead", LOUNGE_REFUSAL);
  if (!gate.ok) return gate;
  const led =
    gate.rank === "captain" ? [] : await getLeadTeams(gate.campUser.id);
  if (!canRunLounge(gate.rank, led)) {
    return { ok: false, error: LOUNGE_REFUSAL };
  }
  return gate;
}

/** Offer an activity or a DJ set. Any approved member. */
export async function offerAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  return runAction("loungeOfferAction", async () => {
    const gate = await captainActionGate("camp_member");
    if (!gate.ok) return gate;
    const parsed = LoungeOfferInput.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: firstIssue(parsed.error, CHECK_OFFER) };
    }
    const result = await addLoungeOffer({
      ...parsed.data,
      actorId: gate.campUser.id,
    });
    if (!result.ok) return result;
    revalidateLounge();
    return { ok: true, data: { id: result.id } };
  });
}

/** Change your own offer while it waits or has been sent back. */
export async function editOfferAction(input: unknown): Promise<ActionResult> {
  return runAction("loungeEditOfferAction", async () => {
    const gate = await captainActionGate("camp_member");
    if (!gate.ok) return gate;
    const parsed = EditLoungeOfferInput.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: firstIssue(parsed.error, CHECK_OFFER) };
    }
    const result = await updateLoungeOffer({
      ...parsed.data,
      actorId: gate.campUser.id,
    });
    if (!result.ok) return result;
    revalidateLounge();
    return { ok: true };
  });
}

/** Take your own offer back; it comes off the programme too. */
export async function withdrawOfferAction(
  input: unknown,
): Promise<ActionResult> {
  return runAction("loungeWithdrawOfferAction", async () => {
    const gate = await captainActionGate("camp_member");
    if (!gate.ok) return gate;
    const parsed = WithdrawLoungeOfferInput.safeParse(input);
    if (!parsed.success) return { ok: false, error: CHECK_OFFER };
    const result = await withdrawLoungeOffer({
      ...parsed.data,
      actorId: gate.campUser.id,
    });
    if (!result.ok) return result;
    revalidateLounge();
    return { ok: true };
  });
}

/** Accept, decline or send back an offer (compare-and-set, audited). */
export async function decideOfferAction(input: unknown): Promise<ActionResult> {
  return runAction("loungeDecideOfferAction", async () => {
    const gate = await runnerGate();
    if (!gate.ok) return gate;
    const parsed = DecideLoungeOfferInput.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: firstIssue(parsed.error, CHECK_OFFER) };
    }
    const result = await decideLoungeOffer({
      ...parsed.data,
      actorId: gate.campUser.id,
    });
    if (!result.ok) return result;
    revalidateLounge();
    return { ok: true };
  });
}

/** Put an accepted offer on the programme (audited). */
export async function placeOfferAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  return runAction("loungePlaceOfferAction", async () => {
    const gate = await runnerGate();
    if (!gate.ok) return gate;
    const parsed = PlaceLoungeOfferInput.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: firstIssue(parsed.error, CHECK_PLACE) };
    }
    const result = await placeLoungeOffer({
      ...parsed.data,
      actorId: gate.campUser.id,
    });
    if (!result.ok) return result;
    revalidateLounge();
    return { ok: true, data: { id: result.id } };
  });
}

/** Take one item off the programme (audited). */
export async function removeSlotAction(input: unknown): Promise<ActionResult> {
  return runAction("loungeRemoveSlotAction", async () => {
    const gate = await runnerGate();
    if (!gate.ok) return gate;
    const parsed = RemoveLoungeSlotInput.safeParse(input);
    if (!parsed.success) return { ok: false, error: CHECK_PLACE };
    const result = await removeLoungeSlot({
      ...parsed.data,
      actorId: gate.campUser.id,
    });
    if (!result.ok) return result;
    revalidateLounge();
    return { ok: true };
  });
}

/** The team's music note for DJs, this year (audited). */
export async function saveMusicPolicyAction(
  input: unknown,
): Promise<ActionResult<{ version: number }>> {
  return runAction("loungeSaveMusicPolicyAction", async () => {
    const gate = await runnerGate();
    if (!gate.ok) return gate;
    const parsed = LoungeMusicPolicyInput.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: firstIssue(parsed.error, CHECK_NOTE) };
    }
    const result = await setLoungeMusicPolicy({
      ...parsed.data,
      actorId: gate.campUser.id,
    });
    if (!result.ok) return result;
    revalidateLounge();
    return { ok: true, data: { version: result.version } };
  });
}

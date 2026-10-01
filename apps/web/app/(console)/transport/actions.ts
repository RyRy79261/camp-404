"use server";

import { revalidatePath } from "next/cache";
import type { z } from "zod";
import {
  CarMessageInput,
  CarSeatInput,
  EditTrailerInput,
  LiftRequestAnswerInput,
  LiftRequestInput,
  RemoveTrailerInput,
  SeatsOfferedInput,
  TowInput,
  TrailerInput,
} from "@camp404/types";
import { runAction, type ActionResult } from "@/lib/action-result";
import { deliverAfterResponse } from "@/lib/background-work";
import { captainActionGate } from "@/lib/captain-gate";
import {
  addRider,
  addTrailer,
  answerLiftRequest,
  removeRider,
  removeTrailer,
  requestLift,
  sendCarMessage,
  setSeatsOffered,
  setTrailerTow,
  updateTrailer,
  withdrawLiftRequest,
} from "@/lib/transport";
import { CHECK_FORM, LIFT_PATH, TRANSPORT_PATH } from "@/lib/transport-copy";

// The Transport page's writes (#270). Each action: the member gate (any
// approved member reaches it), the Zod boundary (every shape is strict, so a
// field the screen never sends is refused), then the facade with the actor's
// id alone. Who may do what is decided INSIDE each write's transaction from
// rows it reads and locks (canManageCar, canEditTransport, canRemoveRider,
// canSendToAudience's `car` scope); nothing here passes a rank, a team, a car
// to message or a rider list.

function firstIssue(error: z.ZodError, fallback = CHECK_FORM): string {
  return error.issues[0]?.message ?? fallback;
}

async function memberGate() {
  return captainActionGate("camp_member");
}

function done(result: { ok: boolean; error?: string }): ActionResult {
  if (!result.ok) return { ok: false, error: result.error ?? CHECK_FORM };
  revalidatePath(TRANSPORT_PATH);
  revalidatePath(LIFT_PATH);
  return { ok: true };
}

export async function addRiderAction(input: unknown): Promise<ActionResult> {
  return runAction("addRiderAction", async () => {
    const gate = await memberGate();
    if (!gate.ok) return gate;
    const parsed = CarSeatInput.safeParse(input);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
    return done(await addRider({ ...parsed.data, actorId: gate.campUser.id }));
  });
}

export async function removeRiderAction(input: unknown): Promise<ActionResult> {
  return runAction("removeRiderAction", async () => {
    const gate = await memberGate();
    if (!gate.ok) return gate;
    const parsed = CarSeatInput.safeParse(input);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
    return done(
      await removeRider({ ...parsed.data, actorId: gate.campUser.id }),
    );
  });
}

export async function setSeatsAction(input: unknown): Promise<ActionResult> {
  return runAction("setSeatsAction", async () => {
    const gate = await memberGate();
    if (!gate.ok) return gate;
    const parsed = SeatsOfferedInput.safeParse(input);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
    return done(
      await setSeatsOffered({ ...parsed.data, actorId: gate.campUser.id }),
    );
  });
}

export async function requestLiftAction(input: unknown): Promise<ActionResult> {
  return runAction("requestLiftAction", async () => {
    const gate = await memberGate();
    if (!gate.ok) return gate;
    const parsed = LiftRequestInput.safeParse(input);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
    return done(
      await requestLift({ ...parsed.data, actorId: gate.campUser.id }),
    );
  });
}

export async function withdrawLiftRequestAction(): Promise<ActionResult> {
  return runAction("withdrawLiftRequestAction", async () => {
    const gate = await memberGate();
    if (!gate.ok) return gate;
    return done(await withdrawLiftRequest({ actorId: gate.campUser.id }));
  });
}

export async function answerLiftRequestAction(
  input: unknown,
): Promise<ActionResult> {
  return runAction("answerLiftRequestAction", async () => {
    const gate = await memberGate();
    if (!gate.ok) return gate;
    const parsed = LiftRequestAnswerInput.safeParse(input);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
    return done(
      await answerLiftRequest({ ...parsed.data, actorId: gate.campUser.id }),
    );
  });
}

export async function addTrailerAction(input: unknown): Promise<ActionResult> {
  return runAction("addTrailerAction", async () => {
    const gate = await memberGate();
    if (!gate.ok) return gate;
    const parsed = TrailerInput.safeParse(input);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
    return done(
      await addTrailer({ ...parsed.data, actorId: gate.campUser.id }),
    );
  });
}

export async function updateTrailerAction(
  input: unknown,
): Promise<ActionResult> {
  return runAction("updateTrailerAction", async () => {
    const gate = await memberGate();
    if (!gate.ok) return gate;
    const parsed = EditTrailerInput.safeParse(input);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
    return done(
      await updateTrailer({ ...parsed.data, actorId: gate.campUser.id }),
    );
  });
}

export async function setTowAction(input: unknown): Promise<ActionResult> {
  return runAction("setTowAction", async () => {
    const gate = await memberGate();
    if (!gate.ok) return gate;
    const parsed = TowInput.safeParse(input);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
    return done(
      await setTrailerTow({ ...parsed.data, actorId: gate.campUser.id }),
    );
  });
}

export async function removeTrailerAction(
  input: unknown,
): Promise<ActionResult> {
  return runAction("removeTrailerAction", async () => {
    const gate = await memberGate();
    if (!gate.ok) return gate;
    const parsed = RemoveTrailerInput.safeParse(input);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
    return done(
      await removeTrailer({ ...parsed.data, actorId: gate.campUser.id }),
    );
  });
}

/**
 * A driver writes to the people in their car. The input is the title and the
 * body only; a car, driver or rider field is refused by the strict schema, and
 * the write reads the sender's own car itself.
 */
export async function sendCarMessageAction(
  input: unknown,
): Promise<ActionResult<{ recipientCount: number }>> {
  return runAction("sendCarMessageAction", async () => {
    const gate = await memberGate();
    if (!gate.ok) return gate;
    const parsed = CarMessageInput.safeParse(input);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
    const result = await sendCarMessage({
      ...parsed.data,
      senderId: gate.campUser.id,
    });
    if (!result.ok) return result;
    deliverAfterResponse();
    return { ok: true, data: { recipientCount: result.recipientCount } };
  });
}

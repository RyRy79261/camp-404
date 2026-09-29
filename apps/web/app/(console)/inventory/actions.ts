"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  EditInventoryItemInput,
  EditInventoryNeedInput,
  InventoryBookingInput,
  InventoryItemInput,
  InventoryLoanInput,
  InventoryNeedInput,
  InventoryPledgeInput,
  InventoryProposalInput,
  InventoryReviewInput,
} from "@camp404/types";
import { runAction, type ActionResult } from "@/lib/action-result";
import { captainActionGate } from "@/lib/captain-gate";
import {
  addInventoryItem,
  addInventoryNeed,
  archiveInventoryItem,
  bookInventoryItem,
  cancelInventoryBooking,
  lendInventoryItem,
  pledgeToNeed,
  proposeInventoryChange,
  removeInventoryNeed,
  returnInventoryLoan,
  reviewInventoryChange,
  updateInventoryItem,
  updateInventoryNeed,
  withdrawPledge,
  type InventoryWriteResult,
} from "@/lib/inventory";
import {
  CHECK_CHANGE,
  CHECK_ITEM,
  CHECK_LOAN,
  CHECK_NEED,
  INVENTORY_PATH,
} from "@/lib/inventory-copy";

// The inventory's writes (#246). Each action: the member gate (any approved
// member may reach it), the Zod boundary, then the facade with the actor's id
// alone. Who may change a team's gear (a captain or a lead of that team) is
// decided inside each write's own transaction (lockInventoryEditor), which
// re-reads the actor's rank and led teams and never takes a team list from
// here. Proposals, pledges and bookings are open to every member.

function firstIssue(error: z.ZodError, fallback: string): string {
  return error.issues[0]?.message ?? fallback;
}

/** Every inventory page reads the same rows, so they refresh together. */
function revalidateInventory(): void {
  revalidatePath(INVENTORY_PATH, "layout");
}

const Id = z.guid();
const ArchiveInput = z.object({
  itemId: Id,
  expectedVersion: z.number().int().min(1),
});
const RemoveNeedInput = z.object({
  needId: Id,
  expectedVersion: z.number().int().min(1),
});
const NeedIdInput = z.object({ needId: Id });
const BookingIdInput = z.object({ bookingId: Id });
const LoanIdInput = z.object({ loanId: Id });

/**
 * One action's shape: the gate, the parse, the write, and a refresh when it
 * went through. `data` picks what the caller gets back.
 */
async function act<S extends z.ZodType, R extends object, D = undefined>(
  label: string,
  schema: S,
  input: unknown,
  fallback: string,
  run: (
    parsed: z.infer<S>,
    actorId: string,
  ) => Promise<InventoryWriteResult<R>>,
  data?: (result: R) => D,
): Promise<ActionResult<D>> {
  return runAction(label, async () => {
    const gate = await captainActionGate("camp_member");
    if (!gate.ok) return gate;
    const parsed = schema.safeParse(input);
    if (!parsed.success) {
      return { ok: false as const, error: firstIssue(parsed.error, fallback) };
    }
    const result = await run(parsed.data, gate.campUser.id);
    if (!result.ok) return { ok: false as const, error: result.error };
    revalidateInventory();
    return (
      data ? { ok: true, data: data(result) } : { ok: true }
    ) as ActionResult<D>;
  }) as Promise<ActionResult<D>>;
}

export async function addItemAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  return act(
    "addItemAction",
    InventoryItemInput,
    input,
    CHECK_ITEM,
    (item, actorId) => addInventoryItem({ ...item, actorId }),
    (r) => ({ id: r.id }),
  );
}

export async function updateItemAction(input: unknown): Promise<ActionResult> {
  return act(
    "updateItemAction",
    EditInventoryItemInput,
    input,
    CHECK_ITEM,
    (item, actorId) => updateInventoryItem({ ...item, actorId }),
  );
}

export async function archiveItemAction(input: unknown): Promise<ActionResult> {
  return act(
    "archiveItemAction",
    ArchiveInput,
    input,
    CHECK_ITEM,
    (p, actorId) => archiveInventoryItem({ ...p, actorId }),
  );
}

export async function proposeChangeAction(
  input: unknown,
): Promise<ActionResult> {
  return act(
    "proposeChangeAction",
    InventoryProposalInput,
    input,
    CHECK_CHANGE,
    (p, actorId) => proposeInventoryChange({ ...p, actorId }),
  );
}

export async function reviewChangeAction(
  input: unknown,
): Promise<ActionResult> {
  return act(
    "reviewChangeAction",
    InventoryReviewInput,
    input,
    CHECK_CHANGE,
    (p, actorId) => reviewInventoryChange({ ...p, actorId }),
  );
}

export async function addNeedAction(input: unknown): Promise<ActionResult> {
  return act(
    "addNeedAction",
    InventoryNeedInput,
    input,
    CHECK_NEED,
    (p, actorId) => addInventoryNeed({ ...p, actorId }),
  );
}

export async function updateNeedAction(input: unknown): Promise<ActionResult> {
  return act(
    "updateNeedAction",
    EditInventoryNeedInput,
    input,
    CHECK_NEED,
    (p, actorId) => updateInventoryNeed({ ...p, actorId }),
  );
}

export async function removeNeedAction(input: unknown): Promise<ActionResult> {
  return act(
    "removeNeedAction",
    RemoveNeedInput,
    input,
    CHECK_NEED,
    (p, actorId) => removeInventoryNeed({ ...p, actorId }),
  );
}

export async function pledgeAction(input: unknown): Promise<ActionResult> {
  return act(
    "pledgeAction",
    InventoryPledgeInput,
    input,
    CHECK_NEED,
    (p, actorId) => pledgeToNeed({ ...p, actorId }),
  );
}

export async function withdrawPledgeAction(
  input: unknown,
): Promise<ActionResult> {
  return act(
    "withdrawPledgeAction",
    NeedIdInput,
    input,
    CHECK_NEED,
    (p, actorId) => withdrawPledge({ ...p, actorId }),
  );
}

export async function bookItemAction(input: unknown): Promise<ActionResult> {
  return act(
    "bookItemAction",
    InventoryBookingInput,
    input,
    CHECK_ITEM,
    (p, actorId) => bookInventoryItem({ ...p, actorId }),
  );
}

export async function cancelBookingAction(
  input: unknown,
): Promise<ActionResult> {
  return act(
    "cancelBookingAction",
    BookingIdInput,
    input,
    CHECK_ITEM,
    (p, actorId) => cancelInventoryBooking({ ...p, actorId }),
  );
}

export async function lendItemAction(input: unknown): Promise<ActionResult> {
  return act(
    "lendItemAction",
    InventoryLoanInput,
    input,
    CHECK_LOAN,
    (p, actorId) => lendInventoryItem({ ...p, actorId }),
  );
}

export async function returnLoanAction(input: unknown): Promise<ActionResult> {
  return act("returnLoanAction", LoanIdInput, input, CHECK_LOAN, (p, actorId) =>
    returnInventoryLoan({ ...p, actorId }),
  );
}

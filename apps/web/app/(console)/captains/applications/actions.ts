"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { DDT_STATUSES, WAP_STATUSES } from "@camp404/types";
import { runAction } from "@/lib/action-result";
import { captainActionGate } from "@/lib/captain-gate";
import { setTicketPass } from "@/lib/tickets";
import { findCampUserById } from "@/lib/users";

// The Applications page's own write (#238): a captain records a member's
// DDT or WAP. The Accept / Waiting list buttons on
// the same page reuse the roster's decideParticipationAction.

export type TicketPassResult = { ok: true } | { ok: false; error: string };

const TicketPassInput = z.discriminatedUnion("pass", [
  z.object({
    userId: z.string().min(1),
    pass: z.literal("ddt"),
    from: z.enum(DDT_STATUSES),
    to: z.enum(DDT_STATUSES),
  }),
  z.object({
    userId: z.string().min(1),
    pass: z.literal("wap"),
    from: z.enum(WAP_STATUSES),
    to: z.enum(WAP_STATUSES),
  }),
]);

/**
 * A captain changes a member's DDT or WAP for this
 * year. Captains only: a team lead reads who is coming and nothing of the
 * tickets. A compare-and-set on `from`, the value the captain saw, so a
 * change another captain made first is not overwritten; the captain is told
 * instead. The write audits itself in the same transaction.
 */
export async function setTicketPassAction(input: {
  userId: string;
  pass: string;
  from: string;
  to: string;
}): Promise<TicketPassResult> {
  return runAction("setTicketPassAction", async () => {
    const gate = await captainActionGate("captain");
    if (!gate.ok) return gate;

    const parsed = TicketPassInput.safeParse(input);
    if (!parsed.success) return { ok: false, error: "Unknown change." };
    const change = parsed.data;
    if (change.from === change.to) return { ok: true };

    const target = await findCampUserById(change.userId);
    if (!target) return { ok: false, error: "Member not found." };

    const saved = await setTicketPass({
      ...change,
      actorUserId: gate.campUser.id,
    });
    // Either way: on a lost race the page the captain sees is stale.
    revalidatePath("/captains/applications");
    revalidatePath("/captains/overview");
    if (!saved) {
      const name = target.displayName?.trim() || "This member";
      return {
        ok: false,
        error: `${name}'s ticket changed while you were looking. Refresh to see it.`,
      };
    }
    return { ok: true };
  });
}

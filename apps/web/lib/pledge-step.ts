import "server-only";

import { getMemberDues } from "./dues";
import { getFeeScale } from "./join-site";
import { getMyParticipation } from "./participations";
import { ledgerCycle } from "./payments";
import type { PledgeStepProps } from "@/components/dues/pledge-step";

// What "What can you commit?" needs after a Coming answer (camp fees sprint,
// mock-up step 3): the Join site's scale for the year, the member's own
// pledge if they made one, and whether their fee is charged (then only "by
// when" and the subsidy answer may change). The member's own figures only;
// the caller has gated the page.

export interface PledgeStepData {
  scale: PledgeStepProps["scale"];
  burnYear: number;
  pledge: PledgeStepProps["pledge"];
  /** With no pledge, the "by when" a questionnaire answer already gave. */
  knownPayBy: PledgeStepProps["knownPayBy"];
  amountLocked: boolean;
}

/**
 * The pledge step for a member who said Coming this year, or null: they said
 * Maybe or Not coming, have not answered, or have no dues account.
 */
export async function getPledgeStep(
  userId: string,
): Promise<PledgeStepData | null> {
  const participation = await getMyParticipation(userId);
  if (participation?.intent !== "yes") return null;
  const cycle = await ledgerCycle();
  const [dues, scale] = await Promise.all([
    getMemberDues(userId, cycle, { forFinance: false }),
    getFeeScale(cycle),
  ]);
  if (!dues) return null;
  return {
    scale,
    burnYear: dues.burnYear,
    pledge: dues.pledge
      ? {
          amountCents: dues.pledge.amountCents,
          payBy: dues.payBy,
          subsidy: dues.subsidy,
        }
      : null,
    knownPayBy: dues.payBy,
    amountLocked: dues.charges.some((c) => c.kind === "fee" && !c.cancelled),
  };
}

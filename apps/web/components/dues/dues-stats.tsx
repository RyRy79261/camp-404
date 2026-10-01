import {
  formatMoney,
  paymentFigures,
  sumMinor,
  type PaymentFigures,
} from "@camp404/core";
import type { DuesAccountRow } from "@/lib/dues";
import { Card, CardContent } from "@camp404/ui/components/card";
import { cn } from "@camp404/ui/lib/utils";
import { formatDay } from "@/lib/dues-view";

// The year's dues as four figures in a row (#240), the same on the ledger and
// on Who owes what, so a figure reads the same on every Finance tab: who is
// paid up (of the members charged a fee, never the whole roster), what is
// still to come in, what is in the bank (money only; excused dues apart), and
// what is to check (proofs members sent, and payments recorded by hand as
// promised). Two by two on a phone, so the members start on the first screen.
// Server-safe.

export interface DuesStatsFigures {
  paidUp: number;
  charged: number;
  owingCents: number;
  owingCount: number;
  inBankCents: number;
  excusedCents: number;
  toCheckCents: number;
  toCheckCount: number;
  promisedCents: number;
}

/**
 * The figures, from every member's account for the year. Pure. Pass the
 * year's ledger to read the money from it instead: the Payments tab lists
 * every payment (a member waiting for approval, an erased member's too), so
 * its money figures add up to the rows below them.
 */
export function duesStatsFigures(
  rows: readonly Pick<DuesAccountRow, "balance" | "figures">[],
  ledger?: Parameters<typeof paymentFigures>[0],
): DuesStatsFigures {
  const charged = rows.filter((r) => r.balance.chargedCents > 0);
  const owing = rows.filter((r) => r.balance.balanceCents > 0);
  const sum = (pick: (r: (typeof rows)[number]) => number) =>
    sumMinor(rows.map(pick));
  const money: Omit<PaymentFigures, "promisedCount"> = ledger
    ? paymentFigures(ledger)
    : {
        inBankCents: sum((r) => r.figures.inBankCents),
        excusedCents: sum((r) => r.figures.excusedCents),
        toCheckCents: sum((r) => r.figures.toCheckCents),
        toCheckCount: sum((r) => r.figures.toCheckCount),
        promisedCents: sum((r) => r.figures.promisedCents),
      };
  return {
    paidUp: charged.filter((r) => r.balance.balanceCents <= 0).length,
    charged: charged.length,
    owingCents: sumMinor(owing.map((r) => r.balance.balanceCents)),
    owingCount: owing.length,
    inBankCents: money.inBankCents,
    excusedCents: money.excusedCents,
    toCheckCents: money.toCheckCents,
    toCheckCount: money.toCheckCount,
    promisedCents: money.promisedCents,
  };
}

function Stat({
  term,
  value,
  hint,
}: {
  term: string;
  value: string;
  hint: string;
}) {
  return (
    <div
      role="group"
      aria-label={term}
      className="flex min-w-0 flex-col gap-0.5"
    >
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {term}
      </dt>
      <dd className="text-lg font-bold tabular-nums page-sm:text-2xl">
        {value}
      </dd>
      <dd className="text-xs text-muted-foreground">{hint}</dd>
    </div>
  );
}

export function DuesStats({
  figures: f,
  deadline,
  className,
}: {
  figures: DuesStatsFigures;
  /** The year's pay-by day, YYYY-MM-DD, or null when none is set. */
  deadline: string | null;
  className?: string;
}) {
  const owe =
    f.owingCount === 1 ? "1 member owes" : `${f.owingCount} members owe`;
  const sentIn =
    f.toCheckCount === 1
      ? "1 proof sent in"
      : `${f.toCheckCount} proofs sent in`;
  return (
    <Card className={cn(className)}>
      <CardContent className="p-4 page-sm:p-5">
        <dl
          aria-label="This year's dues"
          className="grid grid-cols-2 gap-x-6 gap-y-4 page-md:grid-cols-4"
        >
          <Stat
            term="Paid up"
            value={f.charged === 0 ? "—" : `${f.paidUp} of ${f.charged}`}
            hint={
              f.charged === 0
                ? "Nobody is charged a fee yet"
                : "members charged a fee"
            }
          />
          <Stat
            term="Still to come in"
            value={formatMoney(f.owingCents)}
            hint={deadline ? `${owe} · by ${formatDay(deadline)}` : owe}
          />
          <Stat
            term="In the bank"
            value={formatMoney(f.inBankCents)}
            hint={
              f.excusedCents > 0
                ? `${formatMoney(f.excusedCents)} excused`
                : "Money seen in the bank"
            }
          />
          <Stat
            term="To check"
            value={formatMoney(f.toCheckCents + f.promisedCents)}
            hint={
              f.promisedCents > 0
                ? `${sentIn} · ${formatMoney(f.promisedCents)} promised`
                : sentIn
            }
          />
        </dl>
      </CardContent>
    </Card>
  );
}

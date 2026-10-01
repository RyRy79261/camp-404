import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { DuesBalance, PaymentFigures } from "@camp404/core";
import { DuesStats, duesStatsFigures } from "./dues-stats";

// The year's four figures on the ledger and on Who owes what. "Paid up"
// counts only members charged a fee (never the waiting list or someone who
// has not answered), and the money is kept apart: in the bank, excused, sent
// in to check, promised. Intl writes no-break spaces, so money is matched
// with \s.

afterEach(cleanup);

const NONE: PaymentFigures = {
  inBankCents: 0,
  excusedCents: 0,
  toCheckCents: 0,
  toCheckCount: 0,
  promisedCents: 0,
  promisedCount: 0,
};

function row(
  balance: Partial<DuesBalance>,
  figures: Partial<PaymentFigures> = {},
) {
  return {
    balance: {
      chargedCents: 0,
      paidCents: 0,
      pendingCents: 0,
      refundedCents: 0,
      balanceCents: 0,
      ...balance,
    },
    figures: { ...NONE, ...figures },
  };
}

const ROWS = [
  // Paid up in the bank.
  row({ chargedCents: 250000, paidCents: 250000 }, { inBankCents: 250000 }),
  // Paid up by an excused amount.
  row({ chargedCents: 150000, paidCents: 150000 }, { excusedCents: 150000 }),
  // Owes, with a proof sent in.
  row(
    { chargedCents: 250000, pendingCents: 250000, balanceCents: 250000 },
    { toCheckCents: 250000, toCheckCount: 1 },
  ),
  // Owes, with a payment promised by hand.
  row(
    { chargedCents: 250000, pendingCents: 120000, balanceCents: 250000 },
    { promisedCents: 120000, promisedCount: 1 },
  ),
  // The waiting list and no answer: nothing charged, not counted.
  row({}),
  row({}),
];

describe("duesStatsFigures", () => {
  it("counts paid up out of the members charged a fee, not the roster", () => {
    const f = duesStatsFigures(ROWS);
    expect(f.paidUp).toBe(2);
    expect(f.charged).toBe(4);
    expect(f.owingCount).toBe(2);
    expect(f.owingCents).toBe(500000);
    expect(f.inBankCents).toBe(250000);
    expect(f.excusedCents).toBe(150000);
    expect(f.toCheckCents).toBe(250000);
    expect(f.promisedCents).toBe(120000);
  });
});

describe("DuesStats", () => {
  it("shows the four figures, with excused and promised money named apart", () => {
    render(
      <DuesStats figures={duesStatsFigures(ROWS)} deadline="2027-03-15" />,
    );
    const paid = screen.getByRole("group", { name: "Paid up" });
    expect(paid.textContent).toContain("2 of 4");
    const owing = screen.getByRole("group", { name: "Still to come in" });
    expect(owing.textContent).toMatch(/R\s5\s000,00/);
    expect(owing.textContent).toContain("2 members owe · by 15 Mar 2027");
    const bank = screen.getByRole("group", { name: "In the bank" });
    expect(within(bank).getByText(/^R\s2\s500,00$/)).toBeTruthy();
    expect(bank.textContent).toMatch(/R\s1\s500,00 excused/);
    const check = screen.getByRole("group", { name: "To check" });
    expect(within(check).getByText(/^R\s3\s700,00$/)).toBeTruthy();
    expect(check.textContent).toMatch(
      /1 proof sent in · R\s1\s200,00 promised/,
    );
  });

  it("says nobody is charged yet instead of a count of nothing", () => {
    render(<DuesStats figures={duesStatsFigures([row({})])} deadline={null} />);
    const paid = screen.getByRole("group", { name: "Paid up" });
    expect(paid.textContent).toContain("Nobody is charged a fee yet");
  });
});

import { describe, expect, it } from "vitest";
import {
  BudgetInput,
  ClaimDecisionInput,
  ClaimInput,
  ClaimPayInput,
  ClaimRefInput,
} from "../claims";

// The shapes a claim or a budget form sends (#242). Money is whole cents,
// already parsed; a blank note means none.

const claim = {
  team: "kitchen",
  description: "  Gas bottle refill ",
  amountCents: 45000,
  spentOn: "2027-03-02",
  accountType: "sa",
  accountDetails: "FNB 62000000000",
};

const first = (r: {
  success: boolean;
  error?: { issues: { message: string }[] };
}) => (r.success ? null : r.error!.issues[0]!.message);

describe("ClaimInput", () => {
  it("takes a whole claim and trims its text", () => {
    const parsed = ClaimInput.parse(claim);
    expect(parsed.description).toBe("Gas bottle refill");
  });

  it("refuses what a member could get wrong, in their words", () => {
    expect(first(ClaimInput.safeParse({ ...claim, team: "bar" }))).toBe(
      "Pick the team it was for.",
    );
    expect(first(ClaimInput.safeParse({ ...claim, description: " " }))).toBe(
      "Say what you bought.",
    );
    expect(first(ClaimInput.safeParse({ ...claim, amountCents: 0 }))).toBe(
      "The amount must be more than R0.",
    );
    expect(first(ClaimInput.safeParse({ ...claim, amountCents: 1.5 }))).toMatch(
      /^Type the amount in rands/,
    );
    expect(
      first(ClaimInput.safeParse({ ...claim, spentOn: "2027-02-30" })),
    ).toBe("Pick the day you bought it.");
    expect(
      first(ClaimInput.safeParse({ ...claim, accountType: "crypto" })),
    ).toBe("Pick where your bank is.");
    expect(first(ClaimInput.safeParse({ ...claim, accountDetails: "" }))).toBe(
      "Add the bank account to pay you back into.",
    );
  });
});

describe("decisions and budgets", () => {
  it("reads a blank note as none", () => {
    expect(
      ClaimDecisionInput.parse({
        claimId: "c1",
        decision: "rejected",
        note: " ",
      }).note,
    ).toBeNull();
    expect(
      ClaimPayInput.parse({ claimId: "c1", decision: "paid" }).note,
    ).toBeNull();
    expect(ClaimRefInput.safeParse({ claimId: "" }).success).toBe(false);
    expect(
      ClaimDecisionInput.safeParse({ claimId: "c1", decision: "paid" }).success,
    ).toBe(false);
  });

  it("takes a budget of R0 or more, or none", () => {
    expect(
      BudgetInput.parse({
        team: "kitchen",
        amountCents: 0,
        expectedCents: null,
      }),
    ).toMatchObject({ amountCents: 0 });
    expect(
      BudgetInput.parse({
        team: "kitchen",
        amountCents: null,
        expectedCents: 5,
      }),
    ).toMatchObject({ amountCents: null });
    expect(
      first(
        BudgetInput.safeParse({
          team: "kitchen",
          amountCents: -1,
          expectedCents: null,
        }),
      ),
    ).toBe("A budget can't be below R0.");
  });
});

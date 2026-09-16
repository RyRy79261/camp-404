import { describe, expect, it } from "vitest";
import {
  tallyActivationCompletion,
  type RequiredActionStatus,
} from "../questionnaire-results";

// The arithmetic here is a product decision, not a formula: which rows land in
// the denominator decides what number a captain reads off the screen. The
// donor counted `waived` and `expired` as pending; `docs/questionnaire-builder
// .md:390` excludes them. Every case below pins one half of that difference.

function rows(
  counts: Partial<Record<RequiredActionStatus, number>>,
): RequiredActionStatus[] {
  const out: RequiredActionStatus[] = [];
  for (const [status, n] of Object.entries(counts)) {
    for (let i = 0; i < (n ?? 0); i += 1) {
      out.push(status as RequiredActionStatus);
    }
  }
  return out;
}

describe("tallyActivationCompletion", () => {
  it("counts completion over pending + completed only", () => {
    // 6 completed, 4 pending, 10 waived/expired. Over every row that is 30%;
    // over the eligible ten it is 60%. The pinned answer is 60.
    const tally = tallyActivationCompletion(
      rows({ completed: 6, pending: 4, waived: 5, expired: 5 }),
    );

    expect(tally.sent).toBe(20);
    expect(tally.completed).toBe(6);
    expect(tally.pending).toBe(4);
    expect(tally.closed).toBe(10);
    expect(tally.eligible).toBe(10);
    expect(tally.completionPct).toBe(60);
  });

  it("does NOT count waived or expired rows as pending", () => {
    // The donor's arithmetic would give pending: 3 and completionPct: 25.
    const tally = tallyActivationCompletion(
      rows({ completed: 1, waived: 1, expired: 2 }),
    );
    expect(tally.pending).toBe(0);
    expect(tally.closed).toBe(3);
    expect(tally.eligible).toBe(1);
    expect(tally.completionPct).toBe(100);
  });

  it("shows the closed tail rather than letting the denominator shrink quietly", () => {
    // `closeActivation` flips every still-pending gate to `expired`. Before it
    // ran this was 1 of 5; after, it is 1 of 1. Both are true, and `closed`
    // plus `closedPct` are the only things on screen that explain the jump.
    const before = tallyActivationCompletion(
      rows({ completed: 1, pending: 4 }),
    );
    const after = tallyActivationCompletion(rows({ completed: 1, expired: 4 }));

    expect(before.completionPct).toBe(20);
    expect(before.closed).toBe(0);
    expect(before.closedPct).toBe(0);

    expect(after.completionPct).toBe(100);
    expect(after.closed).toBe(4);
    expect(after.closedPct).toBe(80);
    // Reach is unchanged either side of the close.
    expect(after.sent).toBe(before.sent);
  });

  it("returns 0, not NaN, when nothing was sent", () => {
    const tally = tallyActivationCompletion([]);
    expect(tally).toEqual({
      sent: 0,
      completed: 0,
      pending: 0,
      closed: 0,
      eligible: 0,
      completionPct: 0,
      closedPct: 0,
    });
  });

  it("returns 0, not NaN, when every row was closed", () => {
    // `eligible` is zero here while `sent` is not — the second zero-denominator
    // case, and the one an `=== 0` guard on `sent` alone would miss.
    const tally = tallyActivationCompletion(rows({ waived: 2, expired: 3 }));
    expect(tally.sent).toBe(5);
    expect(tally.eligible).toBe(0);
    expect(tally.completionPct).toBe(0);
    expect(tally.closedPct).toBe(100);
  });

  it("rounds a completion percentage half-up", () => {
    // 1 of 3 is 33.33 → 33; 2 of 3 is 66.67 → 67. No truncation.
    expect(
      tallyActivationCompletion(rows({ completed: 1, pending: 2 }))
        .completionPct,
    ).toBe(33);
    expect(
      tallyActivationCompletion(rows({ completed: 2, pending: 1 }))
        .completionPct,
    ).toBe(67);
  });

  it("derives pending as the complement, so the buckets always reconcile", () => {
    const tally = tallyActivationCompletion(
      rows({ completed: 3, pending: 7, waived: 2, expired: 1 }),
    );
    expect(tally.completed + tally.pending + tally.closed).toBe(tally.sent);
    expect(tally.eligible).toBe(tally.pending + tally.completed);
  });

  it("reports a fully-complete activation as 100, not 99", () => {
    const tally = tallyActivationCompletion(rows({ completed: 7 }));
    expect(tally.completionPct).toBe(100);
    expect(tally.pending).toBe(0);
  });
});

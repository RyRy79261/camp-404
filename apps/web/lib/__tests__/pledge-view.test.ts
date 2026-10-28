import { describe, expect, it } from "vitest";
import { DEFAULT_JOIN_CONTENT } from "@camp404/types";
import {
  feeTimingChoice,
  feeTimingPhrase,
  nextPaymentWords,
  paymentPlanRows,
  pledgeMarks,
  pledgeNote,
  pledgeTag,
  pledgeWithScale,
  readPledgeAmount,
  shortDay,
  usdLabel,
  WHOLE_RANDS,
} from "../pledge-view";

// The member's camp fee in words (mock-up steps 3 to 5). The scale is the Join
// site's default: Essential R3,500, Reasonable R6,000, Ideal R8,000, Perfect
// World R16,000, R16 = US$1, so Recommended (about US$450) is R7,200.
// Intl writes no-break spaces ("R 7 200,00"), so money is matched with \s.

const SCALE = DEFAULT_JOIN_CONTENT.fee;

describe("the scale's words", () => {
  it("tags the Recommended point, a mark, near a mark and R0", () => {
    expect(pledgeTag(720_000, SCALE)).toBe("Recommended");
    expect(pledgeTag(800_000, SCALE)).toBe("Ideal");
    expect(pledgeTag(750_000, SCALE)).toBe("Near Ideal");
    expect(pledgeTag(0, SCALE)).toBe("Subsidy");
    expect(pledgeTag(4_000_000, SCALE)).toBe("Near Perfect World");
  });

  it("says a saved pledge with the scale name near it", () => {
    expect(pledgeWithScale(720_000, SCALE)).toMatch(
      /^R\s7\s200,00 \(near Ideal\)$/,
    );
    expect(pledgeWithScale(800_000, SCALE)).toMatch(/\(Ideal\)$/);
  });

  it("gives the Recommended its reason and a mark its own note", () => {
    expect(pledgeNote(720_000, SCALE)).toBe(
      "About US$450: what we suggest if you can.",
    );
    expect(pledgeNote(800_000, SCALE)).toBe(
      "Where we hope most people can land.",
    );
    expect(pledgeNote(750_000, SCALE)).toBeNull();
  });

  it("labels dollars at the typed rate", () => {
    expect(usdLabel(720_000, SCALE)).toBe("≈ US$450");
  });

  it("places the marks as the mock-up does, Recommended below and lit", () => {
    const marks = pledgeMarks(SCALE);
    expect(marks.map((m) => [m.name, m.side])).toEqual([
      ["Essential", "above"],
      ["Reasonable", "below"],
      ["Ideal", "above"],
      ["Perfect World", "above"],
      ["★ Recommended", "below"],
    ]);
    // Recommended on its own row: R1,200 from Reasonable, the labels collide.
    expect(marks.at(-1)).toMatchObject({ rands: 7_200, lit: true, row: 2 });
    // Dollars to the whole dollar: R3,500 at R16 is US$218.75.
    expect(marks[0]!.detail).toMatch(/· ≈ US\$219$/);
  });
});

describe("readPledgeAmount", () => {
  it("reads whole rands, blank as R0, and refuses cents or words", () => {
    expect(readPledgeAmount("7200")).toEqual({ ok: true, cents: 720_000 });
    expect(readPledgeAmount("R 20 000")).toEqual({
      ok: true,
      cents: 2_000_000,
    });
    expect(readPledgeAmount("  ")).toEqual({ ok: true, cents: 0 });
    expect(readPledgeAmount("7200,50")).toEqual({
      ok: false,
      error: WHOLE_RANDS,
    });
    expect(readPledgeAmount("lots")).toEqual({ ok: false, error: WHOLE_RANDS });
  });
});

describe("feeTimingPhrase", () => {
  it("lowers only the first letter, so the month keeps its capital", () => {
    expect(feeTimingPhrase("part_by_end_nov", 2027)).toBe(
      "part by the end of November and the rest later",
    );
    expect(feeTimingPhrase("talk_to_captain", 2027)).toBe(
      "and you'll talk to a captain about when",
    );
  });
});

describe("feeTimingChoice", () => {
  it("puts 'and the rest later' under a part payment", () => {
    expect(feeTimingChoice("part_by_end_nov", 2027)).toEqual({
      value: "part_by_end_nov",
      label: "Part by the end of November",
      description: "and the rest later",
    });
    expect(feeTimingChoice("all_by_15_jan", 2027)).toEqual({
      value: "all_by_15_jan",
      label: "All of it by 15 January 2027",
    });
  });
});

describe("nextPaymentWords", () => {
  const totals = { paidCents: 0, feeTotalCents: 720_000 };

  it("talks about the first instalment, not the whole fee", () => {
    const words = nextPaymentWords(
      {
        kind: "due",
        dueOn: "2026-11-30",
        amountCents: 360_000,
        overdue: false,
        first: true,
        source: "pledge",
      },
      totals,
    );
    expect(words?.sentence).toMatch(
      /^Your first payment of R\s3\s600,00 is due by 30 Nov\.$/,
    );
    expect(words?.short).toMatch(/^R\s3\s600,00 is due by 30 Nov$/);
    expect(words?.paid).toMatch(/^You have paid R\s0,00 of R\s7\s200,00\.$/);
    expect(words?.amountCents).toBe(360_000);
  });

  it("says next, and late, after a payment", () => {
    const words = nextPaymentWords(
      {
        kind: "due",
        dueOn: "2026-12-31",
        amountCents: 360_000,
        overdue: true,
        first: false,
        source: "plan",
      },
      { paidCents: 360_000, feeTotalCents: 720_000 },
    );
    expect(words?.sentence).toMatch(
      /^Your next payment of .* was due by 31 Dec\./,
    );
    expect(words?.overdue).toBe(true);
  });

  it("says what is owed with no day, and nothing when nothing is next", () => {
    expect(
      nextPaymentWords({ kind: "no_date", amountCents: 720_000 }, totals)
        ?.short,
    ).toMatch(/^You owe R\s7\s200,00$/);
    expect(nextPaymentWords({ kind: "paid_up" }, totals)).toBeNull();
    expect(nextPaymentWords({ kind: "subsidy" }, totals)).toBeNull();
    expect(nextPaymentWords({ kind: "no_pledge" }, totals)).toBeNull();
  });

  it("writes a day as day and month", () => {
    expect(shortDay("2027-01-15")).toBe("15 Jan");
  });
});

describe("paymentPlanRows", () => {
  const due = {
    kind: "due",
    dueOn: "2026-11-30",
    amountCents: 360_000,
    overdue: false,
    first: true,
    source: "pledge",
  } as const;

  it("lists what the pledge's by-when means, the next one marked", () => {
    expect(
      paymentPlanRows({
        plan: [],
        payBy: "part_by_end_nov",
        feeTotalCents: 720_000,
        burnYear: 2027,
        next: due,
      }),
    ).toEqual([
      { dueOn: "2026-11-30", amountCents: 360_000, next: true },
      { dueOn: "2026-12-31", amountCents: 360_000, next: false },
    ]);
  });

  it("lets the Finance team's plan win", () => {
    expect(
      paymentPlanRows({
        plan: [
          { dueOn: "2027-01-15", amountCents: 200_000 },
          { dueOn: "2026-12-01", amountCents: 520_000 },
        ],
        payBy: "all_by_end_nov",
        feeTotalCents: 720_000,
        burnYear: 2027,
        next: { ...due, dueOn: "2026-12-01", source: "plan" },
      }).map((r) => [r.dueOn, r.next]),
    ).toEqual([
      ["2026-12-01", true],
      ["2027-01-15", false],
    ]);
  });

  it("has nothing for a talk with a captain", () => {
    expect(
      paymentPlanRows({
        plan: [],
        payBy: "talk_to_captain",
        feeTotalCents: 720_000,
        burnYear: 2027,
        next: { kind: "no_date", amountCents: 720_000 },
      }),
    ).toEqual([]);
  });
});

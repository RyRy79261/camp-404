import { describe, expect, it } from "vitest";
import type { PaymentSource } from "@camp404/types";
import {
  canManageMoney,
  duesBalance,
  duesSettled,
  FINANCE_TEAM,
  findMemberRef,
  nextInstalment,
  paymentFigures,
  parseStatement,
  parseStatementAmount,
  parseStatementDate,
  proposeRefund,
  proposeStatementMatches,
  splitEvenly,
  UnknownCurrencyError,
} from "../index";

describe("canManageMoney", () => {
  it("lets a captain in, whatever they lead", () => {
    expect(canManageMoney("captain", [])).toBe(true);
  });

  it("lets a lead of Finance in", () => {
    expect(canManageMoney("team_lead", [FINANCE_TEAM])).toBe(true);
    expect(canManageMoney("team_lead", ["kitchen", FINANCE_TEAM])).toBe(true);
  });

  it("refuses a lead of another team: clearance is global, the money is not", () => {
    expect(canManageMoney("team_lead", ["kitchen"])).toBe(false);
    expect(canManageMoney("team_lead", [])).toBe(false);
  });

  it("refuses a member, even one who names Finance", () => {
    expect(canManageMoney("camp_member", [FINANCE_TEAM])).toBe(false);
  });

  it("fails closed on a rank it does not know", () => {
    expect(canManageMoney("member", [FINANCE_TEAM])).toBe(false);
    expect(canManageMoney("owner", [])).toBe(false);
    expect(canManageMoney("", [FINANCE_TEAM])).toBe(false);
  });
});

const zar = (amountCents: number) => ({ amountCents, currency: "ZAR" });

describe("paymentFigures", () => {
  it("keeps the bank, excused, sent-in and promised money apart", () => {
    const f = paymentFigures([
      { amountCents: 250000, status: "reconciled", source: "statement" },
      { amountCents: 100000, status: "reconciled", source: "captain" },
      { amountCents: 50000, status: "waived", source: "captain" },
      { amountCents: 120000, status: "pending", source: "captain" },
      { amountCents: 70000, status: "pending", source: "member" },
      { amountCents: 30000, status: "pending", source: "member" },
    ]);
    expect(f).toEqual({
      inBankCents: 350000,
      excusedCents: 50000,
      toCheckCents: 100000,
      toCheckCount: 2,
      promisedCents: 120000,
      promisedCount: 1,
    });
  });
});

describe("duesBalance", () => {
  it("is charges less payments received or waived, plus refunds paid out", () => {
    const balance = duesBalance({
      charges: [zar(250_000), zar(15_000), zar(-2_000)],
      payments: [
        { ...zar(100_000), status: "reconciled" },
        { ...zar(20_000), status: "waived" },
        { ...zar(50_000), status: "pending" },
      ],
      refunds: [
        { amountCents: 10_000, currency: "ZAR", status: "refunded" },
        { amountCents: 99_999, currency: "ZAR", status: "requested" },
        { amountCents: null, currency: "ZAR", status: "declined" },
      ],
    });
    expect(balance).toEqual({
      chargedCents: 263_000,
      paidCents: 120_000,
      pendingCents: 50_000,
      refundedCents: 10_000,
      balanceCents: 153_000,
    });
  });

  it("goes below zero when the camp owes the member", () => {
    expect(
      duesBalance({
        charges: [zar(10_000)],
        payments: [{ ...zar(15_000), status: "reconciled" }],
      }).balanceCents,
    ).toBe(-5_000);
  });

  it("refuses any row in another currency rather than add it in as rands", () => {
    expect(() =>
      duesBalance({
        charges: [{ amountCents: 100, currency: "USD" }],
        payments: [],
      }),
    ).toThrow(UnknownCurrencyError);
    expect(() =>
      duesBalance({
        charges: [],
        payments: [{ amountCents: 100, currency: "zar", status: "reconciled" }],
      }),
    ).toThrow(UnknownCurrencyError);
  });
});

describe("duesSettled", () => {
  it("with charges, needs the balance paid down to zero", () => {
    const charges = [zar(20_000)];
    expect(
      duesSettled({
        charges,
        payments: [{ ...zar(10_000), status: "reconciled" }],
      }),
    ).toBe(false);
    expect(
      duesSettled({
        charges,
        payments: [
          { ...zar(10_000), status: "reconciled" },
          { ...zar(10_000), status: "waived" },
        ],
      }),
    ).toBe(true);
  });

  it("with no charges, keeps the ledger's old rule: any payment received or waived", () => {
    expect(duesSettled({ charges: [], payments: [] })).toBe(false);
    expect(
      duesSettled({
        charges: [],
        payments: [{ ...zar(1), status: "pending" }],
      }),
    ).toBe(false);
    expect(
      duesSettled({
        charges: [],
        payments: [{ ...zar(1), status: "reconciled" }],
      }),
    ).toBe(true);
  });
});

describe("nextInstalment", () => {
  const plan = [
    { dueOn: "2027-03-01", amountCents: 50_000 },
    { dueOn: "2027-01-01", amountCents: 50_000 },
    { dueOn: "2027-02-01", amountCents: 50_000 },
  ];

  it("fills instalments in date order with what was paid", () => {
    expect(nextInstalment(plan, 0, "2026-12-01")).toEqual({
      dueOn: "2027-01-01",
      amountCents: 50_000,
      overdue: false,
    });
    expect(nextInstalment(plan, 70_000, "2027-02-02")).toEqual({
      dueOn: "2027-02-01",
      amountCents: 30_000,
      overdue: true,
    });
  });

  it("is null with no plan, or once it is paid", () => {
    expect(nextInstalment([], 0, "2027-01-01")).toBeNull();
    expect(nextInstalment(plan, 150_000, "2027-06-01")).toBeNull();
  });
});

describe("splitEvenly", () => {
  it("adds up to the total exactly, the leftover cents going in id order", () => {
    const shares = splitEvenly(10_000, ["c", "a", "b"]);
    expect([...shares.entries()]).toEqual([
      ["a", 3_334],
      ["b", 3_333],
      ["c", 3_333],
    ]);
    expect([...shares.values()].reduce((s, n) => s + n, 0)).toBe(10_000);
  });

  it("sums to the total for awkward totals and many people", () => {
    for (const total of [1, 7, 99_999, 1_234_567]) {
      for (const n of [1, 3, 7, 13, 41]) {
        const ids = Array.from({ length: n }, (_, i) => `m${i}`);
        const shares = [...splitEvenly(total, ids).values()];
        expect(shares.reduce((s, x) => s + x, 0)).toBe(total);
        expect(Math.max(...shares) - Math.min(...shares)).toBeLessThanOrEqual(
          1,
        );
      }
    }
  });

  it("counts a person once, and shares nothing among no one", () => {
    expect(splitEvenly(100, ["a", "a"]).get("a")).toBe(100);
    expect(splitEvenly(100, []).size).toBe(0);
  });

  it("refuses a total that is not whole cents", () => {
    expect(() => splitEvenly(1.5, ["a"])).toThrow(RangeError);
    expect(() => splitEvenly(-1, ["a"])).toThrow(RangeError);
  });
});

describe("proposeRefund", () => {
  const schedule = {
    fullRefundUntil: "2027-01-31",
    partialRefundUntil: "2027-03-31",
    partialRefundPct: 50,
  };

  it("pays it all back up to and including the full-refund day", () => {
    expect(proposeRefund(100_001, "2027-01-31", schedule)).toEqual({
      amountCents: 100_001,
      rule: "full",
    });
  });

  it("pays the percentage, rounded down, up to the partial day", () => {
    expect(proposeRefund(100_001, "2027-02-01", schedule)).toEqual({
      amountCents: 50_000,
      rule: "partial",
    });
    expect(proposeRefund(100_001, "2027-03-31", schedule).rule).toBe("partial");
  });

  it("pays nothing after", () => {
    expect(proposeRefund(100_001, "2027-04-01", schedule)).toEqual({
      amountCents: 0,
      rule: "none",
    });
  });

  it("proposes nothing when the year has no schedule", () => {
    expect(
      proposeRefund(100, "2027-01-01", {
        fullRefundUntil: null,
        partialRefundUntil: null,
        partialRefundPct: null,
      }),
    ).toEqual({ amountCents: null, rule: "no_schedule" });
  });
});

describe("statement parsing", () => {
  it("reads dates the ways banks write them", () => {
    expect(parseStatementDate("2027-01-15")).toBe("2027-01-15");
    expect(parseStatementDate("2027/1/5")).toBe("2027-01-05");
    expect(parseStatementDate("20270115")).toBe("2027-01-15");
    expect(parseStatementDate("15/01/2027")).toBe("2027-01-15");
    expect(parseStatementDate("15-01-2027")).toBe("2027-01-15");
    expect(parseStatementDate("15 Jan 2027")).toBe("2027-01-15");
    expect(parseStatementDate("5-January-2027")).toBe("2027-01-05");
    expect(parseStatementDate("2027-01-15 10:22:01")).toBe("2027-01-15");
    expect(parseStatementDate("30/02/2027")).toBeNull();
    expect(parseStatementDate("yesterday")).toBeNull();
  });

  it("reads amounts with either decimal mark, and knows money going out", () => {
    expect(parseStatementAmount("1250.00")).toBe(125_000);
    expect(parseStatementAmount("1 250,50")).toBe(125_050);
    expect(parseStatementAmount("1,250.50")).toBe(125_050);
    expect(parseStatementAmount("1.250,50")).toBe(125_050);
    expect(parseStatementAmount("R1250")).toBe(125_000);
    expect(parseStatementAmount("1,250")).toBe(125_000);
    expect(parseStatementAmount("-500.00")).toBe(-50_000);
    expect(parseStatementAmount("(500.00)")).toBe(-50_000);
    expect(parseStatementAmount("500.00 DR")).toBe(-50_000);
    expect(parseStatementAmount("500.00CR")).toBe(50_000);
    expect(parseStatementAmount("abc")).toBeNull();
    expect(parseStatementAmount("")).toBeNull();
  });

  it("finds a member reference with or without its hyphen, and inside a payment reference", () => {
    expect(findMemberRef("Dues C404-M017 thanks")).toBe("C404-M017");
    expect(findMemberRef("c404m017")).toBe("C404-M017");
    expect(findMemberRef("C404 M 17")).toBeNull();
    expect(findMemberRef("REF C404-M017-2027-2")).toBe("C404-M017");
    expect(findMemberRef("C404-M1024")).toBe("C404-M1024");
    expect(findMemberRef("no reference")).toBeNull();
  });

  it("finds the header below a bank's account lines and keeps money coming in", () => {
    const csv = [
      "Account,Cheque,12345",
      "Opening balance,100.00",
      "",
      "Date,Description,Amount,Balance",
      '15/01/2027,EFT C404-M017 dues,"1,250.00",2000.00',
      "16/01/2027,Card purchase,-99.00,1901.00",
      "17/01/2027,Someone without a ref,300.00,2201.00",
      "not a date,C404-M018,300.00,2201.00",
    ].join("\r\n");
    const parsed = parseStatement(`\uFEFF${csv}`);
    expect(parsed).toEqual({
      ok: true,
      lines: [
        {
          row: 5,
          date: "2027-01-15",
          amountCents: 125_000,
          description: "EFT C404-M017 dues",
          memberRef: "C404-M017",
        },
        {
          row: 7,
          date: "2027-01-17",
          amountCents: 30_000,
          description: "Someone without a ref",
          memberRef: null,
        },
      ],
      skippedOutgoing: 1,
      skippedUnreadable: 1,
    });
  });

  it("reads a transfer service's file with separate columns and a currency", () => {
    const csv = [
      "Date;Payment Reference;Money in;Money out;Currency",
      "2027-02-01;C404-M020;500,00;;ZAR",
      "2027-02-02;fees;;12,00;ZAR",
      "2027-02-03;C404-M021;40,00;;USD",
    ].join("\n");
    const parsed = parseStatement(csv);
    expect(parsed.ok && parsed.lines).toEqual([
      {
        row: 2,
        date: "2027-02-01",
        amountCents: 50_000,
        description: "C404-M020",
        memberRef: "C404-M020",
      },
    ]);
    expect(parsed.ok && parsed.skippedOutgoing).toBe(1);
    expect(parsed.ok && parsed.skippedUnreadable).toBe(1);
  });

  it("says so when it cannot find the columns, or the file is empty", () => {
    expect(parseStatement("a,b,c\n1,2,3").ok).toBe(false);
    expect(parseStatement("   ")).toEqual({
      ok: false,
      error: "That file is empty.",
    });
  });
});

describe("proposeStatementMatches", () => {
  const members = [
    { id: "u1", name: "Ada", refCode: "C404-M017" },
    { id: "u2", name: "Bo", refCode: null },
  ];
  const line = (over: object) => ({
    row: 2,
    date: "2027-01-15",
    amountCents: 125_000,
    description: "C404-M017",
    memberRef: "C404-M017",
    ...over,
  });

  it("names the member, and offers their pending payment for the same amount", () => {
    const [p] = proposeStatementMatches([line({})], members, [
      {
        id: "p1",
        userId: "u1",
        amountCents: 125_000,
        status: "pending",
        source: "member",
        paidOn: "2027-01-14",
      },
    ]);
    expect(p!.member).toEqual({ id: "u1", name: "Ada", refCode: "C404-M017" });
    expect(p!.matchedBy).toBe("reference");
    expect(p!.pendingPaymentId).toBe("p1");
    expect(p!.alreadyRecorded).toBe(false);
  });

  it("gives one pending payment to one line only", () => {
    const proposals = proposeStatementMatches(
      [line({}), line({ row: 3 })],
      members,
      [
        {
          id: "p1",
          userId: "u1",
          amountCents: 125_000,
          status: "pending",
          source: "member",
          paidOn: null,
        },
      ],
    );
    expect(proposals.map((p) => p.pendingPaymentId)).toEqual(["p1", null]);
  });

  it("flags a line already on the ledger for that member, amount and day", () => {
    const [p] = proposeStatementMatches([line({})], members, [
      {
        id: "p1",
        userId: "u1",
        amountCents: 125_000,
        status: "reconciled",
        source: "statement",
        paidOn: "2027-01-15",
      },
    ]);
    expect(p!.alreadyRecorded).toBe(true);
    expect(p!.pendingPaymentId).toBeNull();
  });

  it("names no one for a reference nobody holds", () => {
    const [p] = proposeStatementMatches(
      [line({ memberRef: "C404-M099" })],
      members,
      [],
    );
    expect(p!.member).toBeNull();
    expect(p!.matchedBy).toBeNull();
  });

  it("suggests the member whose one pending payment has the same amount, when the line has no reference", () => {
    const pending = (
      id: string,
      userId: string,
      source: PaymentSource = "member",
    ) => ({
      id,
      userId,
      amountCents: 125_000,
      status: "pending" as const,
      source,
      paidOn: null,
    });
    const membersWithRefs = [
      { id: "u1", name: "Ada", refCode: "C404-M017" },
      { id: "u3", name: "Cy", refCode: "C404-M018" },
    ];
    const noRef = line({ memberRef: null, description: "EFT ADA" });
    const [p] = proposeStatementMatches([noRef], membersWithRefs, [
      pending("p1", "u3"),
    ]);
    expect(p!.member).toEqual({ id: "u3", name: "Cy", refCode: "C404-M018" });
    expect(p!.matchedBy).toBe("amount");
    expect(p!.pendingPaymentId).toBe("p1");

    // Two pending payments with that amount: no guess.
    const [two] = proposeStatementMatches([noRef], membersWithRefs, [
      pending("p1", "u3"),
      pending("p2", "u1"),
    ]);
    expect(two!.member).toBeNull();

    // A referenced line takes its member's payment first; nothing is left
    // to suggest from.
    const [, after] = proposeStatementMatches(
      [line({}), noRef],
      membersWithRefs,
      [pending("p2", "u1")],
    );
    expect(after!.member).toBeNull();

    // A payment a captain recorded as promised is not money the member said
    // they sent: never suggested.
    for (const source of ["captain", "statement"] as const) {
      const [promised] = proposeStatementMatches([noRef], membersWithRefs, [
        pending("p1", "u3", source),
      ]);
      expect(promised!.member).toBeNull();
    }
  });
});

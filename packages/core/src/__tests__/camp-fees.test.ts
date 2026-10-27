import { describe, expect, it } from "vitest";
import { DEFAULT_JOIN_CONTENT } from "@camp404/types";
import {
  addMonthsToDay,
  auditDetail,
  BILL_ALREADY_PAID,
  campBillPaymentsLeft,
  campBillState,
  campForecast,
  budgetsUnspentCents,
  FEE_ALREADY_SET,
  feeInstalmentsLeft,
  feeTimingLabel,
  feeTimingSchedule,
  feeTimingShortLabel,
  feeTotals,
  nearestScaleName,
  nextFeePayment,
  pledgeRefusal,
  recommendedPledgeCents,
  type CampBillLike,
  type FeeMember,
} from "../index";

// Camp fees (the camp fees sprint, 2026-10-27). The samples are the approved
// mock-up's (docs/plans/2026-10-27-camp-fees-mockup.html), so the figures it
// draws are the figures these functions give.

const YEAR = 2027;
const R = (rands: number) => rands * 100;
const TODAY = "2026-10-27";
const SCALE = DEFAULT_JOIN_CONTENT.fee;

describe("the fee timings", () => {
  it("puts each timing on the burn year's days, part as half then the rest", () => {
    expect(feeTimingSchedule("all_by_end_nov", R(7200), YEAR)).toEqual([
      { dueOn: "2026-11-30", amountCents: R(7200) },
    ]);
    expect(feeTimingSchedule("all_by_end_dec", R(7200), YEAR)).toEqual([
      { dueOn: "2026-12-31", amountCents: R(7200) },
    ]);
    expect(feeTimingSchedule("part_by_end_nov", R(7200), YEAR)).toEqual([
      { dueOn: "2026-11-30", amountCents: R(3600) },
      { dueOn: "2026-12-31", amountCents: R(3600) },
    ]);
    expect(feeTimingSchedule("part_by_end_dec", R(7200), YEAR)).toEqual([
      { dueOn: "2026-12-31", amountCents: R(3600) },
      { dueOn: "2027-01-15", amountCents: R(3600) },
    ]);
    expect(feeTimingSchedule("all_by_15_jan", R(3500), YEAR)).toEqual([
      { dueOn: "2027-01-15", amountCents: R(3500) },
    ]);
    expect(feeTimingSchedule("talk_to_captain", R(5000), YEAR)).toEqual([]);
    expect(feeTimingSchedule("all_by_end_nov", 0, YEAR)).toEqual([]);
  });

  it("rounds the first half up to the rand, so the halves add up", () => {
    const [first, rest] = feeTimingSchedule("part_by_end_nov", R(5001), YEAR);
    expect(first!.amountCents).toBe(R(2501));
    expect(rest!.amountCents).toBe(R(2500));
    expect(feeTimingSchedule("part_by_end_nov", 150, YEAR)).toEqual([
      { dueOn: "2026-11-30", amountCents: 100 },
      { dueOn: "2026-12-31", amountCents: 50 },
    ]);
  });

  it("words each timing for the form and the table", () => {
    expect(feeTimingLabel("all_by_15_jan", YEAR)).toBe(
      "All of it by 15 January 2027",
    );
    expect(feeTimingShortLabel("part_by_end_nov", YEAR)).toBe(
      "Part by end Nov",
    );
    expect(feeTimingShortLabel(null, YEAR)).toBe("Not answered");
    expect(feeTimingShortLabel("talk_to_captain", YEAR)).toBe(
      "Will talk to a captain",
    );
  });
});

describe("the next fee payment", () => {
  const account = (
    over: Partial<Parameters<typeof nextFeePayment>[0]> = {},
  ) => ({
    totalCents: R(8000),
    paidCents: 0,
    payBy: "part_by_end_nov" as const,
    plan: [],
    hasPledge: true,
    subsidy: false,
    ...over,
  });

  it("takes what is paid off the oldest instalment first", () => {
    // Caitlin: R8,000 part by end Nov, R2,000 paid: R2,000 more by 30 Nov.
    expect(
      nextFeePayment(account({ paidCents: R(2000) }), YEAR, TODAY),
    ).toEqual({
      kind: "due",
      dueOn: "2026-11-30",
      amountCents: R(2000),
      overdue: false,
      first: false,
      source: "pledge",
    });
    expect(
      nextFeePayment(account({ paidCents: R(5000) }), YEAR, TODAY),
    ).toMatchObject({ dueOn: "2026-12-31", amountCents: R(3000) });
    expect(nextFeePayment(account(), YEAR, TODAY)).toMatchObject({
      amountCents: R(4000),
      first: true,
    });
  });

  it("lets the Finance team's plan win over the pledge's timing", () => {
    const plan = [
      { dueOn: "2027-02-01", amountCents: R(1000) },
      { dueOn: "2027-01-01", amountCents: R(1000) },
    ];
    expect(nextFeePayment(account({ plan }), YEAR, "2027-01-05")).toEqual({
      kind: "due",
      dueOn: "2027-01-01",
      amountCents: R(1000),
      overdue: true,
      first: true,
      source: "plan",
    });
  });

  it("says no date, a subsidy, paid up or no pledge", () => {
    expect(
      nextFeePayment(
        account({ totalCents: R(5000), payBy: "talk_to_captain" }),
        YEAR,
        TODAY,
      ),
    ).toEqual({ kind: "no_date", amountCents: R(5000) });
    expect(
      nextFeePayment(
        account({ totalCents: 0, payBy: null, subsidy: true }),
        YEAR,
        TODAY,
      ),
    ).toEqual({ kind: "subsidy" });
    expect(
      nextFeePayment(account({ payBy: null, subsidy: true }), YEAR, TODAY),
    ).toEqual({ kind: "subsidy" });
    expect(
      nextFeePayment(account({ paidCents: R(8000) }), YEAR, TODAY),
    ).toEqual({ kind: "paid_up" });
    expect(
      nextFeePayment(
        account({ totalCents: 0, payBy: null, hasPledge: false }),
        YEAR,
        TODAY,
      ),
    ).toEqual({ kind: "no_pledge" });
  });

  it("keeps what a short plan does not cover as owed with no date", () => {
    expect(
      feeInstalmentsLeft(
        {
          totalCents: R(3000),
          paidCents: 0,
          payBy: null,
          plan: [{ dueOn: "2027-01-01", amountCents: R(1000) }],
        },
        YEAR,
      ),
    ).toEqual({
      source: "plan",
      dated: [{ dueOn: "2027-01-01", amountCents: R(1000) }],
      undatedCents: R(2000),
    });
  });
});

describe("the pledge", () => {
  it("refuses a new amount once the fee is charged, but not a new timing", () => {
    expect(
      pledgeRefusal({ feeCents: null, pledgedCents: null, amountCents: 1 }),
    ).toBeNull();
    expect(
      pledgeRefusal({
        feeCents: R(7000),
        pledgedCents: R(7200),
        amountCents: R(7200),
      }),
    ).toBeNull();
    expect(
      pledgeRefusal({
        feeCents: R(7000),
        pledgedCents: R(7200),
        amountCents: R(8000),
      }),
    ).toBe(FEE_ALREADY_SET);
    expect(
      pledgeRefusal({
        feeCents: R(7000),
        pledgedCents: null,
        amountCents: R(7000),
      }),
    ).toBeNull();
  });
});

describe("the Join site's scale", () => {
  it("marks about US$450 at the typed rate as Recommended", () => {
    expect(recommendedPledgeCents(SCALE)).toBe(R(7200));
    expect(recommendedPledgeCents({ usdRate: { randsPerDollar: 18.37 } })).toBe(
      R(8300),
    );
  });

  it("names the nearest point on the scale, as the mock-up does", () => {
    expect(nearestScaleName(R(6000), SCALE)).toEqual({
      name: "Reasonable",
      exact: true,
    });
    expect(nearestScaleName(R(7200), SCALE)).toEqual({
      name: "Ideal",
      exact: false,
    });
    expect(nearestScaleName(R(5000), SCALE).name).toBe("Reasonable");
    expect(nearestScaleName(R(4000), SCALE).name).toBe("Essential");
    expect(nearestScaleName(R(40000), SCALE).name).toBe("Perfect World");
    expect(nearestScaleName(0, SCALE)).toEqual({
      name: "Subsidy",
      exact: true,
    });
    // A tie goes to the lower name.
    expect(nearestScaleName(R(7000), SCALE).name).toBe("Reasonable");
  });
});

describe("the camp's bills", () => {
  const storage: CampBillLike = {
    id: "storage",
    name: "Storage unit",
    payee: "Paarden Eiland Storage",
    amountCents: R(4400),
    dueOn: "2026-11-15",
    repeat: "monthly",
    times: 6,
    paidCount: 0,
    planned: false,
  };

  it("keeps a day in its month", () => {
    expect(addMonthsToDay("2027-01-31", 1)).toBe("2027-02-28");
    expect(addMonthsToDay("2026-11-15", 2)).toBe("2027-01-15");
    expect(addMonthsToDay("2028-01-31", 1)).toBe("2028-02-29");
  });

  it("lists a monthly bill's payments left and says its state", () => {
    expect(campBillPaymentsLeft({ ...storage, paidCount: 4 })).toEqual([
      { dueOn: "2027-03-15", index: 4 },
      { dueOn: "2027-04-15", index: 5 },
    ]);
    expect(campBillState(storage)).toBe("not_paid");
    expect(campBillState({ ...storage, planned: true })).toBe("planned");
    expect(campBillState({ ...storage, paidCount: 6, planned: true })).toBe(
      "paid",
    );
    expect(BILL_ALREADY_PAID).toMatch(/already paid/);
  });

  it("adds up what the teams' budgets have left, never below zero", () => {
    expect(
      budgetsUnspentCents([
        { leftCents: R(10000) },
        { leftCents: -R(500) },
        { leftCents: null },
        { leftCents: R(1500) },
      ]),
    ).toBe(R(11500));
  });
});

describe("who owes what and the forecast (the mock-up's camp)", () => {
  const member = (
    name: string,
    totalRands: number,
    payBy: FeeMember["payBy"],
    over: Partial<FeeMember> = {},
  ): FeeMember => ({
    userId: name.toLowerCase(),
    name,
    participation: "accepted",
    subsidy: false,
    totalCents: R(totalRands),
    paidCents: 0,
    payBy,
    plan: [],
    ...over,
  });
  const members: FeeMember[] = [
    member("Alex", 6000, "all_by_end_nov", { paidCents: R(6000) }),
    member("Caitlin", 8000, "part_by_end_nov", { paidCents: R(2000) }),
    member("Cloud", 7200, "all_by_end_dec"),
    member("Jess", 3500, "all_by_15_jan"),
    member("Lerato", 7200, "part_by_end_nov"),
    member("Michael", 16000, "all_by_end_nov"),
    member("Pieter", 5000, "talk_to_captain", { participation: "applied" }),
    member("Sam", 0, null, { subsidy: true }),
    member("Thabo", 4000, "part_by_end_nov"),
    member("Maybe", 7200, "all_by_end_nov", { participation: "maybe" }),
    member("Gone", 7200, "all_by_end_nov", { participation: "not_attending" }),
  ];
  const bill = (over: Partial<CampBillLike>): CampBillLike => ({
    id: over.name ?? "bill",
    name: "Bill",
    payee: null,
    amountCents: 0,
    dueOn: "2026-11-15",
    repeat: "once",
    times: 1,
    paidCount: 0,
    planned: false,
    ...over,
  });
  const bills = [
    bill({
      name: "Storage unit",
      payee: "Paarden Eiland Storage",
      amountCents: R(4400),
      dueOn: "2026-11-15",
      repeat: "monthly",
      times: 6,
    }),
    bill({
      name: "Tent hire deposit",
      payee: "Dimensions",
      amountCents: R(70000),
      dueOn: "2026-12-01",
    }),
    bill({
      name: "Container",
      payee: "Caitlin",
      amountCents: R(20000),
      dueOn: "2027-02-15",
      planned: true,
    }),
    bill({
      name: "Tent hire balance",
      payee: "Dimensions",
      amountCents: R(32000),
      dueOn: "2027-03-31",
    }),
    bill({ name: "Paid already", amountCents: R(999), paidCount: 1 }),
  ];

  it("totals the members who said Coming", () => {
    expect(feeTotals(members, YEAR, TODAY)).toEqual({
      comingCount: 9,
      maybeCount: 1,
      subsidyCount: 1,
      pledgedCents: R(56900),
      paidCents: R(8000),
      paidUpCount: 1,
      partPaidCount: 1,
      stillExpectedCents: R(48900),
      owingCount: 7,
      nextDue: { dueOn: "2026-11-30", amountCents: R(23600), count: 4 },
    });
  });

  it("draws the date-by-date list with the money after each line", () => {
    const forecast = campForecast({
      balance: { amountCents: R(100000), asOf: "2026-10-25" },
      members,
      bills,
      budgetsUnspentCents: R(11500),
      burnYear: YEAR,
    });
    expect(forecast).toMatchObject({
      feesExpectedCents: R(48900),
      feesFromCount: 7,
      comingCount: 9,
      billsDueCents: R(148400),
      billsDueCount: 9,
      budgetsUnspentCents: R(11500),
      moneyLeftCents: -R(11000),
    });
    const rows = forecast.lines.map((l) => [
      l.dueOn,
      l.kind === "bill" ? l.name : l.kind,
      l.amountCents / 100,
      l.moneyAfterCents / 100,
    ]);
    expect(rows).toEqual([
      ["2026-11-15", "Storage unit", -4400, 95600],
      ["2026-11-30", "fees", 23600, 119200],
      ["2026-12-01", "Tent hire deposit", -70000, 49200],
      ["2026-12-15", "Storage unit", -4400, 44800],
      ["2026-12-31", "fees", 16800, 61600],
      ["2027-01-15", "Storage unit", -4400, 57200],
      ["2027-01-15", "fees", 3500, 60700],
      ["2027-02-15", "Storage unit", -4400, 56300],
      ["2027-02-15", "Container", -20000, 36300],
      ["2027-03-15", "Storage unit", -4400, 31900],
      ["2027-03-31", "Tent hire balance", -32000, -100],
      ["2027-04-15", "Storage unit", -4400, -4500],
      [null, "fees_no_date", 5000, 500],
      [null, "budgets", -11500, -11000],
    ]);
    const nov = forecast.lines[1]!;
    expect(nov.kind === "fees" && nov.people.map((p) => p.name)).toEqual([
      "Caitlin",
      "Lerato",
      "Michael",
      "Thabo",
    ]);
    const last = forecast.lines[11]!;
    expect(last.kind === "bill" && last.leftAfter).toBe(0);
  });

  it("leaves out a member who asked for a subsidy, whatever they pledged", () => {
    const forecast = campForecast({
      balance: null,
      members: [member("Kim", 2000, "all_by_end_nov", { subsidy: true })],
      bills: [],
      budgetsUnspentCents: 0,
      burnYear: YEAR,
    });
    expect(forecast.feesExpectedCents).toBe(0);
    expect(forecast.lines).toEqual([]);
  });

  it("starts from nothing when no balance is typed yet", () => {
    const forecast = campForecast({
      balance: null,
      members: [],
      bills: [bill({ name: "Rent", amountCents: R(100) })],
      budgetsUnspentCents: 0,
      burnYear: YEAR,
    });
    expect(forecast.inBank).toBeNull();
    expect(forecast.moneyLeftCents).toBe(-R(100));
  });
});

describe("the camp money audit rows", () => {
  it("say what changed in words", () => {
    expect(auditDetail("dues.collecting_set", { cycle: 2027, on: true })).toBe(
      "On",
    );
    expect(
      auditDetail("camp_money.balance_recorded", {
        amountCents: R(100000),
        asOf: "2026-10-25",
      }),
    ).toMatch(/100.?000.*on 2026-10-25/);
    expect(
      auditDetail("camp_money.bill_paid", {
        name: "Storage unit",
        amountCents: R(4400),
        paidOn: "2026-11-14",
        index: 0,
      }),
    ).toMatch(/^Storage unit, R.*, 2026-11-14$/);
  });
});

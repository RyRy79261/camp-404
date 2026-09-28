import { beforeEach, describe, expect, it, vi } from "vitest";

// The Finance tools' actions (#240): only captains and Finance leads get past
// the gate, the Zod boundary says what is wrong, the actor's id is the only
// thing passed about who is acting, and the statement import reads the file
// in memory and writes nothing until a line is confirmed.

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/captain-gate", () => ({ captainActionGate: vi.fn() }));
vi.mock("@/lib/users", () => ({ getLeadTeams: vi.fn(async () => []) }));
vi.mock("@/lib/payments", () => ({
  ledgerCycle: vi.fn(async () => 2027),
  recordPayment: vi.fn(async () => ({
    id: "p9",
    reference: "C404-M017-2027-3",
  })),
  setPaymentStatus: vi.fn(async () => true),
}));
vi.mock("@/lib/dues", () => ({
  addCharge: vi.fn(async () => ({ ok: true, id: "c1" })),
  addFeeTier: vi.fn(async () => ({ ok: true, id: "t1" })),
  archiveFeeTier: vi.fn(async () => ({ ok: true })),
  cancelCharge: vi.fn(async () => ({ ok: true })),
  decideRefund: vi.fn(async () => ({ ok: true })),
  editFeeTier: vi.fn(async () => ({ ok: true })),
  publishSettleUp: vi.fn(async () => ({ ok: true, id: "s1", members: 3 })),
  requestRefund: vi.fn(async () => ({ ok: true, id: "r1" })),
  saveDuesYear: vi.fn(async () => ({ ok: true, version: 1 })),
  setFee: vi.fn(async () => ({ ok: true, id: "f1" })),
  setPaymentPlan: vi.fn(async () => ({ ok: true, version: 1 })),
  statementContext: vi.fn(async () => ({
    members: [
      { id: "m1", name: "Nova", refCode: "C404-M017" },
      { id: "m2", name: "Ash", refCode: null },
    ],
    payments: [],
  })),
}));

import { captainActionGate } from "@/lib/captain-gate";
import * as dues from "@/lib/dues";
import { recordPayment, setPaymentStatus } from "@/lib/payments";
import { getLeadTeams } from "@/lib/users";
import {
  addChargeAction,
  addFeeTierAction,
  confirmStatementLineAction,
  previewStatementAction,
  publishSettleUpAction,
  saveDuesYearAction,
  setFeeAction,
} from "./dues-actions";

const REFUSAL = "Payments are for captains and Finance leads.";
const TIER = "5f0c1b9e-6a55-4d2b-9d6f-3a1f2b3c4d5e";

function as(rank: "captain" | "team_lead", led: string[] = []) {
  vi.mocked(captainActionGate).mockResolvedValue({
    ok: true,
    campUser: { id: `${rank}-1` },
    rank,
  } as never);
  vi.mocked(getLeadTeams).mockResolvedValue(led);
}

function statement(text: string): FormData {
  const form = new FormData();
  form.set(
    "statement",
    new File([text], "statement.csv", { type: "text/csv" }),
  );
  return form;
}

beforeEach(() => {
  vi.clearAllMocks();
  as("captain");
});

/** Every write the Finance facade and the ledger offer. */
function writes() {
  return [
    dues.addCharge,
    dues.addFeeTier,
    dues.archiveFeeTier,
    dues.cancelCharge,
    dues.decideRefund,
    dues.editFeeTier,
    dues.publishSettleUp,
    dues.requestRefund,
    dues.saveDuesYear,
    dues.setFee,
    dues.setPaymentPlan,
    recordPayment,
    setPaymentStatus,
  ];
}

describe("who gets past the gate", () => {
  it("lets a Finance lead in, as themselves", async () => {
    as("team_lead", ["finance"]);
    expect(
      await addFeeTierAction({ label: "Base", amountCents: 150_000 }),
    ).toEqual({ ok: true, data: { id: "t1" } });
    expect(dues.addFeeTier).toHaveBeenCalledWith({
      label: "Base",
      amountCents: 150_000,
      cycle: 2027,
      actorId: "team_lead-1",
    });
  });

  it("turns away a lead of another team and writes nothing", async () => {
    as("team_lead", ["kitchen"]);
    const calls = [
      addFeeTierAction({ label: "Base", amountCents: 1 }),
      addChargeAction({
        userId: "m1",
        kind: "rental",
        description: "Tent",
        amountCents: 1,
      }),
      setFeeAction({
        userId: "m1",
        amountCents: 1,
        concessionReason: null,
        expectedFeeId: null,
      }),
      previewStatementAction(statement("Date,Amount\n2027-01-01,1")),
    ];
    for (const result of await Promise.all(calls)) {
      expect(result).toEqual({ ok: false, error: REFUSAL });
    }
    for (const write of writes()) expect(write).not.toHaveBeenCalled();
    expect(dues.statementContext).not.toHaveBeenCalled();
  });

  it("passes on the rank gate's own refusal", async () => {
    vi.mocked(captainActionGate).mockResolvedValue({
      ok: false,
      error: "Your account is still awaiting approval.",
    });
    expect(
      await saveDuesYearAction({
        deadline: null,
        fullRefundUntil: null,
        partialRefundUntil: null,
        partialRefundPct: null,
        expectedVersion: 0,
      }),
    ).toEqual({ ok: false, error: "Your account is still awaiting approval." });
    expect(captainActionGate).toHaveBeenCalledWith("team_lead", REFUSAL);
  });
});

describe("the Zod boundary", () => {
  it("says what is wrong and writes nothing", async () => {
    expect(await addFeeTierAction({ label: " ", amountCents: 100 })).toEqual({
      ok: false,
      error: "Give the tier a name.",
    });
    expect(
      await addChargeAction({
        userId: "m1",
        kind: "fee",
        description: "Sneaky second fee",
        amountCents: 100,
      }),
    ).toEqual({ ok: false, error: "Pick what the charge is for." });
    expect(
      await saveDuesYearAction({
        deadline: null,
        fullRefundUntil: "2027-02-01",
        partialRefundUntil: "2027-01-01",
        partialRefundPct: 50,
        expectedVersion: 0,
      }),
    ).toEqual({
      ok: false,
      error: "The partial refund must end after the full refund does.",
    });
    expect(
      await publishSettleUpAction({
        description: "Gas",
        totalCents: 10.5,
        direction: "top_up",
        skipConcessions: false,
        previewedUserIds: ["m1"],
      }),
    ).toEqual({
      ok: false,
      error: "Type an amount in rands, like 1250 or 1250,50.",
    });
    for (const write of writes()) expect(write).not.toHaveBeenCalled();
  });

  it("passes a concession's reason through, trimmed, and a blank one as none", async () => {
    await setFeeAction({
      userId: "m1",
      amountCents: 100_000,
      concessionReason: "  Student  ",
      expectedFeeId: TIER,
    });
    expect(dues.setFee).toHaveBeenLastCalledWith(
      expect.objectContaining({ concessionReason: "Student" }),
    );
    await setFeeAction({
      userId: "m1",
      amountCents: 100_000,
      concessionReason: "   ",
      expectedFeeId: null,
    });
    expect(dues.setFee).toHaveBeenLastCalledWith(
      expect.objectContaining({ concessionReason: null }),
    );
  });
});

describe("the bank statement import", () => {
  const CSV = [
    "Date,Description,Amount",
    "15/01/2027,EFT C404-M017 dues,1250.00",
    "16/01/2027,Card purchase,-99.00",
  ].join("\n");

  it("reads the file in memory and writes nothing at all", async () => {
    const res = await previewStatementAction(statement(CSV));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.proposals).toMatchObject([
      {
        date: "2027-01-15",
        amountCents: 125_000,
        member: { id: "m1", name: "Nova", refCode: "C404-M017" },
        pendingPaymentId: null,
        alreadyRecorded: false,
      },
    ]);
    expect(res.data.skippedOutgoing).toBe(1);
    // Only members with a reference are offered for a line named by hand.
    expect(res.data.members.map((m) => m.id)).toEqual(["m1"]);
    for (const write of writes()) expect(write).not.toHaveBeenCalled();
  });

  it("refuses an empty or oversized file, or one it cannot read", async () => {
    expect(await previewStatementAction(new FormData())).toEqual({
      ok: false,
      error: "Choose the statement file first.",
    });
    expect(
      await previewStatementAction(statement("x".repeat(512 * 1024 + 1))),
    ).toEqual({
      ok: false,
      error: "That file is too big. Download a shorter date range.",
    });
    const unreadable = await previewStatementAction(statement("a,b\n1,2"));
    expect(unreadable.ok).toBe(false);
    for (const write of writes()) expect(write).not.toHaveBeenCalled();
  });

  it("records a confirmed line as received, from the statement", async () => {
    expect(
      await confirmStatementLineAction({
        kind: "record",
        userId: "m1",
        amountCents: 125_000,
        paidOn: "2027-01-15",
        description: "EFT C404-M017 dues",
      }),
    ).toEqual({ ok: true, data: { reference: "C404-M017-2027-3" } });
    expect(recordPayment).toHaveBeenCalledExactlyOnceWith({
      userId: "m1",
      amountCents: 125_000,
      currency: "ZAR",
      status: "reconciled",
      note: "EFT C404-M017 dues",
      recordedByUserId: "captain-1",
      source: "statement",
      method: "bank_transfer",
      paidOn: "2027-01-15",
    });
  });

  it("marks the member's own pending payment received, as a compare-and-set", async () => {
    await confirmStatementLineAction({ kind: "reconcile", paymentId: "p1" });
    expect(setPaymentStatus).toHaveBeenCalledExactlyOnceWith({
      paymentId: "p1",
      from: "pending",
      to: "reconciled",
      actorId: "captain-1",
    });
    vi.mocked(setPaymentStatus).mockResolvedValueOnce(false);
    expect(
      await confirmStatementLineAction({ kind: "reconcile", paymentId: "p1" }),
    ).toEqual({
      ok: false,
      error: "That payment was already changed. Check the ledger.",
    });
    expect(recordPayment).not.toHaveBeenCalled();
  });
});

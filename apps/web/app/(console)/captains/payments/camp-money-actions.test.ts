import { beforeEach, describe, expect, it, vi } from "vitest";

// The camp fees sprint's Finance actions: only captains and Finance leads get
// past the gate, the Zod boundary says what is wrong, the actor's id is the
// only thing passed about who is acting, and a reminder that wrote notices
// delivers them at the action (no cron).

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/captain-gate", () => ({ captainActionGate: vi.fn() }));
vi.mock("@/lib/users", () => ({ getLeadTeams: vi.fn(async () => []) }));
vi.mock("@/lib/background-work", () => ({ deliverAfterResponse: vi.fn() }));
vi.mock("@/lib/payments", () => ({ ledgerCycle: vi.fn(async () => 2027) }));
vi.mock("@/lib/dues", () => ({
  setCollectingFees: vi.fn(async () => ({ ok: true, version: 2 })),
}));
vi.mock("@/lib/camp-money", () => ({
  addCampBill: vi.fn(async () => ({ ok: true, id: "b1" })),
  markCampBillPaid: vi.fn(async () => ({ ok: true, paidCount: 1 })),
  recordCampBalance: vi.fn(async () => ({ ok: true, id: "x" })),
  removeCampBill: vi.fn(async () => ({ ok: true })),
  saveCampBankDetails: vi.fn(async () => ({ ok: true, version: 1 })),
  updateCampBill: vi.fn(async () => ({ ok: true, version: 2 })),
}));
vi.mock("@/lib/fee-reminders", () => ({
  askForPledges: vi.fn(async () => ({ ok: true, asked: 2, notified: 0 })),
  remindFeesOwed: vi.fn(async () => ({
    ok: true,
    reminded: 3,
    notified: 3,
    posted: 1,
  })),
}));

import { toActor } from "@camp404/core";
import { deliverAfterResponse } from "@/lib/background-work";
import { captainActionGate } from "@/lib/captain-gate";
import { addCampBill } from "@/lib/camp-money";
import { askForPledges, remindFeesOwed } from "@/lib/fee-reminders";
import { getLeadTeams } from "@/lib/users";
import {
  addCampBillAction,
  askForPledgesAction,
  remindFeesOwedAction,
} from "./camp-money-actions";

const REFUSAL = "Only captains and Finance leads can do this.";

function as(rank: "captain" | "team_lead", led: string[] = []) {
  vi.mocked(captainActionGate).mockResolvedValue({
    ok: true,
    campUser: { id: `${rank}-1` },
    rank,
    actor: toActor(rank, led)!,
  } as never);
  vi.mocked(getLeadTeams).mockResolvedValue(led);
}

beforeEach(() => vi.clearAllMocks());

describe("camp money actions", () => {
  it("turns away a lead of another team before anything is read", async () => {
    as("team_lead", ["kitchen"]);
    expect(await remindFeesOwedAction({ postInTelegram: true })).toEqual({
      ok: false,
      error: REFUSAL,
    });
    expect(remindFeesOwed).not.toHaveBeenCalled();
  });

  it("reminds as the Finance lead, and delivers the notices now", async () => {
    as("team_lead", ["finance"]);
    expect(await remindFeesOwedAction({ postInTelegram: true })).toEqual({
      ok: true,
      data: { reminded: 3, notified: 3, posted: 1 },
    });
    expect(remindFeesOwed).toHaveBeenCalledWith({
      cycle: 2027,
      actorId: "team_lead-1",
      postInTelegram: true,
    });
    expect(deliverAfterResponse).toHaveBeenCalledOnce();
  });

  it("delivers nothing when an ask wrote no notice", async () => {
    as("captain");
    expect(await askForPledgesAction()).toEqual({
      ok: true,
      data: { asked: 2, notified: 0 },
    });
    expect(askForPledges).toHaveBeenCalledWith({
      cycle: 2027,
      actorId: "captain-1",
    });
    expect(deliverAfterResponse).not.toHaveBeenCalled();
  });

  it("says what is wrong with a bill and sends nothing", async () => {
    as("captain");
    const res = await addCampBillAction({
      name: "Container",
      payee: null,
      amountCents: 0,
      dueOn: "2027-02-15",
      repeat: "once",
      times: 1,
      planned: true,
    });
    expect(res).toEqual({
      ok: false,
      error: "The amount must be more than R0.",
    });
    expect(addCampBill).not.toHaveBeenCalled();
  });
});

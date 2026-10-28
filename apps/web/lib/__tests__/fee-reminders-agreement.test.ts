// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { REMINDERS_NEED_COLLECTING } from "@camp404/core";
import { NOT_A_MONEY_KEEPER } from "@camp404/db/dues";
import { useTestDb } from "../../../../packages/db/src/__tests__/_harness";
import { bothWays, YEAR } from "./_agreement";

// Camp fee reminders (the camp fees sprint), through lib/fee-reminders.ts, on
// the database and on the E2E store: who each button reaches and who is left
// out, the refusals, and that a second press never stacks a notice. Same
// people, same calls, same answers. See _agreement.ts.

const mode = vi.hoisted(() => ({ on: false }));
vi.mock("@/lib/test-mode", () => ({
  isE2ETestMode: () => mode.on,
  usesTestStore: () => mode.on,
  TEST_USER_COOKIE: "camp404_test_user",
}));

import { testStore } from "../test-store";
import { savePledge, setCollectingFees } from "../dues";
import {
  askForPledges,
  feeReminderPreview,
  remindFeesOwed,
} from "../fee-reminders";

const TODAY = "2026-10-28";

describe("fee reminders: the database and the test store agree", () => {
  const h = useTestDb();
  beforeEach(() => {
    mode.on = false;
    testStore.reset();
  });

  it("reaches the same people, refuses the same way, and never stacks", async () => {
    const { db, store } = await bothWays(mode, h, async (p, seed) => {
      await seed.participation(p.captain, "not_attending");
      await seed.participation(p.financeLead, "not_attending");
      await seed.participation(p.member, "accepted");
      await seed.participation(p.other, "maybe");
      await seed.participation(p.kitchenLead, "applied");
      await savePledge({
        userId: p.member,
        cycle: YEAR,
        pledge: {
          amountCents: 720_000,
          payBy: "part_by_end_nov",
          subsidy: false,
        },
      });
      await savePledge({
        userId: p.kitchenLead,
        cycle: YEAR,
        pledge: { amountCents: 0, payBy: null, subsidy: true },
      });
      const off = await remindFeesOwed({
        cycle: YEAR,
        actorId: p.captain,
        postInTelegram: false,
      });
      const notKeeper = await askForPledges({
        cycle: YEAR,
        actorId: p.member,
      });
      await setCollectingFees({
        cycle: YEAR,
        on: true,
        expectedVersion: 0,
        actorId: p.financeLead,
      });
      const preview = await feeReminderPreview(YEAR, TODAY);
      const asked = await askForPledges({ cycle: YEAR, actorId: p.captain });
      const askedAgain = await askForPledges({
        cycle: YEAR,
        actorId: p.captain,
      });
      const reminded = await remindFeesOwed({
        cycle: YEAR,
        actorId: p.financeLead,
        postInTelegram: true,
      });
      const remindedAgain = await remindFeesOwed({
        cycle: YEAR,
        actorId: p.financeLead,
        postInTelegram: true,
      });
      // Pledging answers the ask: nobody is left to ask.
      await savePledge({
        userId: p.other,
        cycle: YEAR,
        pledge: {
          amountCents: 300_000,
          payBy: "all_by_15_jan",
          subsidy: false,
        },
      });
      const afterPledge = await askForPledges({
        cycle: YEAR,
        actorId: p.captain,
      });
      return {
        off,
        notKeeper,
        preview,
        asked,
        askedAgain,
        reminded,
        remindedAgain,
        afterPledge,
      };
    });
    expect(db).toMatchObject({
      off: { ok: false, error: REMINDERS_NEED_COLLECTING },
      notKeeper: { ok: false, error: NOT_A_MONEY_KEEPER },
      preview: {
        collecting: true,
        remind: {
          reach: [
            {
              userId: "@member",
              name: "Nova",
              next: { kind: "due", dueOn: "2026-11-30", amountCents: 360_000 },
              owingCents: 720_000,
              telegram: false,
            },
          ],
          notComing: ["Cap", "Fin"],
          subsidy: ["Cook"],
        },
        ask: { reach: [{ userId: "@other", name: "Zed" }] },
        telegramPlaces: 0,
      },
      asked: { ok: true, asked: 1, notified: 1 },
      askedAgain: { ok: true, asked: 1, notified: 0 },
      reminded: { ok: true, reminded: 1, notified: 1, posted: 0 },
      remindedAgain: { ok: true, reminded: 1, notified: 0, posted: 0 },
      afterPledge: { ok: true, asked: 0, notified: 0 },
    });
    expect(store).toEqual(db);
  });
});

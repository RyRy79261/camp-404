// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useTestDb } from "../../../../packages/db/src/__tests__/_harness";
import { bothWays } from "./_agreement";

// A captain's reset link check (recordPasswordResetLink), through
// lib/password-reset.ts, on the database and on the E2E store: the same
// refusals in the same words. The success differs on purpose: the store keeps
// no sign-in email (and the agreement people have no Better Auth row on the
// database), so only who is refused is compared. See _agreement.ts.

const mode = vi.hoisted(() => ({ on: false }));
vi.mock("@/lib/test-mode", () => ({
  isE2ETestMode: () => mode.on,
  usesTestStore: () => mode.on,
  TEST_USER_COOKIE: "camp404_test_user",
}));

import { testStore } from "../test-store";
import { recordPasswordResetLink } from "../password-reset";

describe("password reset link: the database and the test store agree", () => {
  const h = useTestDb();
  beforeEach(() => {
    mode.on = false;
    testStore.reset();
  });

  it("refuses a lead and a member in the same words", async () => {
    const { db, store } = await bothWays(mode, h, async (p) => ({
      lead: await recordPasswordResetLink({
        actorId: p.financeLead,
        userId: p.member,
      }),
      member: await recordPasswordResetLink({
        actorId: p.member,
        userId: p.other,
      }),
    }));
    expect(db).toEqual({
      lead: { ok: false, error: "Only captains can send a reset link." },
      member: { ok: false, error: "Only captains can send a reset link." },
    });
    expect(store).toEqual(db);
  });
});

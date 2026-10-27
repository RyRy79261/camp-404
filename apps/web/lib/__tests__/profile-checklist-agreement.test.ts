// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useTestDb } from "../../../../packages/db/src/__tests__/_harness";
import { bothWays } from "./_agreement";

// "Your profile isn't finished" (step 6), through lib/profile-checklist.ts,
// on the database and on the E2E store: the same facts give the same lines.
// See _agreement.ts.

const mode = vi.hoisted(() => ({ on: false }));
vi.mock("@/lib/test-mode", () => ({
  isE2ETestMode: () => mode.on,
  usesTestStore: () => mode.on,
  TEST_USER_COOKIE: "camp404_test_user",
}));
// Ol' Jeb is not set up here, so the Connect line is left out on both sides.
vi.mock("../telegram", () => ({ telegramBotUsername: () => null }));

import { testStore } from "../test-store";
import { getProfileChecklist } from "../profile-checklist";
import { setDisplayName } from "../users";

describe("profile checklist: the database and the test store agree", () => {
  const h = useTestDb();
  beforeEach(() => {
    mode.on = false;
    testStore.reset();
  });

  it("lists the same gaps, ticks a fixed name, and gives an applicant none", async () => {
    const { db, store } = await bothWays(mode, h, async (p, seed) => {
      const before = await getProfileChecklist(p.member);
      await setDisplayName(p.other, "zed@example.com");
      const emailName = await getProfileChecklist(p.other);
      const applicant = await seed.user("Applicant", { approval: "pending" });
      return {
        before: before && {
          missing: before.missing,
          lines: before.items.map((i) => [i.key, i.done]),
        },
        emailNameMissing: emailName?.missing,
        applicant: await getProfileChecklist(applicant),
      };
    });
    expect(db).toEqual({
      before: {
        missing: 2,
        lines: [
          ["telegram_username", false],
          ["display_name", true],
          ["emergency_contact", false],
        ],
      },
      emailNameMissing: 3,
      applicant: null,
    });
    expect(store).toEqual(db);
  });
});

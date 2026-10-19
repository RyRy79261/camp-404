// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DIETARY_NOT_A_MEMBER } from "@camp404/db/dietary";
import * as schema from "@camp404/db/schema";
import { DIETS, FOOD_REACTIONS, KITCHEN_ALLERGENS } from "@camp404/types";
import { useTestDb } from "../../../../packages/db/src/__tests__/_harness";
import { bothWays } from "./_agreement";

// A member's own dietary needs (#245), through lib/dietary.ts, on the
// database and on the E2E store: the pick-list saved and read back, the old
// form's words read back as oldDietaryAnswer (@camp404/core) says, and the
// refusal for someone who is not a member. See _agreement.ts.

const mode = vi.hoisted(() => ({ on: false }));
vi.mock("@/lib/test-mode", () => ({
  isE2ETestMode: () => mode.on,
  usesTestStore: () => mode.on,
  TEST_USER_COOKIE: "camp404_test_user",
}));

import { testStore } from "../test-store";
import { dietaryTestStore } from "../test-store-dietary";
import { getMyDietary, saveMyDietary } from "../dietary";

const [NUTS, MILK] = KITCHEN_ALLERGENS;
const [SEVERE, MILD] = [FOOD_REACTIONS[0], FOOD_REACTIONS.at(-1)!];
const [VEGETARIAN] = DIETS;

describe("dietary needs: the database and the test store agree", () => {
  const h = useTestDb();
  beforeEach(() => {
    mode.on = false;
    testStore.reset();
  });

  it("saves and reads back a member's own pick-list and old words, and refuses a non-member", async () => {
    const { db, store } = await bothWays(mode, h, async (p, seed) => {
      // The old form's words, as the earlier form left them.
      const old = { allergies: "  shellfish ", isAnaphylactic: true };
      if (seed.side === "db") {
        await h
          .db()
          .insert(schema.dietaryRequirements)
          .values({
            userId: p.other,
            ...old,
            notes: "  ",
            version: "dietary-form@1",
          });
      } else {
        dietaryTestStore.seedOldAnswer(p.other, old);
      }
      const none = await getMyDietary(p.member);
      const saved = await saveMyDietary({
        userId: p.member,
        foods: [
          { food: NUTS!, reaction: SEVERE! },
          { food: MILK!, reaction: MILD },
        ],
        diets: [VEGETARIAN!],
      });
      const nobody = await saveMyDietary({
        userId: "00000000-0000-4000-8000-000000000000",
        foods: [],
        diets: [],
      });
      const notAnId = await saveMyDietary({
        userId: "not-an-id",
        foods: [],
        diets: [],
      });
      const mine = await getMyDietary(p.member);
      return {
        none,
        saved: { ok: saved.ok },
        nobody,
        notAnId,
        mine: { ...mine, savedAt: mine.savedAt !== null },
        other: await getMyDietary(p.other),
      };
    });
    expect(db).toMatchObject({
      none: { foods: [], diets: [], savedAt: null, old: null },
      saved: { ok: true },
      nobody: { ok: false, error: DIETARY_NOT_A_MEMBER },
      notAnId: { ok: false, error: DIETARY_NOT_A_MEMBER },
      mine: { diets: [VEGETARIAN], savedAt: true, old: null },
      other: {
        foods: [],
        old: { allergies: "shellfish", isAnaphylactic: true, notes: null },
      },
    });
    expect(store).toEqual(db);
  });
});
